"""
modal_app.py — Deploy fdga-chain (API + ensemble compute) to Modal.

─── Two deployable surfaces ───────────────────────────────────────────────────

  1. API  (always-on, warm container)
       Serves the FastAPI redistricting data API.
       Deploy:  modal deploy modal_app.py
       URL:     printed after deploy, e.g. https://evolvedhow--fdga-chain-api.modal.run

  2. Ensemble compute  (on-demand, runs only when triggered)
       Runs GerryChain MCMC chains on Modal CPUs.
       Multiple chains execute in parallel automatically.
       No idle cost — you only pay while the chain runs.
       Trigger:
         a) CLI (blocking):    uv run python scripts/run_ensemble.py --run-name foo --modal
         b) CLI (fire+forget): uv run python scripts/run_ensemble.py --run-name foo --modal-async
         c) API endpoint:      POST /api/ensemble/runs/modal  (requires X-FDP-Secret header)

─── Volume layout ─────────────────────────────────────────────────────────────

  Persistent volume "fdga-chain-data" mounted at /data inside every container:

    /data/graphs/       — pre-built GerryChain dual graphs (ga_{chamber}.json)  [required for ensemble]
    /data/ensemble/     — plan assignment parquet files written by ensemble runs  [written by Modal]
    /data/ensembles/    — legacy per-chamber ensemble metrics (read by API)
    /data/states/       — config.json per state (read by API)
    /data/raw/          — enacted district shapefiles (read by API map endpoints)

─── One-time setup ────────────────────────────────────────────────────────────

  1. Install Modal:
       pip install modal

  2. Authenticate:
       modal setup

  3. Create secrets:
       # Mapbox token (for map endpoints)
       modal secret create fdga-chain-secrets MAPBOX_TOKEN=pk.eyJ1...

  4. Upload data to the volume:
       python scripts/upload_to_modal.py        # uploads graphs, ensembles, raw shapefiles

  5. Deploy:
       modal deploy modal_app.py

─── Day-to-day ───────────────────────────────────────────────────────────────

  Run an ensemble on Modal (blocking — waits for result):
    uv run python scripts/run_ensemble.py --run-name congress_v1 --modal

  Run async (fire and forget — check fdp.ensemble_runs for status):
    uv run python scripts/run_ensemble.py --run-name congress_v1 --modal-async

  Override any YAML param and run on Modal:
    uv run python scripts/run_ensemble.py \\
        --run-name congress_test \\
        --n-steps 500 --algorithm reversible_recom \\
        --modal

  Re-deploy after code changes:
    modal deploy modal_app.py

  Check volume contents:
    modal run modal_app.py::list_volume

  List ensemble runs catalog:
    modal run modal_app.py::list_runs

"""

import modal

# ---------------------------------------------------------------------------
# Volumes
# ---------------------------------------------------------------------------

data_volume = modal.Volume.from_name("fdga-chain-data", create_if_missing=True)

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------

_SECRETS = [
    modal.Secret.from_name("fdga-chain-secrets"),  # MAPBOX_TOKEN etc.
]

# ---------------------------------------------------------------------------
# Image — API server (lean, no scripts needed)
# ---------------------------------------------------------------------------

# All PyPI-installable dependencies (fdp is a local package — excluded here;
# Modal doesn't need it because params are fully resolved before dispatch).
_PYPI_DEPS = [
    "fastapi>=0.135.3",
    "fiona>=1.10.1",
    "geopandas>=1.1.3",
    "gerrychain>=0.3.2",
    "numpy>=1.26",
    "pandas>=2.0",
    "psycopg[binary]>=3.1",
    "pyarrow>=14.0",
    "pygris>=0.1",
    "pyproj>=3.6",
    "python-dotenv>=1.0",
    "pyyaml>=6.0",
    "shapely>=2.0",
    "uvicorn[standard]>=0.29",
]

api_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgdal-dev", "gdal-bin", "libspatialindex-dev")
    .pip_install(_PYPI_DEPS)
    .add_local_dir("api",             remote_path="/root/api")
    .add_local_file("pyproject.toml", remote_path="/root/pyproject.toml")
)

# ---------------------------------------------------------------------------
# Image — Ensemble compute (heavier: includes scripts/ for GerryChain runner)
# ---------------------------------------------------------------------------

ensemble_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgdal-dev", "gdal-bin", "libspatialindex-dev")
    .pip_install(_PYPI_DEPS)
    .add_local_dir("scripts",         remote_path="/root/scripts")
    .add_local_file("pyproject.toml", remote_path="/root/pyproject.toml")
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = modal.App("fdga-chain")

# ---------------------------------------------------------------------------
# API surface  (always-on, keep_warm=1 avoids cold starts)
# ---------------------------------------------------------------------------

