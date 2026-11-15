# fdga-chain — Redistricting Ensemble Benchmark

GerryChain-powered redistricting ensemble pipeline for Fair Districts Georgia.
Generates thousands of legally-valid neutral maps and benchmarks Georgia's
enacted districts against them.

See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for a full system diagram,
[`docs/ADMIN_GUIDE.md`](../docs/ADMIN_GUIDE.md) for running jobs, and
[`docs/ANALYST_GUIDE.md`](../docs/ANALYST_GUIDE.md) for metric explanations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.12 |
| MCMC algorithm | GerryChain 0.3 (ReCom) |
| Geospatial | GeoPandas 1.1, Shapely 2.1 |
| Data | PyArrow 23, NumPy |
| Compute | Modal (serverless containers + persistent volume) |
| Storage | Supabase (PostgreSQL 15) |
| API | FastAPI + uvicorn |
| Package manager | uv |

---

## Directory Layout

```
fdga-chain/
├── api/
│   ├── main.py           ← FastAPI app — ensemble API endpoints
│   └── data_loader.py    ← State-aware data loading
├── data/
│   ├── graphs/           ← GerryChain dual-graph JSON (2698 nodes each)
│   │   ├── ga_congress.json   (14 congressional districts)
│   │   ├── ga_senate.json     (56 state senate districts)
│   │   └── ga_house.json      (180 state house districts)
│   ├── raw/              ← Enacted district shapefiles + VTD shapefile
│   └── states/GA/        ← State config JSON
├── scripts/
│   ├── build_graph.py        ← VTD shapefile → dual graph (largest-overlap join)
│   ├── run_ensemble.py       ← ReCom MCMC runner (config-driven, Modal-aware)
│   ├── upload_to_modal.py    ← Upload graphs + data to Modal volume
│   ├── fetch_boundaries.py   ← Download enacted boundary files
│   ├── fetch_precinct_data.py ← Download MGGG precinct shapefiles (other states)
│   ├── prep_data.py          ← Normalise MGGG column names for GerryChain
│   ├── fetch_elections.py    ← Download election results from OpenElections
│   ├── compute_metrics.py    ← Compute fairness metrics from local elections.json
│   └── export_static.py      ← Pre-compute API responses as static JSON (GitHub Pages)
├── scripts/archive/          ← Truly one-time scripts
├── modal_app.py              ← Modal app definition, secrets, volume mounts
├── pyproject.toml
└── .env.example
```

---

## Quick Start

```bash
cd ~/codebox/fgdp/fdga-chain
uv sync
cp .env.example .env    # only needed for local API development
```

---

## Running an Ensemble (Modal)

### Dry run — verify config

```bash
uv run python scripts/run_ensemble.py \
    --config ../fdp/configs/benchmarks/ga_congress_2026_v2.yml \
    --run-name test \
    --dry-run
```

### Async run (fire and forget)

```bash
uv run python scripts/run_ensemble.py \
    --config ../fdp/configs/benchmarks/ga_congress_2026_v2.yml \
    --run-name congress_2026_v2 \
    --modal-async
```

### Blocking run (waits for completion)

```bash
uv run python scripts/run_ensemble.py \
    --config ../fdp/configs/benchmarks/ga_congress_2026_v2.yml \
    --run-name congress_2026_v2 \
    --modal
```

### Check run status

```bash
DATABASE_URL="..." modal run modal_app.py::list_runs
```

---

## After a Run — Scoring Pipeline

Run these from the `~/codebox/fgdp` root (see `docs/ADMIN_GUIDE.md` § 4):

```bash
DB="postgresql://..."

# 1. Download plans parquet from Modal volume
modal volume get fdga-chain-data /ensemble/congress_2026_v2_plans.parquet .

# 2. Score partisan metrics → fdp.ensemble_scores
DATABASE_URL="$DB" uv run --project fdp python fdp/scripts/score_ensemble_plans.py \
    --run-name congress_2026_v2 --plans-file ./congress_2026_v2_plans.parquet \
    --config fdp/configs/benchmarks/ga_congress_2026_v2.yml

# 3. Score demographics → fdp.ensemble_demographics
DATABASE_URL="$DB" uv run --project fdp python fdp/scripts/score_ensemble_demographics.py \
    --run-name congress_2026_v2 --plans-file ./congress_2026_v2_plans.parquet

# 4. Build draw stats → fdp.ensemble_draw_stats + fdp.ensemble_competitive_counts
DATABASE_URL="$DB" uv run --project fdp python fdp/scripts/build_draw_stats.py \
    --run-name congress_2026_v2 --config fdp/configs/benchmarks/ga_congress_2026_v2.yml

# 5. Generate charts
DATABASE_URL="$DB" uv run --project fdp python fdp/scripts/visualize_benchmark.py \
    --run-name congress_2026_v2
```

---

## Building / Updating Graphs

Run after any change to enacted district shapefiles:

```bash
uv run python scripts/build_graph.py      # builds all three chambers

# Upload updated graphs to Modal
uv run python scripts/upload_to_modal.py
modal deploy modal_app.py
```

---

## Modal Deployment

```bash
# One-time setup
pip install modal && modal setup
modal secret create fdga-chain-db DATABASE_URL="postgresql://..."
modal secret create fdga-chain-secrets MAPBOX_TOKEN="pk.eyJ1..."
uv run python scripts/upload_to_modal.py   # upload data to volume

# Deploy (required after any code or secret change)
modal deploy modal_app.py
```

> ⚠️ Always run `modal deploy` after updating a Modal secret. Using `--force`
> on `modal secret create` changes the secret's internal ID; the old deployment
> references the old ID and will crash-loop until redeployed.

---

## Running the API Locally

```bash
uv run uvicorn api.main:app --reload --port 8001
# → http://localhost:8001/docs
```

---

## Benchmark Configs

All configs are in `../fdp/configs/benchmarks/`:

| Config | Chamber | ε | Chains | Net draws |
|---|---|---|---|---|
| `ga_congress_2026_v2.yml` | Congress (14D) | ±1% | 1 | ~9,500 |
| `ga_senate_2026_v1.yml` | Senate (56D) | ±5% | 1 | ~9,000 |
| `ga_house_2026_v1.yml` | House (180D) | ±5% | 5 | ~40,000 |

Config naming: `ga_{chamber}_{cycle_year}_v{N}.yml` — increment `N` when
changing ε, algorithm, or elections list (affects cross-run comparability).
