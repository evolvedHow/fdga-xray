"""
modal_alarm_app.py — ALARM/redist SMC ensemble compute on Modal.

Mirrors modal_app.py (GerryChain) but runs R instead of Python.
The base image is rocker/geospatial (R 4.x + spatial libs pre-installed)
with redist + arrow + jsonlite installed on top.

─── Usage ────────────────────────────────────────────────────────────────────

  One-time setup:
    1. pip install modal
    2. modal setup
    3. modal deploy modal_alarm_app.py

  Build a chamber's redist_map RDS (uploads raw inputs + builds in Modal):
    modal run modal_alarm_app.py::build_map --chamber senate
    modal run modal_alarm_app.py::build_map --chamber congress
    modal run modal_alarm_app.py::build_map --chamber house

    --no-upload   skip file upload (inputs already on volume)
    --upload-only upload files but skip the build

  Run an ensemble (blocking — waits for result):
    modal run modal_alarm_app.py::run_alarm_smc \\
        --run-name fdga_baseline_benchmarks_2601_senate_alarm

  Run congress ALARM:
    modal run modal_alarm_app.py::run_alarm_smc \\
        --run-name fdga_baseline_benchmarks_2601_congress_alarm \\
        --chamber congress --n-districts 14 --district-col cd_2020 \\
        --pop-tol 0.01 --map-rds-path /data/maps/GA_cd_2020_map.rds

  Check volume contents:
    modal run modal_alarm_app.py::list_volume

─── Volume layout ────────────────────────────────────────────────────────────

  Persistent volume "fdga-chain-data" (shared with GerryChain app):

    /alarm/           — congress ALARM map RDS (GA_cd_2020_map.rds)
    /maps/            — built chamber ALARM map RDS files:
                          GA_ss_2020_map.rds   — State Senate 56-district map
                          GA_sh_2020_map.rds   — State House 180-district map
    /raw/             — raw input files (uploaded once, reused forever):
                          ga_pl2020_vtd.zip    — 2020 Census VTD shapefile
                          shapefiles/congress/ — enacted congress district .shp
                          shapefiles/senate/   — enacted senate district .shp
                          shapefiles/house/    — enacted house district .shp
    /ensemble/        — plan parquets written by this app

─── Image notes ─────────────────────────────────────────────────────────────

  Base: modal.Image.debian_slim (Python pre-installed — required by Modal)
    apt packages: r-base, r-base-dev, GDAL/GEOS/PROJ/udunits2 dev libs

  R packages installed at image build time:
    sf          — spatial features (GDAL/GEOS/PROJ binding)
    redist      — ALARM SMC + ReCom sampler (Harvard/MGGG)
    jsonlite    — JSON serialization
    rmapshaper  — geometry simplification (ms_simplify keep=0.05)
    geomander   — Census BAF fetch for municipality-aware pseudo_county

  No arrow R package — chains write gzip CSV; Python (pyarrow/pandas) converts.
  Build time: ~5-8 min (no DuckDB compilation). After first build, cached.

  Why not rocker/geospatial? Modal requires a detectable Python installation
  in the image. rocker/* images have no Python, causing a deploy-time error.

"""

import subprocess
import sys
import tempfile
import time
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Persistent volume (shared with GerryChain modal_app.py)
# ---------------------------------------------------------------------------

data_volume = modal.Volume.from_name("fdga-chain-data", create_if_missing=True)

# ---------------------------------------------------------------------------
# R image — rocker/geospatial + redist + arrow
# ---------------------------------------------------------------------------

# R package repos — RSPM first for pre-built binaries, CRAN fallback.
# Ncpus=4 enables parallel make during compilation (cuts time ~3x on multi-core builders).
_R_SETUP = (
    "options("
    "repos=c("
    "RSPM='https://packagemanager.posit.co/cran/__linux__/bookworm/latest',"
    "CRAN='https://cloud.r-project.org'"
    "),"
    "Ncpus=4L"
    ")"
)