@app.function(
    image   = api_image,
    volumes = {"/data": data_volume},
    cpu     = 2,
    memory  = 4096,
    timeout = 600,
    min_containers = 1,
    secrets = _SECRETS,
)
@modal.asgi_app()
def api():
    import os
    import sys
    os.chdir("/")
    sys.path.insert(0, "/root")
    from api.main import app as fastapi_app
    return fastapi_app


# ---------------------------------------------------------------------------
# Ensemble compute — single chain
#
# Runs one MCMC chain, writes plan assignments to the volume, returns the
# volume path of the output file.  Called by run_ensemble_on_modal, either
# once (n_chains=1) or in parallel via starmap (n_chains>1).
# ---------------------------------------------------------------------------

@app.function(
    image   = ensemble_image,
    volumes = {"/data": data_volume},
    cpu     = 4,
    memory  = 8192,
    timeout = 14400,      # 4 hours per chain — sufficient for House (180D)
    secrets = _SECRETS,
)
def run_single_chain_modal(
    run_name:  str,
    chain_idx: int,
    params:    dict,
) -> str:
    """
    Run one MCMC chain on Modal.

    Writes chain-specific plan assignments to the volume at:
        /data/ensemble/{run_name}_chain{chain_idx}_plans.parquet

    Returns the volume path of the written file.
    """
    import os
    import sys
    sys.path.insert(0, "/root")
    os.chdir("/")

    import numpy as np
    import pyarrow as pa
    import pyarrow.parquet as pq

    from scripts.run_ensemble import run_chain
    from gerrychain import Graph

    DISTRICT_COLS = {"house": "HDIST", "senate": "SDIST", "congress": "CDIST"}

    mcmc     = params["mcmc"]
    chamber  = params["chamber"]
    geo      = params["geography"]

    # Graph is in the volume at /data/graphs/
    graph_path = f"/data/graphs/ga_{chamber['name']}.json"
    if not os.path.exists(graph_path):
        raise FileNotFoundError(
            f"Graph not found at {graph_path}. "
            f"Upload it first: python scripts/upload_to_modal.py"
        )

    print(f"[chain {chain_idx}] Loading graph from {graph_path}")
    graph = Graph.from_json(graph_path)

    # Resolve seed — each chain gets a different seed derived from the base seed
    seed = mcmc.get("random_seed")
    if seed is not None:
        seed = seed + chain_idx

    dist_col = DISTRICT_COLS.get(chamber["name"], "CDIST")
    sample_attrs = graph.nodes[next(iter(graph.nodes()))]
    if dist_col not in sample_attrs:
        fallbacks = [
            k for k in sample_attrs
            if chamber["name"][:3].upper() in k.upper() and "DIST" in k.upper()
        ]
        if fallbacks:
            dist_col = fallbacks[0]
        else:
            raise ValueError(
                f"District column '{dist_col}' not found in graph. "
                f"Available: {list(sample_attrs.keys())}"
            )

    plan_matrix, node_order = run_chain(
        graph        = graph,
        pop_column   = chamber["pop_column"],
        district_col = dist_col,
        n_steps      = mcmc["n_steps"],
        burn_in      = mcmc["burn_in"],
        epsilon      = mcmc["pop_epsilon"],
        algo         = mcmc["algorithm"],
        seed         = seed,
    )

    # Build GEOID map
    geoid_attr = next(
        (a for a in ["GEOID20", "GEOID", "geoid", "GEOID10"]
         if a in sample_attrs),
        None,
    )
    geoid_map = (
        {n: str(graph.nodes[n][geoid_attr]) for n in graph.nodes()}
        if geoid_attr
        else {n: str(n) for n in graph.nodes()}
    )

    # Serialize to parquet
    n_draws, n_nodes = plan_matrix.shape
    geoids     = np.array([geoid_map.get(n, str(n)) for n in node_order])
    total_rows = n_draws * n_nodes

    table = pa.table({
        "plan_id":   pa.array([run_name]          * total_rows, type=pa.string()),
        "draw":      pa.array(np.repeat(np.arange(1, n_draws + 1, dtype=np.int32), n_nodes), type=pa.int32()),
        "geoid":     pa.array(np.tile(geoids, n_draws),         type=pa.string()),
        "district":  pa.array(plan_matrix.flatten().astype(np.int32), type=pa.int32()),
        "geo_level": pa.array([geo["geo_level"]]  * total_rows, type=pa.string()),
        "state":     pa.array([geo["state"]]       * total_rows, type=pa.string()),
        "chamber":   pa.array([chamber["name"]]    * total_rows, type=pa.string()),
    })

    out_dir  = "/data/ensemble"
    os.makedirs(out_dir, exist_ok=True)
    out_path = f"{out_dir}/{run_name}_chain{chain_idx}_plans.parquet"

    pq.write_table(table, out_path, compression="zstd")
    size_mb = os.path.getsize(out_path) / 1_048_576
    print(f"[chain {chain_idx}] Written {n_draws:,} draws → {out_path}  ({size_mb:.1f} MB)")

    # Commit so other Modal functions can see the file immediately
    data_volume.commit()
    return out_path


