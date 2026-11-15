#!/usr/bin/env bash
# start_alarm_smc.sh — Wait for build_map to finish then launch both ALARM SMC runs
#
# Usage: bash start_alarm_smc.sh [watch_pid]
#   watch_pid: PID of build_map process to wait for (default: auto-detect)
#
# Logs:
#   ~/congress_alarm_smc.log
#   ~/senate_alarm_smc.log

set -e
cd "$(dirname "$0")"
PATH="$PATH:$HOME/.local/bin"

WATCH_PID="${1:-}"

# ── Wait for build_map to exit ─────────────────────────────────────────────────
if [[ -n "$WATCH_PID" ]]; then
    echo "[start_alarm_smc] Waiting for build_map (PID $WATCH_PID) to complete…"
    while kill -0 "$WATCH_PID" 2>/dev/null; do
        sleep 30
        echo "[start_alarm_smc] Still waiting… ($(date '+%H:%M:%S'))"
    done
    echo "[start_alarm_smc] build_map exited. Checking volume…"
else
    echo "[start_alarm_smc] No watch_pid given — checking volume directly."
fi

# ── Verify senate map is on the volume ────────────────────────────────────────
echo ""
modal volume ls fdga-chain-data maps 2>&1 || true

# ── Launch congress ALARM SMC ─────────────────────────────────────────────────
echo ""
echo "[start_alarm_smc] Launching congress ALARM SMC…"
modal run modal_alarm_app.py::run_alarm_smc \
    --run-name fdga_baseline_benchmarks_2601_congress_alarm \
    --chamber congress \
    --n-districts 14 \
    --district-col cd_2020 \
    --pop-tol 0.01 \
    --map-rds-path /data/alarm/GA_cd_2020_map.rds \
    --n-chains 10 \
    --nsims 10000 \
    > ~/congress_alarm_smc.log 2>&1 &
CONGRESS_PID=$!
echo "[start_alarm_smc] Congress SMC launched (PID $CONGRESS_PID) → ~/congress_alarm_smc.log"

# ── Launch senate ALARM SMC ───────────────────────────────────────────────────
echo "[start_alarm_smc] Launching senate ALARM SMC…"
modal run modal_alarm_app.py::run_alarm_smc \
    --run-name fdga_baseline_benchmarks_2601_senate_alarm \
    --n-chains 10 \
    --nsims 10000 \
    > ~/senate_alarm_smc.log 2>&1 &
SENATE_PID=$!
echo "[start_alarm_smc] Senate SMC launched (PID $SENATE_PID) → ~/senate_alarm_smc.log"

echo ""
echo "Both ALARM SMC runs launched in background."
echo "Monitor:"
echo "  tail -f ~/congress_alarm_smc.log"
echo "  tail -f ~/senate_alarm_smc.log"
echo ""
echo "Check volume for results:"
echo "  modal volume ls fdga-chain-data ensemble"
echo ""
echo "When both complete, download and score:"
echo "  cd ~/codebox/fgdp"
echo "  modal volume get fdga-chain-data /ensemble/fdga_baseline_benchmarks_2601_congress_alarm_plans.parquet fdp/data/repos/main/ensemble/"
echo "  modal volume get fdga-chain-data /ensemble/fdga_baseline_benchmarks_2601_senate_alarm_plans.parquet fdp/data/repos/main/ensemble/"
echo "  bash score_alarm_benchmarks.sh"
