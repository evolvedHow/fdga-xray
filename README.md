# FDGA X-Ray

A self-contained, interactive data story about how Georgia’s votes translate into seats — from statewide totals down to individual precincts.

Published at: **https://evolvedhow.github.io/fdga-xray/**

## What this is

This site is a visual, filterable narrative built on Fair Districts GA’s common data model. It lets readers:

- See the statewide popular vote vs. the seats each party won.
- Drill from county to individual precinct.
- Compare two enacted district maps side-by-side using the same underlying votes, so the differences are attributable only to the lines.
- Benchmark the enacted plan against tens of thousands of neutral maps drawn without party, race, or past-election data.
- Export any chart or the full report as PNG or PDF.

The analysis is deliberately non-partisan: the goal is to make districts more competitive and to oppose gerrymandering that benefits either party.

## How the data is produced

`public/data/story.json` is the single runtime bundle. It is generated offline by `scripts/export_story_data.py`, which reads the FDP data platform (`../fdp` relative to the original monorepo workspace). The generated file is committed to this repo so the published site has no runtime database or API dependency.

To update the bundle after the underlying data changes:

```bash
cd /path/to/fgdp/fdp
.venv/bin/python ../scripts/export_story_data.py
cp /path/to/fgdp/public/data/story.json /path/to/fdga-xray/public/data/story.json
cd /path/to/fdga-xray
git add public/data/story.json
git commit -m "Regenerate story.json from FDP common data model"
git push origin main
```

## Local development

```bash
cd /home/vgana/codebox/fdga-xray
npm ci
npm run dev
# open http://127.0.0.1:5173/
```

## Deploy

Pushes to `main` trigger GitHub Actions (`.github/workflows/deploy.yml`), which builds a static site with Vite and deploys it to GitHub Pages. No manual `gh-pages` push is required.

The Vite `base` is set to `./`, so the same build works at `https://evolvedhow.github.io/fdga-xray/`, on Modal, or from a local file tree.
