#!/usr/bin/env bash
# deploy_alarm.sh — push GA House ALARM SMC to a remote Docker host
#
# Prerequisites (local):
#   - modal CLI installed and authenticated  (pip install modal && modal setup)
#   - SSH access to the remote machine
#   - rsync on both sides
#
# Usage:
#   ./deploy_alarm.sh <user>@<host>            # deploy + start
#   ./deploy_alarm.sh <user>@<host> --build-only  # push + build image, don't run yet
#   ./deploy_alarm.sh <user>@<host> --fetch       # pull results back after run completes
#   NSIMS=200 ./deploy_alarm.sh <user>@<host>  # quick smoke test (200 plans/chain)
#
# Example:
#   ./deploy_alarm.sh vish@192.168.1.50

set -euo pipefail

REMOTE="${1:?Usage: $0 <user>@<host> [--build-only|--fetch]}"
MODE="${2:-}"
REMOTE_DIR="/home/vish/fdga-chain"
NSIMS="${NSIMS:-500}"
RUN_NAME="${RUN_NAME:-fdga_baseline_benchmarks_2601_house_alarm}"

echo "══════════════════════════════════════════════════════"
echo " ALARM House Deploy"
echo " Remote : ${REMOTE}:${REMOTE_DIR}"
echo " NSIMS  : ${NSIMS} per chain  (${NSIMS}×10 = $(( NSIMS * 10 )) total)"
echo " Mode   : ${MODE:-full (deploy + run)}"
echo "══════════════════════════════════════════════════════"

# ── Step 0: Download house map from Modal (if not already local) ──────────────
MAP_LOCAL="./data/maps/GA_sh_2020_map.rds"
if [[ ! -f "${MAP_LOCAL}" ]]; then
    echo ""
    echo "[step 0] Downloading GA_sh_2020_map.rds from Modal volume…"
    mkdir -p ./data/maps
    modal volume get fdga-chain-data /maps/GA_sh_2020_map.rds "${MAP_LOCAL}"
    echo "[step 0] Map saved to ${MAP_LOCAL}"
else
    echo "[step 0] Map already local: ${MAP_LOCAL}  ($(du -sh ${MAP_LOCAL} | cut -f1))"
fi

# ── Step 1: Sync code + map to remote ────────────────────────────────────────
echo ""
echo "[step 1] Syncing to ${REMOTE}:${REMOTE_DIR}…"
SSH="ssh -i ~/.ssh/id_alarm"
SCP="scp -i ~/.ssh/id_alarm"

$SSH "${REMOTE}" "mkdir -p ${REMOTE_DIR}/data/{maps,ensemble,logs} ${REMOTE_DIR}/scripts"

# Copy source files
$SCP Dockerfile.alarm                    "${REMOTE}:${REMOTE_DIR}/Dockerfile.alarm"
$SCP docker-compose.alarm.yml            "${REMOTE}:${REMOTE_DIR}/docker-compose.alarm.yml"
$SCP scripts/run_alarm_ensemble.R        "${REMOTE}:${REMOTE_DIR}/scripts/run_alarm_ensemble.R"
$SCP scripts/build_chamber_map.R         "${REMOTE}:${REMOTE_DIR}/scripts/build_chamber_map.R"
$SCP scripts/run_house_alarm_docker.sh   "${REMOTE}:${REMOTE_DIR}/scripts/run_house_alarm_docker.sh"
$SCP scripts/concat_alarm_chains.py      "${REMOTE}:${REMOTE_DIR}/scripts/concat_alarm_chains.py"

# Copy the house map (1.2 MB)
$SCP "${MAP_LOCAL}" "${REMOTE}:${REMOTE_DIR}/data/maps/GA_sh_2020_map.rds"

# Ensure scripts are executable on remote
$SSH "${REMOTE}" "chmod +x ${REMOTE_DIR}/scripts/run_house_alarm_docker.sh"

echo "[step 1] Sync complete."

if [[ "${MODE}" == "--fetch" ]]; then
    # ── Fetch results ─────────────────────────────────────────────────────────
    echo ""
    echo "[fetch] Pulling results from ${REMOTE}:${REMOTE_DIR}/data/ensemble/…"
    mkdir -p ./data/ensemble
    scp -i ~/.ssh/id_alarm \
        "${REMOTE}:${REMOTE_DIR}/data/ensemble/${RUN_NAME}_plans.parquet" \
        "${REMOTE}:${REMOTE_DIR}/data/ensemble/${RUN_NAME}_meta.json" \
        ./data/ensemble/
    echo "[fetch] Done. Files in ./data/ensemble/"
    exit 0
fi

# ── Step 2: Build Docker image on remote (skip if already tagged) ────────────
echo ""
SNAPSHOT_TAG="fdga-alarm:r-stack-bookworm"
if ssh -i ~/.ssh/id_alarm "${REMOTE}" "docker image inspect ${SNAPSHOT_TAG} > /dev/null 2>&1"; then
    echo "[step 2] Snapshot image ${SNAPSHOT_TAG} already exists — skipping build."
    ssh -i ~/.ssh/id_alarm "${REMOTE}" "docker tag ${SNAPSHOT_TAG} fdga-alarm:latest"
else
    echo "[step 2] Building fdga-alarm image on remote…"
    ssh -i ~/.ssh/id_alarm "${REMOTE}" "cd ${REMOTE_DIR} && docker build -f Dockerfile.alarm -t fdga-alarm:latest . && docker tag fdga-alarm:latest ${SNAPSHOT_TAG}"
    echo "[step 2] Image built and snapshotted as ${SNAPSHOT_TAG}"
fi

if [[ "${MODE}" == "--build-only" ]]; then
    echo "[build-only] Image built. Run when ready:"
    echo "  ssh ${REMOTE} 'cd ${REMOTE_DIR} && NSIMS=${NSIMS} docker compose -f docker-compose.alarm.yml up'"
    exit 0
fi

# ── Step 3: Run the ensemble ──────────────────────────────────────────────────
echo ""
echo "[step 3] Starting ALARM ensemble on remote (detached)…"
ssh -i ~/.ssh/id_alarm "${REMOTE}" "cd ${REMOTE_DIR} && NSIMS=${NSIMS} docker compose -f docker-compose.alarm.yml up -d"

echo ""
echo "══════════════════════════════════════════════════════"
echo " Ensemble started. Monitor with:"
echo "   ssh ${REMOTE} 'docker logs -f fdga-alarm-house'"
echo ""
echo " When complete, fetch results:"
echo "   ./deploy_alarm.sh ${REMOTE} --fetch"
echo ""
echo " Expected runtime: ~2-4 h for 500 plans/chain on a modern CPU"
echo " Output: ${REMOTE}:${REMOTE_DIR}/data/ensemble/${RUN_NAME}_plans.parquet"
echo "══════════════════════════════════════════════════════"
