
## 2026-11-16 (round 2): empty swing chart fix, displacement heatmap, river hover/pin, fdex naming

**Fixed / added** (follow-up to the full-width chart pass):

- **01 The swing was EMPTY since the bundle format changed**: `Statewide.jsx` filtered on
  `d.election_type === 'general'` but story.json rows carry `type` — no series ever matched,
  so the line chart rendered axes and legend only. Now `d.type === 'general'`; verified
  3 series paths + 24 points.
- **03 displacement bars → heatmap**: one square per district (number + % inside), lavender→plum
  ramp on an absolute 0–75% scale, 30%+ squares outlined, hover tooltip (people moved, rank,
  equality-required share), click pins a detail readout below the chart, sort toggle
  "Largest first / By district number". Senate 8×7 grid, House 20×9, Congress 7×2.
- **03a river hover/click**: hover any dot for district, winner, share and margin; click pins a
  plum ring + `HD n` label on the chart (click again unpins). Pin/hover reset on chamber/year change.
- **fdex (Georgia Explorer) dropdown consistency**: chambers renamed/reordered to
  `US Congress / State Senate / State House` (`CHAMBER_LABELS`, `CHAMBER_ORDER` in lib/data.js,
  applied in `loadStory`); precinct-lean options renamed to the fdex overlay style
  (`Partisan Lean, 2018-2024 (avg. of 6 elections, by precinct)`, `2024 President — Actual
  Results (by precinct)`, …) under an `Election Results by precinct` optgroup; year dropdown
  marks uncertified cycles `2026 (unofficial)` (`UNOFFICIAL_FROM_YEAR`); legend "U.S. Senate" →
  "US Senate"; CD/District prefix check updated for the new chamber label.
- Prose keeps the short bundle labels (e.g. "2018–2024 composite") — only the dropdowns carry
  the long fdex names.

**Verified** (headless Chromium, locator-driven): swing chart has data; dropdown labels/groups;
heatmap hover tooltip (`HD 61 · 70.8% · 42,008 of 59,302 · rank 1 of 180`), click readout + Clear,
sort toggle (first cell = 1), Senate grid = 56 cells / 23 contested dots / `SD` prefix; river
tooltip (`HD 19 · 42.7% D · Joseph Gullett`), pin/unpin; 6 chamber×year combos, drill-down,
mobile 375/768, horizontal layout — 0 overlaps, 0 JS errors; print PDF 17 pages with every
heatmap cell legible. `npm run build` clean.

**Files changed**: `src/lib/data.js`, `src/lib/export.js`, `src/styles.css`,
`src/components/{Header,Statewide,MapEffect,PartisanRiver,Competitiveness}.jsx`.

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