alarm_image = (
    # debian_slim gives Modal a detectable Python — rocker/* images have no Python.
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        # R runtime + compiler
        "r-base",
        "r-base-dev",
        # Geospatial system libs required by the sf R package (redist dependency)
        "libgdal-dev",
        "libgeos-dev",
        "libproj-dev",
        "libudunits2-dev",
        # Other R package build deps
        "libcurl4-openssl-dev",
        "libssl-dev",
        "libxml2-dev",
        "libfontconfig1-dev",
        "libuv1-dev",         # required by R 'fs' package (geomander dependency)
        "cmake",
        "make",
        "g++",
    )
    # Split into separate .run_commands() steps so Modal caches each layer
    # independently — each step gets its own timeout window (~30 min).
    #
    # Step 1: libgeos R package (bundles + compiles GEOS C++ — the slowest step).
    .run_commands(
        "R -e \""
        + _R_SETUP + ";"
        "install.packages('libgeos')"
        "\"",
    )
    # Step 2: sf spatial stack (uses system libgeos-dev + cached libgeos R pkg).
    .run_commands(
        "R -e \""
        + _R_SETUP + ";"
        "install.packages(c('sf','lwgeom'), dependencies=TRUE)"
        "\"",
    )
    # Step 3: redist (ALARM SMC sampler — C++ compilation, ~5-10 min).
    .run_commands(
        "R -e \""
        + _R_SETUP + ";"
        "install.packages('redist', dependencies=TRUE)"
        "\"",
    )
    # Step 4: remaining R packages (small, fast).
    .run_commands(
        "R -e \""
        + _R_SETUP + ";"
        "install.packages(c('jsonlite','rmapshaper','geomander'), dependencies=TRUE)"
        "\"",
    )
    # Python packages for writing Parquet output from the ensemble orchestrator
    .pip_install("pyarrow", "pandas")
    # Bake R scripts into the image — rebuilt only when file content changes
    .add_local_file(
        Path(__file__).parent / "scripts" / "run_alarm_ensemble.R",
        "/app/run_alarm_ensemble.R",
    )
    .add_local_file(
        Path(__file__).parent / "scripts" / "build_chamber_map.R",
        "/app/build_chamber_map.R",
    )
)

# ---------------------------------------------------------------------------
# Modal app
# ---------------------------------------------------------------------------

app = modal.App("fdga-alarm")

# ---------------------------------------------------------------------------
# Single SMC chain (on-demand, scaled to 4 CPU / 16 GB)
# ---------------------------------------------------------------------------

@app.function(
    image       = alarm_image,
    volumes     = {"/data": data_volume},
    cpu         = 4,
    memory      = 16384,         # 16 GB — redist SMC can be memory-intensive
    timeout     = 3600 * 8,      # 8-hour limit per chain (house 180D hard splits)
    retries     = 0,             # no automatic retry; orchestrator handles failures
)
def run_alarm_chain_modal(
    run_name: str,
    chain_idx: int,
    draw_offset: int,
    nsims: int,
    pop_tol: float,
    compactness: float,
    seed: int,
    chamber: str,
    n_districts: int,
    counties_col: str,
    map_rds_path: str = "/data/alarm/GA_cd_2020_map.rds",
) -> dict:
    """
    Run a single redist SMC chain inside a Modal container.
    Returns a summary dict with the output parquet path and timing.
    """
    import subprocess
    import time

    r_script   = "/app/run_alarm_ensemble.R"
    output_dir = "/data/ensemble"
    # R writes .csv.gz (no arrow needed); Python converts to parquet in orchestrator
    output_path = f"{output_dir}/{run_name}_chain{chain_idx}_plans.csv.gz"

    import os
    os.makedirs(output_dir, exist_ok=True)

    cmd = [
        "Rscript", "--vanilla", r_script,
        map_rds_path,
        output_path,
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

    print(f"[Modal chain {chain_idx}] Starting Rscript…")
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=False, text=True)
    elapsed = time.time() - t0

    if result.returncode != 0:
        raise RuntimeError(f"Rscript chain {chain_idx} failed (exit {result.returncode})")

    # Commit so the parquet is visible to the orchestrator
    data_volume.commit()

    return {
        "chain_idx":   chain_idx,
        "output_path": output_path,
        "elapsed_sec": round(elapsed, 1),
    }


# ---------------------------------------------------------------------------
# Orchestrator — parallelizes chains, concatenates results
# ---------------------------------------------------------------------------

