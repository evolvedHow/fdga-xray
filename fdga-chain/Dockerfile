# =============================================================================
# fdga-chain Dockerfile
#
# Builds a self-contained image that can:
#   1. Run the FastAPI redistricting API (default CMD)
#   2. Run ensemble scripts directly (override CMD)
#
# Usage
# -----
# Build:
#   docker build -t fdga-chain .
#
# Run API server (default):
#   docker run -p 8001:8001 \
#     -e MAPBOX_TOKEN=pk.eyJ1... \
#     -e DATABASE_URL=postgresql://... \
#     -v $(pwd)/data:/app/data \
#     fdga-chain
#
# Run an ensemble (override CMD):
#   docker run \
#     -e DATABASE_URL=postgresql://... \
#     -v $(pwd)/data:/app/data \
#     fdga-chain \
#     uv run python scripts/run_ensemble.py \
#       --run-name congress_v1 \
#       --config /configs/ga_congress_2026_v1.yml
#
# Mount a configs directory for benchmark YAML files:
#   docker run ... -v $(pwd)/../fdp/configs:/configs fdga-chain ...
#
# Notes
# -----
# - data/graphs/ must exist and contain the pre-built dual graphs.
#   Build them locally first: uv run python scripts/build_graph.py --chamber congress
# - For production ensemble runs, prefer Modal (modal deploy modal_app.py) —
#   Modal handles scaling, parallelism, and long-running jobs more reliably
#   than a Docker container.
# =============================================================================

FROM python:3.12-slim

# ── System dependencies (GDAL for geopandas/fiona) ─────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgdal-dev \
        gdal-bin \
        libspatialindex-dev \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependency management (uv) ──────────────────────────────────────
RUN pip install --no-cache-dir uv

# Copy dependency files first (better layer caching)
COPY pyproject.toml uv.lock* ./

# Install all dependencies (no dev extras)
RUN uv sync --no-dev

# ── Application source ──────────────────────────────────────────────────────
COPY api/     ./api/
COPY scripts/ ./scripts/

# data/ is NOT baked into the image — mount it at runtime via -v $(pwd)/data:/app/data
# This keeps the image small and lets you update data without rebuilding.

# ── Port ────────────────────────────────────────────────────────────────────
EXPOSE 8001

# ── Health check ────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# ── Default: run the API server ─────────────────────────────────────────────
CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8001"]