# ---------------------------------------------------------------------------
# Ensemble compute — orchestrator
#
# This is the entry point triggered from run_ensemble.py --modal.
# It manages the catalog, runs chains (in parallel for n_chains > 1),
# concatenates results, and updates Supabase.
# ---------------------------------------------------------------------------

@app.function(
    image   = ensemble_image,
    volumes = {"/data": data_volume},
    cpu     = 2,
    memory  = 4096,
    timeout = 86400,   # 24 hours — orchestration overhead, not compute
    secrets = _SECRETS,
)
def run_ensemble_on_modal(run_name: str, params: dict) -> dict:
    """
    Orchestrate a full benchmark ensemble run on Modal.

    Called from run_ensemble.py with --modal (blocking) or --modal-async (fire+forget).

    Flow
    ----
    1. Register run in Supabase catalog (status=running)
    2. Run n_chains in parallel using run_single_chain_modal.starmap()
    3. Concatenate plan files, re-number draws sequentially
    4. Write final {run_name}_plans.parquet to volume
    5. Clean up per-chain temp files
    6. Update Supabase catalog (status=completed / failed)
    7. Return summary dict
    """
    import os
    import sys
    import json
    import time
    import datetime
    sys.path.insert(0, "/root")
    os.chdir("/")

    import pyarrow as pa
    import pyarrow.parquet as pq

    from scripts.run_ensemble import catalog_write_start, catalog_write_end  # psycopg only, no fdp

    mcmc      = params["mcmc"]
    chamber   = params["chamber"]["name"]
    n_chains  = mcmc.get("n_chains", 1)
    out_dir   = "/data/ensemble"
    os.makedirs(out_dir, exist_ok=True)
    plans_path = f"{out_dir}/{run_name}_plans.parquet"
    meta_path  = f"{out_dir}/{run_name}_meta.json"

    print(f"\n{'='*60}")
    print(f"MODAL ENSEMBLE RUN: {run_name}")
    print(f"  chamber  : {chamber}")
    print(f"  algorithm: {mcmc['algorithm']}")
    print(f"  steps    : {mcmc['n_steps']:,}  burn_in={mcmc['burn_in']:,}")
    print(f"  chains   : {n_chains}")
    print(f"{'='*60}\n")

    catalog_write_start(run_name, params.get("benchmark_id", "unknown"), params)
    start = time.time()

    try:
        # Run chains — parallel for n_chains > 1, single call otherwise
        if n_chains > 1:
            print(f"Running {n_chains} chains in parallel on Modal…")
            # Collect results individually so one chain failure doesn't kill all chains.
            chain_paths = []
            for result in run_single_chain_modal.starmap(
                [(run_name, i, params) for i in range(n_chains)],
                return_exceptions=True,
            ):
                if isinstance(result, Exception):
                    print(f"  WARNING: a chain failed — {type(result).__name__}: {result}")
                else:
                    chain_paths.append(result)
            if not chain_paths:
                raise RuntimeError("All chains failed — no usable draws produced.")
            print(f"  {len(chain_paths)}/{n_chains} chains succeeded.")
        else:
            print("Running 1 chain on Modal…")
            chain_paths = [run_single_chain_modal.remote(run_name, 0, params)]

        # Reload volume to see files written by sub-functions
        data_volume.reload()

        # Concatenate chain parquets and re-number draws sequentially
        print(f"\nConcatenating {len(chain_paths)} chain file(s)…")
        tables    = []
        draw_offset = 0

        for path in chain_paths:
            if not os.path.exists(path):
                print(f"  WARNING: chain file not found: {path} — skipping")
                continue
            tbl    = pq.read_table(path)
            draws  = tbl.column("draw").to_pylist()
            max_d  = max(draws)
            # Re-number: add offset so draws are globally unique
            new_draws = [d + draw_offset for d in draws]
            draw_offset += max_d
            tbl = tbl.set_column(
                tbl.schema.get_field_index("draw"),
                "draw",
                pa.array(new_draws, type=pa.int32()),
            )
            tables.append(tbl)

        combined   = pa.concat_tables(tables)
        total_rows = combined.num_rows
        n_draws    = draw_offset
        n_vtds     = total_rows // n_draws if n_draws > 0 else 0

        pq.write_table(combined, plans_path, compression="zstd")
        size_mb = os.path.getsize(plans_path) / 1_048_576

        # Clean up per-chain temp files
        for path in chain_paths:
            try:
                os.remove(path)
            except OSError:
                pass

        # Write meta JSON
        runtime = time.time() - start
        meta = {
            **params,
            "ran_at":          datetime.datetime.now().isoformat(timespec="seconds"),
            "runtime_seconds": round(runtime, 1),
            "n_draws":         n_draws,
            "n_vtds":          n_vtds,
            "n_chains_run":    n_chains,
            "plans_file":      plans_path,
        }
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2, default=str)

        data_volume.commit()

        summary = {
            "run_name":        run_name,
            "status":          "completed",
            "n_draws":         n_draws,
            "n_vtds":          n_vtds,
            "n_chains":        n_chains,
            "runtime_minutes": round(runtime / 60, 1),
            "plans_file":      plans_path,
            "size_mb":         round(size_mb, 1),
        }

        print(f"\n{'='*60}")
        print(f"COMPLETE: {run_name}")
        print(f"  {n_draws:,} draws | {n_vtds:,} VTDs | {runtime/60:.1f} min | {size_mb:.1f} MB")
        print(f"  Plans: {plans_path}")
        print(f"{'='*60}")

        catalog_write_end(
            run_name,
            status          = "completed",
            n_draws         = n_draws,
            n_vtds          = n_vtds,
            n_chains_run    = n_chains,
            runtime_seconds = runtime,
            plans_file      = plans_path,
        )

        return summary

    except Exception as exc:
        runtime = time.time() - start
        print(f"\nERROR after {runtime/60:.1f} min: {exc}")
        catalog_write_end(
            run_name,
            status          = "failed",
            runtime_seconds = runtime,
            error_message   = str(exc),
        )
        raise