@app.function(
    image   = alarm_image,
    volumes = {"/data": data_volume},
    cpu     = 2,
    memory  = 8192,
    timeout = 3600 * 5,   # outer timeout; chains run in parallel
)
def run_alarm_ensemble_on_modal(run_name: str, params: dict) -> dict:
    """
    Orchestrate multiple parallel SMC chains on Modal.

    Called by run_alarm_ensemble.py --modal.
    Returns a summary dict consumed by the CLI to print next steps.
    """
    import json
    import os
    import time

    import pandas as pd
    import pyarrow as pa
    import pyarrow.parquet as pq

    smc          = params.get("mcmc", {})
    nsims        = int(smc.get("nsims",        5000))
    n_chains     = int(smc.get("n_chains",     2))
    pop_tol      = float(smc.get("pop_epsilon", 0.01))
    compactness  = float(smc.get("compactness", 1.0))
    seed         = int(smc.get("random_seed",   42) or 0)
    counties_col = str(smc.get("counties_col",  "pseudo_county"))
    chamber      = params.get("chamber", {}).get("name", "congress")
    n_districts  = int(params.get("chamber", {}).get("n_districts", 14))
    district_col = params.get("chamber", {}).get("district_col", "cd_2020")
    # map_rds_path can be overridden per run; defaults to congress map for
    # backward compatibility. Senate runs should pass:
    #   params["map_rds_path"] = "/data/maps/GA_ss_2020_map.rds"
    map_rds_path = params.get("map_rds_path", "/data/alarm/GA_cd_2020_map.rds")

    if not os.path.exists(map_rds_path):
        # Determine chamber from path for a helpful hint
        _CHAMBER_HINT = {
            "/data/alarm/GA_cd_2020_map.rds": "congress",
            "/data/maps/GA_ss_2020_map.rds":  "senate",
            "/data/maps/GA_sh_2020_map.rds":  "house",
        }
        chamber_hint = _CHAMBER_HINT.get(map_rds_path, "senate")
        raise FileNotFoundError(
            f"Map RDS not found at {map_rds_path}.\n"
            f"Build it first (no local R install needed):\n"
            f"  modal run modal_alarm_app.py::build_map --chamber {chamber_hint}"
        )

    print(f"[ALARM orchestrator] run_name={run_name}")
    print(f"  {n_chains} chains × {nsims:,} plans = {n_chains * nsims:,} total")
    t_start = time.time()

    # ── Launch chains in parallel via .starmap() ──────────────────────────────
    chain_args = [
        (
            run_name, chain_i, (chain_i - 1) * nsims,
            nsims, pop_tol, compactness, seed,
            chamber, n_districts, counties_col, map_rds_path,
        )
        for chain_i in range(1, n_chains + 1)
    ]

    chain_results = list(
        run_alarm_chain_modal.starmap(chain_args)
    )

    print(f"[ALARM orchestrator] All {n_chains} chains complete.")

    # ── Prepend enacted plan (extracted from map RDS via R) ───────────────────
    print(f"[ALARM orchestrator] Extracting enacted plan (col={district_col})…")
    r_code = f"""
map <- readRDS("{map_rds_path}")
geoids <- as.character(map$GEOID)
dists  <- as.integer(map${district_col})
cat(paste(paste(geoids, dists, sep=","), collapse="\\n"), "\\n")
"""
    with open("/tmp/extract_enacted.R", "w") as f:
        f.write(r_code)

    import subprocess
    res = subprocess.run(
        ["Rscript", "--vanilla", "/tmp/extract_enacted.R"],
        capture_output=True, text=True, timeout=120,
    )
    if res.returncode != 0:
        raise RuntimeError(f"Enacted extraction failed:\n{res.stderr}")

    rows = [r.strip().split(",") for r in res.stdout.strip().splitlines() if r.strip()]
    geoids_enacted    = [r[0] for r in rows]
    districts_enacted = [int(r[1]) for r in rows]
    n_vtds = len(geoids_enacted)

    enacted_table = pa.table({
        "plan_id":   pa.array([run_name] * n_vtds, type=pa.string()),
        "draw":      pa.array([0]        * n_vtds, type=pa.int32()),
        "geoid":     pa.array(geoids_enacted,      type=pa.string()),
        "district":  pa.array(districts_enacted,   type=pa.int32()),
        "geo_level": pa.array(["vtd"] * n_vtds,   type=pa.string()),
        "state":     pa.array(["GA"]  * n_vtds,   type=pa.string()),
        "chamber":   pa.array([chamber] * n_vtds,  type=pa.string()),
    })

    # ── Concatenate: enacted + all chains ─────────────────────────────────────
    # Reload volume so this container sees files committed by the chain containers
    data_volume.reload()

    # Schema for all chain tables must match enacted_table exactly.
    _schema = enacted_table.schema

    tables = [enacted_table]
    for cr in chain_results:
        # Chains write .csv.gz (no arrow in R); convert to arrow table here
        df_chain = pd.read_csv(cr["output_path"], compression="gzip",
                               dtype={"draw": "int32", "district": "int32"})
        tables.append(pa.Table.from_pandas(df_chain, preserve_index=False).cast(_schema))

    final_table = pa.concat_tables(tables)
    final_path  = f"/data/ensemble/{run_name}_plans.parquet"

    pq.write_table(final_table, final_path, compression="snappy")

    # Clean up per-chain temp csv.gz files
    for cr in chain_results:
        try:
            os.unlink(cr["output_path"])
        except OSError:
            pass

    data_volume.commit()

    runtime   = time.time() - t_start
    size_mb   = os.path.getsize(final_path) / 1_048_576
    n_draws   = n_chains * nsims + 1   # +1 for enacted

    # Write meta JSON alongside the parquet
    meta = {
        "run_name":        run_name,
        "benchmark_id":    params.get("benchmark_id"),
        "algorithm":       "smc",
        "n_chains":        n_chains,
        "nsims_per_chain": nsims,
        "n_draws":         n_draws,
        "n_vtds":          n_vtds,
        "pop_tol":         pop_tol,
        "compactness":     compactness,
        "seed":            seed,
        "runtime_seconds": round(runtime, 1),
        "plans_file":      final_path,
        "size_mb":         round(size_mb, 2),
    }
    with open(f"/data/ensemble/{run_name}_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    data_volume.commit()

    return {
        "status":          "completed",
        "n_draws":         n_draws,
        "runtime_minutes": round(runtime / 60, 1),
        "plans_file":      final_path,
        "size_mb":         round(size_mb, 2),
    }


# ---------------------------------------------------------------------------
# Map builder — runs build_chamber_map.R inside the cached alarm_image
# ---------------------------------------------------------------------------

# Chamber defaults: (n_districts, district_col, pop_tol, shp_subdir, shp_stem)
_CHAMBER_DEFAULTS = {
    "congress": (14,  "cd_2020", 0.01, "congress", "Congress-2023 shape"),
    "senate":   (56,  "SDIST",   0.01, "senate",   "Senate-2023 shape file"),
    "house":    (180, "HDIST",   0.01, "house",     "House-2023 shape"),
}

@app.function(
    image   = alarm_image,
    volumes = {"/data": data_volume},
    cpu     = 4,
    memory  = 8192,
    timeout = 3600,          # 1 h should be plenty for any chamber
)
def build_chamber_map_rds(
    chamber:      str,
    n_districts:  int,
    district_col: str,
    pop_tol:      float,
    shp_subdir:   str,   # subdirectory under /data/raw/shapefiles/
    shp_stem:     str,   # filename stem (no extension) of the .shp file
) -> str:
    """
    Build a redist_map RDS for the given chamber inside Modal.

    Reads inputs from the persistent volume (/data/raw/), writes output to
    /data/maps/GA_{chamber_short}_2020_map.rds, and returns the output path.

    Call via the build_map local entrypoint — don't invoke directly.
    """
    import subprocess, os

    vtd_zip      = "/data/raw/ga_pl2020_vtd.zip"
    district_shp = f"/data/raw/shapefiles/{shp_subdir}/{shp_stem}.shp"
    short        = {"congress": "cd", "senate": "ss", "house": "sh"}.get(chamber, chamber[:2])
    out_rds      = f"/data/maps/GA_{short}_2020_map.rds"

    for path in [vtd_zip, district_shp]:
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Required input not found on volume: {path}\n"
                f"Upload it first:\n"
                f"  modal run modal_alarm_app.py::build_map --chamber {chamber} --upload-only"
            )

    print(f"[build_chamber_map] chamber={chamber}  n_districts={n_districts}")
    print(f"  vtd_zip      = {vtd_zip}")
    print(f"  district_shp = {district_shp}")
    print(f"  out_rds      = {out_rds}")

    result = subprocess.run(
        [
            "Rscript", "--vanilla", "/app/build_chamber_map.R",
            vtd_zip, district_shp, out_rds,
            str(n_districts), district_col, str(pop_tol),
        ],
        capture_output=False,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"build_chamber_map.R failed (exit {result.returncode})")

    data_volume.commit()
    size_mb = os.path.getsize(out_rds) / 1_048_576
    print(f"[build_chamber_map] Done → {out_rds}  ({size_mb:.1f} MB)")
    return out_rds


