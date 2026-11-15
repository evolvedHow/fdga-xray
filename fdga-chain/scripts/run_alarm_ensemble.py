"""
run_alarm_ensemble.py — Config-driven ALARM/redist SMC ensemble runner.

Mirrors run_ensemble.py for GerryChain but dispatches to R (redist_smc)
instead of Python (GerryChain ReCom).

Every parameter comes from a YAML benchmark config (mcmc.algorithm must be "smc").
CLI flags override YAML values.  Only --run-name is mandatory.

Usage
-----
# Minimal — run locally using local Rscript:
    uv run python scripts/run_alarm_ensemble.py --run-name congress_alarm_v1

# With explicit config:
    uv run python scripts/run_alarm_ensemble.py \\
        --run-name congress_alarm_v1 \\
        --config ../fdp/configs/benchmarks/ga_congress_2026_alarm.yml

# Dispatch to Modal (blocking — waits for completion):
    uv run python scripts/run_alarm_ensemble.py \\
        --run-name congress_alarm_v1 \\
        --modal

# Override params on the fly:
    uv run python scripts/run_alarm_ensemble.py \\
        --run-name alarm_quick_test \\
        --nsims 100 --n-chains 1 \\
        --modal

# Dry run — print resolved config and exit:
    uv run python scripts/run_alarm_ensemble.py \\
        --run-name debug \\
        --dry-run

Output (written to config.output.dir)
--------------------------------------
  {run_name}_plans.parquet    — long-format VTD→district, same schema as GerryChain
  {run_name}_meta.json        — resolved params + runtime summary

Plans parquet schema (identical to GerryChain output)
------------------------------------------------------
  plan_id   TEXT    — equals --run-name
  draw      INT32   — 1-indexed (enacted plan prepended as draw=0 after all chains)
  geoid     TEXT    — VTD GEOID20 (11-char)
  district  INT32   — district number (1-indexed)
  geo_level TEXT    — vtd
  state     TEXT    — GA
  chamber   TEXT    — congress | senate | house

One-time setup for Modal
-------------------------
  1. Install modal:  pip install modal
  2. Authenticate:   modal setup
  3. Deploy app:     modal deploy modal_alarm_app.py
  4. Upload map RDS to the volume:
       modal volume put fdga-chain-data \\
           fdensemble/dataverse_files/GA_cd_2020/GA_cd_2020_map.rds \\
           /alarm/GA_cd_2020_map.rds
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from concurrent.futures import ThreadPoolExecutor, as_completed

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT  = SCRIPT_DIR.parent.parent           # fgdp/
FDP_ROOT   = REPO_ROOT / "fdp"

ALARM_R_SCRIPT = SCRIPT_DIR / "run_alarm_ensemble.R"

DEFAULT_ALARM_MAP = (
    REPO_ROOT / "fdensemble" / "dataverse_files" / "GA_cd_2020" / "GA_cd_2020_map.rds"
)

DEFAULT_CONFIG = FDP_ROOT / "configs" / "benchmarks" / "ga_congress_2026_alarm.yml"

# Default volume paths for each chamber's map RDS on Modal
MODAL_MAP_PATHS: dict[str, str] = {
    "congress": "/data/alarm/GA_cd_2020_map.rds",
    "senate":   "/data/maps/GA_ss_2020_map.rds",
    "house":    "/data/maps/GA_sh_2020_map.rds",    # placeholder for future house map
}
MODAL_MAP_PATH = MODAL_MAP_PATHS["congress"]  # kept for backward compatibility


# ---------------------------------------------------------------------------
# Lazy BenchmarkConfig import (fdp package in sibling directory)
# ---------------------------------------------------------------------------

def _load_benchmark_config():
    try:
        from fdp.benchmark_config import BenchmarkConfig
        return BenchmarkConfig
    except ImportError:
        if str(FDP_ROOT) not in sys.path:
            sys.path.insert(0, str(FDP_ROOT))
        from fdp.benchmark_config import BenchmarkConfig
        return BenchmarkConfig


# ---------------------------------------------------------------------------
# Enacted plan extraction (local, via Rscript)
# ---------------------------------------------------------------------------

def _extract_enacted_plan(map_rds: Path, district_col: str) -> tuple[list[str], list[int]]:
    """
    Run a tiny R snippet to extract GEOIDs and enacted district assignments
    from the redist_map RDS.  Returns (geoids, districts) as Python lists.
    """
    r_code = f"""
