#!/usr/bin/env python3
"""
concat_alarm_chains.py — merge per-chain CSV.GZ files into a single Parquet.

Mirrors the concatenation logic in modal_alarm_app.py::run_alarm_ensemble_on_modal
but runs locally (inside the Docker container) after all Rscript chains finish.

Usage:
    python3 concat_alarm_chains.py \
        --out-dir    /data/ensemble \
        --run-name   fdga_baseline_benchmarks_2601_house_alarm \
        --n-chains   10 \
        --map-rds    /data/maps/GA_sh_2020_map.rds \
        --district-col HDIST \
        --chamber    house
"""

import argparse
import json
import os
import subprocess
import sys
import time

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq


def extract_enacted_plan(map_rds: str, district_col: str, chamber: str, run_name: str) -> pa.Table:
    r_code = f"""
map <- readRDS("{map_rds}")
geoids <- as.character(map$GEOID)
dists  <- as.integer(map${district_col})
cat(paste(paste(geoids, dists, sep=","), collapse="\\n"), "\\n")
"""
    script_path = "/tmp/extract_enacted.R"
    with open(script_path, "w") as f:
        f.write(r_code)

    res = subprocess.run(
        ["Rscript", "--vanilla", script_path],
        capture_output=True, text=True, timeout=120,
    )
    if res.returncode != 0:
        print(f"[ERROR] Enacted extraction failed:\n{res.stderr}", file=sys.stderr)
        sys.exit(1)

    rows = [r.strip().split(",") for r in res.stdout.strip().splitlines() if r.strip()]
    geoids_enacted    = [r[0] for r in rows]
    districts_enacted = [int(r[1]) for r in rows]
    n_vtds = len(geoids_enacted)

    print(f"[concat] Enacted plan: {n_vtds} VTDs, district_col={district_col}")

    return pa.table({
        "plan_id":   pa.array([run_name] * n_vtds, type=pa.string()),
        "draw":      pa.array([0]        * n_vtds, type=pa.int32()),
        "geoid":     pa.array(geoids_enacted,      type=pa.string()),
        "district":  pa.array(districts_enacted,   type=pa.int32()),
        "geo_level": pa.array(["vtd"] * n_vtds,    type=pa.string()),
        "state":     pa.array(["GA"]  * n_vtds,    type=pa.string()),
        "chamber":   pa.array([chamber] * n_vtds,  type=pa.string()),
    })


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out-dir",      required=True)
    p.add_argument("--run-name",     required=True)
    p.add_argument("--n-chains",     type=int, required=True)
    p.add_argument("--map-rds",      required=True)
    p.add_argument("--district-col", default="HDIST")
    p.add_argument("--chamber",      default="house")
    p.add_argument("--keep-csvgz",   action="store_true",
                   help="Keep per-chain CSV.GZ files after merging (default: delete)")
    args = p.parse_args()

    t0 = time.time()

    # ── Enacted plan (draw=0) ─────────────────────────────────────────────────
    enacted_table = extract_enacted_plan(
        args.map_rds, args.district_col, args.chamber, args.run_name
    )
    _schema = enacted_table.schema

    # ── Per-chain CSV.GZ → Arrow tables ──────────────────────────────────────
    tables = [enacted_table]
    chain_paths = []

    for i in range(1, args.n_chains + 1):
        chain_path = os.path.join(args.out_dir, f"{args.run_name}_chain{i}_plans.csv.gz")
        if not os.path.exists(chain_path):
            print(f"[ERROR] Missing chain file: {chain_path}", file=sys.stderr)
            sys.exit(1)

        size_mb = os.path.getsize(chain_path) / 1_048_576
        print(f"[concat] Reading chain {i:2d}  ({size_mb:.1f} MB)  {chain_path}")

        df = pd.read_csv(chain_path, compression="gzip",
                         dtype={"draw": "int32", "district": "int32"})
        tables.append(pa.Table.from_pandas(df, preserve_index=False).cast(_schema))
        chain_paths.append(chain_path)

    # ── Concatenate & write Parquet ───────────────────────────────────────────
    final_table = pa.concat_tables(tables)
    final_path  = os.path.join(args.out_dir, f"{args.run_name}_plans.parquet")

    print(f"[concat] Writing {len(final_table):,} rows → {final_path}")
    pq.write_table(final_table, final_path, compression="snappy")

    size_mb  = os.path.getsize(final_path) / 1_048_576
    runtime  = time.time() - t0
    n_draws  = args.n_chains * (len(final_table) // args.n_chains) + 1  # approx

    # ── Meta JSON ────────────────────────────────────────────────────────────
    meta = {
        "run_name":        args.run_name,
        "benchmark_id":    "ga_house_2026_alarm",
        "algorithm":       "smc",
        "n_chains":        args.n_chains,
        "n_draws":         len(final_table),
        "chamber":         args.chamber,
        "district_col":    args.district_col,
        "map_rds":         args.map_rds,
        "runtime_seconds": round(runtime, 1),
        "plans_file":      final_path,
        "size_mb":         round(size_mb, 2),
    }
    meta_path = os.path.join(args.out_dir, f"{args.run_name}_meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"[concat] Meta: {meta_path}")
    print(f"[concat] Parquet: {final_path}  ({size_mb:.1f} MB)  in {runtime:.1f}s")

    # ── Clean up per-chain CSVs ───────────────────────────────────────────────
    if not args.keep_csvgz:
        for cp in chain_paths:
            os.unlink(cp)
            print(f"[concat] Removed {os.path.basename(cp)}")

    print("[concat] Done.")


if __name__ == "__main__":
    main()
