#!/usr/bin/env bash
# run_house_alarm_docker.sh — GA House ALARM SMC ensemble orchestrator
#
# Runs inside the fdga-alarm Docker container.
# Launches N_CHAINS Rscript jobs in parallel (with a concurrency cap),
# then merges all per-chain CSV.GZ files into a single Parquet.
#
# Environment overrides (all have defaults):
#   RUN_NAME        default: fdga_baseline_benchmarks_2601_house_alarm
#   NSIMS           plans per chain  (default: 500 → 5,000 total with 10 chains)
#   N_CHAINS        default: 10
#   MAX_PARALLEL    max simultaneous Rscript processes (default: N_CHAINS)
#   POP_TOL         default: 0.01
#   COMPACTNESS     default: 1.0
#   SEED            default: 42
#   MAP_RDS         default: /data/maps/GA_sh_2020_map.rds
#   OUT_DIR         default: /data/ensemble

set -euo pipefail

RUN_NAME="${RUN_NAME:-fdga_baseline_benchmarks_2601_house_alarm}"
NSIMS="${NSIMS:-500}"
N_CHAINS="${N_CHAINS:-10}"
MAX_PARALLEL="${MAX_PARALLEL:-${N_CHAINS}}"
POP_TOL="${POP_TOL:-0.01}"
COMPACTNESS="${COMPACTNESS:-1.0}"
SEED="${SEED:-42}"
CHAMBER="house"
N_DISTRICTS="180"
COUNTIES_COL="pseudo_county"
MAP_RDS="${MAP_RDS:-/data/maps/GA_sh_2020_map.rds}"
OUT_DIR="${OUT_DIR:-/data/ensemble}"

echo "═══════════════════════════════════════════════════════"
echo " ALARM House SMC  |  ${N_CHAINS} chains × ${NSIMS} plans = $(( N_CHAINS * NSIMS )) total"
echo " run_name  : ${RUN_NAME}"
echo " map_rds   : ${MAP_RDS}"
echo " out_dir   : ${OUT_DIR}"
echo " max_par   : ${MAX_PARALLEL}"
echo "═══════════════════════════════════════════════════════"

if [[ ! -f "${MAP_RDS}" ]]; then
    echo "[ERROR] Map RDS not found: ${MAP_RDS}"
    echo "        Download from Modal volume:"
    echo "        modal volume get fdga-chain-data /maps/GA_sh_2020_map.rds ./data/maps/"
    exit 1
fi

mkdir -p "${OUT_DIR}"

T_START=$(date +%s)

# ── Launch chains with concurrency cap ────────────────────────────────────────
pids=()
active=0

for i in $(seq 1 "${N_CHAINS}"); do
    DRAW_OFFSET=$(( (i - 1) * NSIMS ))
    OUTPUT="${OUT_DIR}/${RUN_NAME}_chain${i}_plans.csv.gz"

    echo "[chain ${i}/${N_CHAINS}] Starting  draw_offset=${DRAW_OFFSET}  output=$(basename ${OUTPUT})"

    Rscript --vanilla /app/run_alarm_ensemble.R \
        "${MAP_RDS}" \
        "${OUTPUT}" \
        "${i}" \
        "${DRAW_OFFSET}" \
        "${NSIMS}" \
        "${POP_TOL}" \
        "${COMPACTNESS}" \
        "${SEED}" \
        "${RUN_NAME}" \
        "${CHAMBER}" \
        "${N_DISTRICTS}" \
        "${COUNTIES_COL}" \
        > "${OUT_DIR}/${RUN_NAME}_chain${i}.log" 2>&1 &

    pids+=($!)
    active=$(( active + 1 ))

    # Wait for a slot if we've hit the concurrency cap
    if (( active >= MAX_PARALLEL )); then
        wait "${pids[0]}"
        status=$?
        if (( status != 0 )); then
            echo "[ERROR] Chain job failed (PID ${pids[0]}, exit ${status})"
            echo "        Check log: ${OUT_DIR}/${RUN_NAME}_chain?.log"
            exit 1
        fi
        pids=("${pids[@]:1}")
        active=$(( active - 1 ))
    fi
done

# Wait for remaining chains
for pid in "${pids[@]}"; do
    wait "${pid}"
    status=$?
    if (( status != 0 )); then
        echo "[ERROR] A chain job failed (PID ${pid}, exit ${status})"
        exit 1
    fi
done

T_CHAINS=$(date +%s)
echo ""
echo "[OK] All ${N_CHAINS} chains complete in $(( T_CHAINS - T_START ))s"
echo ""

# ── Merge CSV.GZ → Parquet ────────────────────────────────────────────────────
echo "[merge] Concatenating chains → ${RUN_NAME}_plans.parquet"

python3 /app/concat_alarm_chains.py \
    --out-dir    "${OUT_DIR}" \
    --run-name   "${RUN_NAME}" \
    --n-chains   "${N_CHAINS}" \
    --map-rds    "${MAP_RDS}" \
    --district-col "HDIST" \
    --chamber    "${CHAMBER}"

T_END=$(date +%s)
echo ""
echo "═══════════════════════════════════════════════════════"
echo " Done in $(( T_END - T_START ))s total"
echo " Output: ${OUT_DIR}/${RUN_NAME}_plans.parquet"
echo "═══════════════════════════════════════════════════════"