map <- readRDS("{map_rds}")
geoids    <- as.character(map$GEOID)
districts <- as.integer(map${district_col})
cat(paste(paste(geoids, districts, sep=","), collapse="\\n"), "\\n")
"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".R", delete=False) as f:
        f.write(r_code)
        r_script = f.name

    try:
        result = subprocess.run(
            ["Rscript", "--vanilla", r_script],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeError(f"R extraction failed:\n{result.stderr}")
        rows = [r.strip().split(",") for r in result.stdout.strip().splitlines() if r.strip()]
        geoids    = [r[0] for r in rows]
        districts = [int(r[1]) for r in rows]
        print(f"  Extracted {len(geoids)} GEOIDs + enacted assignments from {map_rds.name}")
        return geoids, districts
    finally:
        Path(r_script).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Build enacted-plan parquet rows
# ---------------------------------------------------------------------------

def _build_enacted_rows(
    geoids: list[str],
    districts: list[int],
    run_name: str,
    chamber: str,
) -> pa.Table:
    """Return a one-draw parquet table for the enacted plan (draw=0)."""
    n = len(geoids)
    return pa.table({
        "plan_id":   pa.array([run_name] * n,  type=pa.string()),
        "draw":      pa.array([0]        * n,  type=pa.int32()),
        "geoid":     pa.array(geoids,          type=pa.string()),
        "district":  pa.array(districts,       type=pa.int32()),
        "geo_level": pa.array(["vtd"]    * n,  type=pa.string()),
        "state":     pa.array(["GA"]     * n,  type=pa.string()),
        "chamber":   pa.array([chamber]  * n,  type=pa.string()),
    })


# ---------------------------------------------------------------------------
# Local single-chain runner (calls Rscript)
# ---------------------------------------------------------------------------

def run_chain_local(
    *,
    map_rds: Path,
    output_path: Path,
    chain_idx: int,
    draw_offset: int,
    nsims: int,
    pop_tol: float,
    compactness: float,
    seed: int,
    run_name: str,
    chamber: str,
    n_districts: int,
    counties_col: str,
) -> dict:
    """Run one SMC chain locally via Rscript.  Returns result summary dict."""
    import os
    if not ALARM_R_SCRIPT.exists():
        raise FileNotFoundError(f"R script not found: {ALARM_R_SCRIPT}")

    # --vanilla skips .Renviron so R_LIBS_USER is lost; pass it explicitly
    env = os.environ.copy()
    r_libs_user = str(Path.home() / "R" / "library")
    existing = env.get("R_LIBS_USER", "")
    env["R_LIBS_USER"] = f"{r_libs_user}:{existing}" if existing else r_libs_user

    cmd = [
        "Rscript", "--vanilla", str(ALARM_R_SCRIPT),
        str(map_rds),
        str(output_path),
        str(chain_idx),
        str(draw_offset),
        str(nsims),
        str(pop_tol),
        str(compactness),
        str(seed),
        run_name,
        chamber,
        str(n_districts),
        counties_col,
    ]

    print(f"\n[chain {chain_idx}] Starting Rscript…")
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=False, text=True, env=env)
    elapsed = time.time() - t0

    if result.returncode != 0:
        raise RuntimeError(f"Rscript chain {chain_idx} failed (exit {result.returncode})")

    return {"chain_idx": chain_idx, "elapsed_sec": round(elapsed, 1)}


# ---------------------------------------------------------------------------
# Modal dispatch
# ---------------------------------------------------------------------------