# ---------------------------------------------------------------------------
# CLI entrypoint — upload raw inputs once, then build any chamber's RDS
#
# Usage:
#   # Senate (first time — uploads shapefiles + VTD zip then builds):
#   modal run modal_alarm_app.py::build_map --chamber senate
#
#   # Skip upload if files already on volume:
#   modal run modal_alarm_app.py::build_map --chamber senate --no-upload
#
#   # Upload only (no build):
#   modal run modal_alarm_app.py::build_map --chamber senate --upload-only
#
#   # Congress (for when the map needs to be rebuilt):
#   modal run modal_alarm_app.py::build_map --chamber congress
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def build_map(
    chamber:     str  = "senate",
    upload:      bool = True,    # upload raw inputs to volume
    upload_only: bool = False,   # upload but skip build (useful for pre-staging)
) -> None:
    """
    Upload raw district shapefiles to the Modal volume, then build the
    redist_map RDS for the given chamber using the cached alarm_image.

    The R packages (sf, redist) are already baked into the alarm_image —
    no local R install required.  After the first image build, subsequent
    runs reuse the cached image instantly.
    """
    if chamber not in _CHAMBER_DEFAULTS:
        raise ValueError(f"Unknown chamber '{chamber}'. Choose from: {list(_CHAMBER_DEFAULTS)}")

    n_districts, district_col, pop_tol, shp_subdir, shp_stem = _CHAMBER_DEFAULTS[chamber]

    repo_root = Path(__file__).parent.parent  # fgdp/
    raw_dir   = Path(__file__).parent / "data" / "raw"

    if upload:
        # VTD zip lives in fdp/data/raw/boundaries/ (the FDP canonical data location)
        vtd_zip  = repo_root / "fdp" / "data" / "raw" / "boundaries" / "ga_pl2020_vtd.zip"
        shp_exts = [".shp", ".dbf", ".prj", ".shx"]
        shp_files = [(raw_dir / f"{shp_stem}{ext}") for ext in shp_exts]

        missing = [p for p in [vtd_zip] + shp_files if not p.exists()]
        if missing:
            raise FileNotFoundError(
                "Local source files not found:\n" +
                "\n".join(f"  {p}" for p in missing)
            )

        print(f"Uploading raw inputs for '{chamber}' to Modal volume…")
        with data_volume.batch_upload(force=True) as batch:
            batch.put_file(str(vtd_zip), "/raw/ga_pl2020_vtd.zip")
            print(f"  ✓ {vtd_zip.name} → /raw/ga_pl2020_vtd.zip  ({vtd_zip.stat().st_size / 1024 / 1024:.1f} MB)")
            for shp_path in shp_files:
                remote = f"/raw/shapefiles/{shp_subdir}/{shp_path.name}"
                batch.put_file(str(shp_path), remote)
                print(f"  ✓ {shp_path.name} → {remote}")
        print("Upload complete.")

    if upload_only:
        print("--upload-only: skipping map build.")
        return

    print(f"\nBuilding redist_map RDS for '{chamber}' on Modal…")
    out_rds = build_chamber_map_rds.remote(
        chamber      = chamber,
        n_districts  = n_districts,
        district_col = district_col,
        pop_tol      = pop_tol,
        shp_subdir   = shp_subdir,
        shp_stem     = shp_stem,
    )
    print(f"\n✓ RDS built on Modal volume: {out_rds}")
    print(f"  Ready to run ensemble:")
    print(f"    modal run modal_alarm_app.py::run_alarm_smc \\")
    print(f"        --run-name fdga_baseline_benchmarks_2601_{chamber}_alarm \\")
    if chamber != "senate":
        print(f"        --chamber {chamber} ...")