# ---------------------------------------------------------------------------
# Utility: list volume contents
# Usage:  modal run modal_app.py::list_volume
# ---------------------------------------------------------------------------

@app.function(
    image   = api_image,
    volumes = {"/data": data_volume},
    timeout = 60,
)
def list_volume():
    """Print everything in the data volume with sizes."""
    import os
    from pathlib import Path

    data_dir = Path("/data")
    if not data_dir.exists() or not any(data_dir.iterdir()):
        print("Volume /data is empty. Run: python scripts/upload_to_modal.py")
        return

    total_bytes = 0
    for root, dirs, files in os.walk(data_dir):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for f in sorted(files):
            fpath = Path(root) / f
            size  = fpath.stat().st_size
            total_bytes += size
            rel   = fpath.relative_to(data_dir)
            print(f"  {str(rel):<70}  {size/1024:>8.1f} kB")

    print(f"\n  Total: {total_bytes/1024/1024:.1f} MB")


# ---------------------------------------------------------------------------
# Utility: list ensemble runs
# Usage:  modal run modal_app.py::list_runs
# ---------------------------------------------------------------------------

@app.function(
    image   = ensemble_image,
    volumes = {"/data": data_volume},
    timeout = 60,
    secrets = _SECRETS,
)
def list_runs():
    """Print the ensemble run catalog from Supabase and local volume files."""
    import os

    print("\n── Volume ensemble files ──────────────────────────────")
    ens_dir = "/data/ensemble"
    if os.path.exists(ens_dir):
        for f in sorted(os.listdir(ens_dir)):
            fpath = os.path.join(ens_dir, f)
            size_mb = os.path.getsize(fpath) / 1_048_576
            print(f"  {f:<60}  {size_mb:>6.1f} MB")
    else:
        print("  (no files in /data/ensemble yet)")

    print("\n── Supabase run catalog ──────────────────────────────")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("  DATABASE_URL not set — skipping catalog query")
        return
    try:
        import psycopg
        import psycopg.rows
        with psycopg.connect(db_url, row_factory=psycopg.rows.dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT run_name, status, chamber, algorithm, n_steps, "
                    "burn_in, n_draws, runtime_minutes, started_at "
                    "FROM fdp.v_ensemble_runs LIMIT 20"
                )
                rows = cur.fetchall()
        if not rows:
            print("  (no runs in catalog yet)")
            return
        header = f"  {'run_name':<40} {'status':<12} {'chamber':<10} {'draws':>6} {'min':>6}"
        print(header)
        print("  " + "-" * 80)
        for r in rows:
            print(
                f"  {str(r['run_name']):<40} "
                f"{str(r['status']):<12} "
                f"{str(r['chamber'] or ''):<10} "
                f"{str(r['n_draws'] or '—'):>6} "
                f"{str(r['runtime_minutes'] or '—'):>6}"
            )
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR reading catalog: {exc}")