def _run_on_modal(
    run_name: str,
    params: dict,
    config_path: Path,
    async_mode: bool = False,
) -> None:
    try:
        import modal
    except ImportError:
        print("ERROR: modal is not installed.  Install with: pip install modal")
        print("       Then authenticate: modal setup")
        sys.exit(1)

    smc = params.get("mcmc", {})
    print(f"\nDispatching ALARM to Modal  ({'async' if async_mode else 'blocking'})…")
    print(f"  run_name  : {run_name}")
    print(f"  benchmark : {params.get('benchmark_id')}")
    print(f"  chamber   : {params.get('chamber', {}).get('name')}")
    print(f"  nsims     : {smc.get('nsims'):,} per chain")
    print(f"  n_chains  : {smc.get('n_chains')}")
    print(f"  total     : {smc.get('nsims', 0) * smc.get('n_chains', 1):,} plans")
    print()

    try:
        fn = modal.Function.from_name("fdga-alarm", "run_alarm_ensemble_on_modal")
    except Exception as e:
        print("ERROR: Could not find Modal function 'run_alarm_ensemble_on_modal' in app 'fdga-alarm'.")
        print("  Deploy it first: modal deploy modal_alarm_app.py")
        print(f"  Detail: {e}")
        sys.exit(1)

    if async_mode:
        call = fn.spawn(run_name, params)
        print(f"Run submitted to Modal (async).")
        print(f"  Call ID: {call.object_id}")
        print(f"\nCheck status:")
        print(f"  modal run modal_alarm_app.py::list_volume")
    else:
        print("Waiting for Modal run to complete…  (Ctrl-C to detach)\n")
        try:
            result = fn.remote(run_name, params)
            print(f"\nModal ALARM run complete:")
            print(f"  status    : {result.get('status')}")
            print(f"  draws     : {result.get('n_draws'):,}")
            print(f"  runtime   : {result.get('runtime_minutes')} min")
            print(f"  plans file: {result.get('plans_file')}")
            print(f"  size      : {result.get('size_mb')} MB")
            print(f"\nNext step — download + score:")
            print(f"  modal volume get fdga-chain-data /ensemble/{run_name}_plans.parquet .")
            print(f"  uv run python fdp/scripts/score_ensemble_plans.py \\")
            print(f"      --run-name {run_name} \\")
            print(f"      --config {config_path}")
        except KeyboardInterrupt:
            print("\nDetached (run continues on Modal).")
            print(f"  Check: modal run modal_alarm_app.py::list_volume")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run an ALARM/redist SMC ensemble benchmark.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--run-name", required=True,
                        help="Unique run identifier (used as plan_id and file prefix)")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG),
                        help=f"Path to benchmark YAML (default: ga_congress_2026_alarm.yml)")
    parser.add_argument("--map-rds", default=None,
                        help="Path to local map RDS (default: fdensemble/dataverse_files/…)")
    parser.add_argument("--modal-map-rds", default=None,
                        help="Volume path for map RDS on Modal (default: inferred from chamber)")

    # SMC overrides
    parser.add_argument("--nsims",        type=int,   default=None,
                        help="Plans per chain (overrides YAML mcmc.nsims)")
    parser.add_argument("--n-chains",     type=int,   default=None,
                        help="Independent chains (overrides YAML mcmc.n_chains)")
    parser.add_argument("--pop-epsilon",  type=float, default=None,
                        help="Population tolerance (overrides YAML mcmc.pop_epsilon)")
    parser.add_argument("--compactness",  type=float, default=None,
                        help="Compactness weight (overrides YAML mcmc.compactness)")
    parser.add_argument("--seed",         type=int,   default=None,
                        help="Random seed (overrides YAML mcmc.random_seed; 0 = no seed)")

    # Execution mode
    parser.add_argument("--modal",        action="store_true",
                        help="Dispatch to Modal (blocking)")
    parser.add_argument("--modal-async",  action="store_true",
                        help="Dispatch to Modal (fire-and-forget)")
    parser.add_argument("--dry-run",      action="store_true",
                        help="Print resolved config and exit without running")
    parser.add_argument("--no-enacted",   action="store_true",
                        help="Skip prepending the enacted plan as draw=0")
    parser.add_argument("--parallel",     type=int, default=1, metavar="N",
                        help="Run N chains concurrently (default: 1 = sequential)")

    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"ERROR: config not found: {config_path}")
        sys.exit(1)

    # Load config
    BenchmarkConfig = _load_benchmark_config()
    cfg = BenchmarkConfig.from_yaml(config_path)

    smc = cfg.mcmc
    if smc.algorithm != "smc":
        print(f"ERROR: config mcmc.algorithm is '{smc.algorithm}', expected 'smc'.")
        print("  Use run_ensemble.py for GerryChain (recom/reversible_recom).")
        sys.exit(1)

    # Apply CLI overrides
    nsims       = args.nsims       if args.nsims       is not None else smc.effective_nsims()
    n_chains    = args.n_chains    if args.n_chains    is not None else smc.n_chains
    pop_tol     = args.pop_epsilon if args.pop_epsilon is not None else (smc.pop_epsilon or cfg.chamber.pop_epsilon)
    compactness = args.compactness if args.compactness is not None else smc.compactness
    seed        = args.seed        if args.seed        is not None else (smc.random_seed or 0)

    counties_col = smc.counties_col or "pseudo_county"

    map_rds = Path(args.map_rds) if args.map_rds else DEFAULT_ALARM_MAP
    chamber = cfg.chamber.name
    n_districts = cfg.chamber.n_districts
    district_col = cfg.chamber.district_col or "cd_2020"

    # Modal map path — inferred from chamber name if not overridden
    modal_map_rds = args.modal_map_rds or MODAL_MAP_PATHS.get(chamber, MODAL_MAP_PATHS["congress"])

    out_dir = cfg.output_dir()
    run_name = args.run_name

    # Resolved params dict (passed to Modal or printed for dry-run)
    params = cfg.to_params_dict()
    params["mcmc"]["nsims"]       = nsims
    params["mcmc"]["n_chains"]    = n_chains
    params["mcmc"]["pop_epsilon"] = pop_tol
    params["mcmc"]["compactness"] = compactness
    params["mcmc"]["random_seed"] = seed
    params["mcmc"]["counties_col"] = counties_col
    params["map_rds_path"]        = modal_map_rds

    if args.dry_run:
        print(f"\nDry run — resolved config for '{run_name}':")
        print(json.dumps(params, indent=2, default=str))
        print(f"\nTotal plans   : {nsims} × {n_chains} chains = {nsims * n_chains:,}")
        print(f"Output dir    : {out_dir}")
        print(f"Map RDS (local): {map_rds}")
        print(f"Map RDS (Modal): {modal_map_rds}")
        return

    # Modal dispatch
    if args.modal or args.modal_async:
        _run_on_modal(run_name, params, config_path, async_mode=args.modal_async)
        return

    # ── Local execution ───────────────────────────────────────────────────────
    if not map_rds.exists():
        print(f"ERROR: map RDS not found: {map_rds}")
        sys.exit(1)

    out_dir.mkdir(parents=True, exist_ok=True)
    chain_parquets: list[Path] = []
    t_start = time.time()

    print(f"\nRunning ALARM SMC locally:")
    print(f"  run_name  : {run_name}")
    print(f"  nsims     : {nsims:,} per chain × {n_chains} chains = {nsims * n_chains:,} plans")
    print(f"  pop_tol   : ±{pop_tol*100:.1f}%")
    print(f"  compactness: {compactness}")
    print(f"  seed      : {seed}")

    # R writes .csv.gz (no arrow dependency); we convert to arrow here
    chain_csvgz: list[Path] = []
    parallel_workers = max(1, args.parallel)

    def _run_chain_task(chain_i: int) -> dict:
        draw_offset = (chain_i - 1) * nsims
        out_path = out_dir / f"{run_name}_chain{chain_i}_plans.csv.gz"
        run_chain_local(
            map_rds      = map_rds,
            output_path  = out_path,
            chain_idx    = chain_i,
            draw_offset  = draw_offset,
            nsims        = nsims,
            pop_tol      = pop_tol,
            compactness  = compactness,
            seed         = seed,
            run_name     = run_name,
            chamber      = chamber,
            n_districts  = n_districts,
            counties_col = counties_col,
        )
        return {"chain_idx": chain_i, "out_path": out_path}

    if parallel_workers > 1:
        print(f"\nRunning {n_chains} chains with {parallel_workers} concurrent workers…")
        results = [None] * n_chains
        with ThreadPoolExecutor(max_workers=parallel_workers) as pool:
            futures = {pool.submit(_run_chain_task, i): i for i in range(1, n_chains + 1)}
            for fut in as_completed(futures):
                r = fut.result()
                results[r["chain_idx"] - 1] = r
    else:
        results = [_run_chain_task(i) for i in range(1, n_chains + 1)]

    chain_csvgz = [r["out_path"] for r in results]

    # ── Concatenate chains + prepend enacted ──────────────────────────────────
    print(f"\nConcatenating {n_chains} chain csv.gz file(s)…")
    tables: list[pa.Table] = []

    if not args.no_enacted:
        print(f"  Extracting enacted plan from {map_rds.name} (col={district_col})…")
        geoids, enacted_districts = _extract_enacted_plan(map_rds, district_col)
        enacted_tbl = _build_enacted_rows(geoids, enacted_districts, run_name, chamber)
        tables.append(enacted_tbl)
    else:
        enacted_tbl = None

    _schema = tables[0].schema if tables else None
    for p in chain_csvgz:
        df = pd.read_csv(str(p), compression="gzip",
                         dtype={"draw": "int32", "district": "int32"})
        tbl = pa.Table.from_pandas(df, preserve_index=False)
        if _schema is not None:
            tbl = tbl.cast(_schema)
        elif enacted_tbl is None:
            _schema = tbl.schema
        tables.append(tbl)

    final_table = pa.concat_tables(tables)
    final_path  = out_dir / f"{run_name}_plans.parquet"

    pq.write_table(final_table, str(final_path), compression="zstd")
    size_mb = final_path.stat().st_size / 1_048_576
    n_draws = final_table.column("draw").unique().to_pylist().__len__()
    runtime = time.time() - t_start

    # Clean up per-chain temp csv.gz files
    for p in chain_csvgz:
        p.unlink(missing_ok=True)

    # Write meta JSON
    meta = {
        "run_name":        run_name,
        "benchmark_id":    cfg.benchmark_id,
        "algorithm":       "smc",
        "n_chains":        n_chains,
        "nsims_per_chain": nsims,
        "n_draws":         n_draws,
        "n_vtds":          final_table.num_rows // n_draws if n_draws else 0,
        "pop_tol":         pop_tol,
        "compactness":     compactness,
        "seed":            seed,
        "runtime_seconds": round(runtime, 1),
        "plans_file":      str(final_path),
        "size_mb":         round(size_mb, 2),
        "completed_at":    datetime.datetime.utcnow().isoformat(),
    }
    meta_path = out_dir / f"{run_name}_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))

    print(f"\n✓  Plans saved: {final_path.name}  ({size_mb:.1f} MB)")
    print(f"   Total draws : {n_draws:,}  (including enacted as draw=0)")
    print(f"   Runtime     : {runtime/60:.1f} min")
    print(f"\nNext steps — score the plans:")
    print(f"  uv run python fdp/scripts/score_ensemble_plans.py \\")
    print(f"      --run-name {run_name} \\")
    print(f"      --config {config_path}")


if __name__ == "__main__":
    main()