# ---------------------------------------------------------------------------
# Utility — inspect volume contents
# ---------------------------------------------------------------------------

@app.function(
    image   = alarm_image,
    volumes = {"/data": data_volume},
)
def list_volume() -> None:
    """Print the contents of the fdga-chain-data volume under /alarm, /maps, and /ensemble."""
    import os
    for subdir in ["/data/alarm", "/data/maps", "/data/ensemble"]:
        print(f"\n{subdir}/")
        if not os.path.exists(subdir):
            print("  (empty)")
            continue
        for fname in sorted(os.listdir(subdir)):
            fpath = os.path.join(subdir, fname)
            size  = os.path.getsize(fpath) / 1_048_576
            print(f"  {fname}  ({size:.1f} MB)")


# ---------------------------------------------------------------------------
# CLI entrypoint — run an ALARM SMC ensemble for any chamber
#
# Usage examples:
#
#   Senate (default):
#     modal run modal_alarm_app.py::run_alarm_smc \
#         --run-name senate_alarm_v1
#
#   Congress (override defaults):
#     modal run modal_alarm_app.py::run_alarm_smc \
#         --run-name congress_alarm_v2 \
#         --chamber congress --n-districts 14 --district-col cd_2020 \
#         --pop-tol 0.01 \
#         --map-rds-path /data/alarm/GA_cd_2020_map.rds
#
#   Quick test (100 plans, 1 chain):
#     modal run modal_alarm_app.py::run_alarm_smc \
#         --run-name senate_test --nsims 100 --n-chains 1
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def run_alarm_smc(
    run_name:     str,
    chamber:      str   = "senate",
    n_districts:  int   = 56,
    district_col: str   = "SDIST",
    nsims:        int   = 10000,
    n_chains:     int   = 5,
    pop_tol:      float = 0.05,
    compactness:  float = 1.0,
    seed:         int   = 42,
    counties_col: str   = "pseudo_county",
    map_rds_path: str   = "/data/maps/GA_ss_2020_map.rds",
) -> None:
    """
    Dispatch an ALARM redist SMC ensemble to Modal (blocking).

    Assembles a params dict matching the BenchmarkConfig structure and calls
    run_alarm_ensemble_on_modal.  Use --map-rds-path to point at a different
    chamber's RDS already uploaded to the volume.
    """
    params = {
        "benchmark_id": run_name,
        "chamber": {
            "name":         chamber,
            "n_districts":  n_districts,
            "district_col": district_col,
        },
        "mcmc": {
            "algorithm":    "smc",
            "nsims":        nsims,
            "n_chains":     n_chains,
            "pop_epsilon":  pop_tol,
            "compactness":  compactness,
            "random_seed":  seed,
            "counties_col": counties_col,
        },
        "map_rds_path": map_rds_path,
    }

    total_plans = nsims * n_chains
    print(f"\n{'='*60}")
    print(f"ALARM SMC  →  Modal (blocking)")
    print(f"  run_name    : {run_name}")
    print(f"  chamber     : {chamber}  ({n_districts} districts)")
    print(f"  nsims       : {nsims:,} × {n_chains} chains = {total_plans:,} plans")
    print(f"  pop_tol     : ±{pop_tol*100:.1f}%")
    print(f"  compactness : {compactness}")
    print(f"  seed        : {seed}")
    print(f"  map_rds     : {map_rds_path}")
    print(f"{'='*60}\n")
    print("Waiting for Modal run to complete…  (Ctrl-C to detach)\n")

    try:
        result = run_alarm_ensemble_on_modal.remote(run_name, params)
    except KeyboardInterrupt:
        print("\nDetached (run continues on Modal).")
        print(f"  Check: modal run modal_alarm_app.py::list_volume")
        return

    print(f"\n{'='*60}")
    print(f"COMPLETE: {run_name}")
    print(f"  n_draws  : {result.get('n_draws'):,}")
    print(f"  runtime  : {result.get('runtime_minutes')} min")
    print(f"  plans    : {result.get('plans_file')}")
    print(f"  size     : {result.get('size_mb')} MB")
    print(f"{'='*60}")
    print(f"\nDownload plans:")
    print(f"  modal volume get fdga-chain-data /ensemble/{run_name}_plans.parquet .")
    print(f"\nScore plans:")
    print(f"  uv run python fdp/scripts/score_ensemble_plans.py \\")
    print(f"      --run-name {run_name} \\")
    print(f"      --config fdp/configs/benchmarks/ga_{chamber}_2026_alarm.yml")
