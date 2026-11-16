
## 2026-11-16: Full-width charts, explanations below, compressed-graph fixes

**Fixed**: every section reviewed against the rendered report PDF/PNG; graphs no longer
compressed, zoom remnants removed, explanations moved below the charts.

- **02a CountySwing**: 159-row single column (2,662px tall, 5 print pages of vertical text)
  → three-column lollipop chart (~950px, one print page). Sorted by |shift|, largest first;
  hover `<title>` on every county.
- **03 MapEffect**: tall per-district dumbbell (labels collided, e.g. "HHDD 74") → full-width
  prior-vs-current scatter with diagonal "no change" line, plum rings on flips, greedy
  collision-free labels. Displacement chart: overlapping bar labels → ▴ markers + one
  annotation line; %-gridline labels right-aligned; legend at even spacing (Senate-safe).
- **03a PartisanRiver**: was plotting all zeros (`demPct`/`repPct` don't exist in story.json)
  and threw `<rect>` negative-height errors → uses `d/(d+r)` two-party share, plots the 90
  contested seats, counts uncontested separately, party palette, full width; added to spine nav.
- **Layout**: asides (explanations, rank lists, controls) now render below charts in an
  auto-fit block grid — every chart uses the full card width (`.aside-block`).
- **Sizing**: Statewide/SeatsVsVotes/Benchmark/Competitiveness viewBoxes widened to render
  ~1:1 at full width; CountyMap + PrecinctXray viewBoxes aspect-fitted to Georgia instead of
  floating in a fixed landscape box; SeatsVsVotes value label no longer hits the year ticks.
- **Zoom removal (completed)**: deleted `src/lib/useSvgPanZoom.js`, `cursor:grab` styles,
  "wheel to zoom / drag to pan" aria text; "Zoom to … County" button → "Open … County".
- **Print**: figures/KPI blocks avoid page breaks; report went 21 → 17 pages with no
  vertical (1-char-per-line) text.

**Verified** (headless Chromium, `requirements/fdga-xray-fixed-*.png|pdf`): 6 chamber×year
combos, Fulton precinct drill-down (394 dots, card select), mobile 375/768 (no overflow),
horizontal layout — 0 label overlaps, 0 JS errors; `npm run build` clean.

**Files changed**: `src/styles.css`, `src/App.jsx`, `src/components/{CountySwing,MapEffect,PartisanRiver,Benchmark,Competitiveness,CountyMap,PrecinctXray,Statewide,SeatsVsVotes}.jsx`, deleted `src/lib/useSvgPanZoom.js`.

## 2026-11-14: County Swing Scatter Plot (Section 02a)

**Added**: Interactive county-level vote shift visualization.

- **What**: Blue arrows (left) for D gains, red arrows (right) for R gains, length = shift magnitude
- **Data**: Compares consecutive elections (e.g., 2020 pres → 2024 pres, 2018 gov → 2022 gov)
- **Placement**: Section 02a, between Statewide (01) and Votes vs Seats (02)
- **Status**: ✓ Scatter plot working. Deferred: geographic version with county boundaries.

**Deferred Work** (documented in `DEFERRED.md`):
- Geographic map background: position arrows at county centroids on GA map
- Reason deferred: coordinate transform (GeoJSON lon/lat → SVG) had NaN bug
- Future: Add console debugging, test projection math, integrate county path rendering

**Files changed**:
- `src/components/CountySwing.jsx` (new)
- `src/App.jsx` (added import, nav entry, render call)
- `DEFERRED.md` (created, includes fix strategy)

**Live**: Deployed to evolvedhow.github.io/fdga-xray as section 02a

