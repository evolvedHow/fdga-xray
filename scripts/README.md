# Data exporter

`export_story_data.py` reads the FDP common data platform and emits the single static bundle consumed by this site (`public/data/story.json`).

It is **not run in CI**. The generated bundle is committed to the repo so that the published site is fully self-sufficient.

## Requirements

- The FDP data platform at `../fdp` relative to the original `fgdp` workspace.
- A Python virtual environment with `duckdb`, `shapely`, and `PIL` installed (the FDP venv has these).

## Usage

```bash
cd /path/to/fgdp/fdp
.venv/bin/python ../scripts/export_story_data.py
```

This writes `/path/to/fgdp/public/data/story.json`. Copy that file into this repo to update the published site.
