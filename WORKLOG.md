
## 2026-11-16 (round 4): "not reproducible" claims re-tested — two were wrong; 03b Plan comparison added

Round 3 declared four deck analyses out of scope. A reviewer challenged that as asserted rather than
demonstrated, so the data platform was actually searched. **Two of the four were wrong.**

**Found and shipped** — `boundaries/**` held 36 plan files all along, catalogued with human labels in
`fdp/config/apps/map_compare.yml`, and `displacement/` held the matching transition files:

- **03b Plan comparison** (new section, deck pp. 11, 13, 16-17, 23, 34-35, 38-39, 49-50, 53-54, 66):
  the 2012/2014/2015 maps, the 2021 enacted maps, the Democratic caucus proposals, the Republican
  committee drafts, the remedial plans and the map in force now — seven plans per chamber, all scored
  on one VTD vote file. Sorted partisan-lean curve per plan with the competitive zone shaded and
  hover-to-isolate; a comparison table (seats D, competitive, median lean, Black-majority, coalition,
  influence, total, max population deviation); a transitions table (people moved, share of state,
  equality minimum, multiple, districts renumbered); and a neutral-ensemble median row standing in for
  the deck's "median of 1 million simulated maps".
- **A "2018–2021 index" signal** — the mean of the 2018 Governor, 2020 President and 2021 Senate
  runoff, i.e. the deck's own partisan index, computed in the exporter from the same three legs.
  Selected, it reproduces the published numbers: **26 of 27 asserted values match exactly**, including
  all twelve enacted-map minority counts (House 49/27/32 = 108, Senate 14/6/13 = 33, Congress
  2/3/3 = 8) and every seat count (House 83 previous / 82 enacted / 84 proposed; Senate 24 / 23 / 25;
  Congress 6 / 5). The single difference is the House enacted competitive count, 6 against 7 — one
  district on the 46.5% boundary.
- Confirmed `pct_bvp` (any-part Black VAP) is the field the deck used, not merely a plausible one:
  `pct_bp_` gives House 76/0/32 and Senate 20/0/13, which match nothing published.
- Plan labels are the catalogue's verbatim; bill numbers are attributed to the deck. One identification
  was **declined**: `congress21_p2` scores 7D/7R exactly as the deck's SB 3EX does, but yields 0
  competitive districts where the deck reports 1 — so it ships as "Alternative 2021 draft", not as the
  Democratic proposal.

**Still absent, now with the searches on the record** (`requirements/PDF_ANALYSIS_VERIFICATION.md`):
the 2011-vintage ensemble (every scorecard carries exactly one election, the 2018–2024 composite —
re-scoring 100K–1M stored plans on a 2012 index is a platform job); the five citizen map-corps plans
(`find`/`grep` for corps/sample/a_grade/fair_map: no output, exit 1); and 2010 Census population
(`block_points` holds only GEOID/lat/lon, the lookup only block↔VTD, the CVAP block file only 2024
columns).

**Bugs fixed**: congressional `district_id_a`/`_b` compare as `"7"` vs `"7.0"`, which reported all 14
districts as renumbered instead of 4 — normalised through `int(float(...))`; and the Congress equality
minimum of 5 people produced a 363,052× multiple, now shown as `n/a` with "districts already equal"
(the same trivial-minimum case `MapEffect` already handled).

**Verified** (headless Chromium): 13 sections × 7 chamber/year combos — 0 missing, 0 empty, 0 label
overlaps, 0 JS errors, 0 document overflow; 03b renders 7/7/6 curves and 2 tables per chamber, all
three signal toggles exercised; deck cross-check asserted cell-by-cell (26 match / 1 differ); mobile
375 + 768 clean. `npm run build` clean.

**Files changed**: `scripts/export_story_data.py` (+ the copy at `~/codebox/fgdp/scripts/`),
`public/data/story.json`, `src/App.jsx`, `src/components/PlanCompare.jsx` (new),
`requirements/PDF_ANALYSIS_VERIFICATION.md`.

## 2026-11-16 (round 3): 2022 FDGA/PGP evaluation deck audited against the app; county swing grid

**Task**: verify every analysis in `requirements/Final 2021 map evaluation v20 12192022.pdf` (66 pages)
exists in the app, and add what was missing. Full page-by-page matrix in
`requirements/PDF_ANALYSIS_VERIFICATION.md`.

**Added** (5 analyses the deck had and the app did not):

- **04b Representation** (new section, deck pp. 18-19, 26-28, 41-42, 56-57): every district classified
  from its own VAP into Black-majority (≥50%), minority coalition-majority, minority influence
  (37-50%), majority-white — under both the 2021-23 and 2024 lines — plus a district ladder chart,
  a benchmark range chart, the deck's three category definitions, Georgia's voter composition, and
  which districts crossed 50%. House 49→54 Black-majority, Senate 14→16, Congress 2→4; the crossings
  (HD 64/74/117/145/149, SD 17/28, CD 5/6) match the bundle's independently computed
  `becameBvapMajority` and the court-ordered remedy count.
- **02 vote share vs seat share** (deck pp. 7, 30, 45 "partisan gap narrowing since 2010"): R vote
  share against R seat share for every cycle, gap shaded, narrowing/widening computed from the data.
- **04 metric table + "A"-grade band** (deck pp. 13-14, 35-36, 50-51): enacted · neutral 5th-95th ·
  "A" band · percentile · grade · what it measures. The `a_grade_range` and the CVAP `demographics`
  block were sitting in the scorecards and had never been exported.
- **04 second histogram** (deck pp. 12, 15, 37, 52): seats leaning D against the neutral range with
  the "A" band, alongside the existing competitive-seats histogram.
- **03 incumbent table** (deck pp. 43, 58): the last winners under the prior lines joined to how each
  district's lean moved — House 3 D→R and 4 R→D crossings, Senate 2 and 2, Congress 1 and 1
  (Mary Margaret Oliver HD 82 −42.0, Elena Parent SD 42 −40.8, Lucy McBath CD 7 −22.9).
- **03 population over/under** (deck p. 22) and a **Moved out / Required** toggle on the displacement
  heatmap (deck p. 21), plus **03 "most extreme districts"** aside (deck pp. 24-25).
- **02b County grid**: alternative reading of 02a — one square per county with its name and signed
  shift ("+2.3 D" / "−4.1 R"), tinted by magnitude on a per-comparison scale, majority flips outlined,
  largest-first / A–Z ordering, hover tooltip, click to pin. Kept beside 02a for comparison.

**Data bugs found while verifying** (all fixed):

- 2026 county keys arrived as `"APPLING COUNTY"` where every earlier cycle is `"APPLING"` (795 keys,
  5 offices) — any comparison touching 2026 silently matched nothing.
- County shifts used the three-party `pctD`; in 2026, 67% of votes sit in `other`, which would have
  read as a Democratic collapse. Now two-party d/(d+r), matching every other chart.
- Midterm years (2018/2022/2026) had no county baseline at all; the comparison table only paired
  presidential-cycle years.
- Congress district ids: `"13"` in the displacement files vs `13.0` in the plan GeoJSONs.
- Plan schemas differ by vintage: 2024 plans carry `pct_*_al` shares, 2021-23 plans carry counts
  (`wvap`/`bvap`/`bipoc_vap` over `tvap`). The exporter now resolves both, verified district-by-district
  where the two plans share boundaries (`bvap/tvap` ≡ `pct_bvp`).

**Deliberately not shipped**: a "moved in" heatmap view. The plan files' `moved_to` blocks do not
reconcile — for the House 6 districts receive more people than they contain (HD 134: 76,704 in,
59,606 total) and total inbound 1,725,086 exceeds the summary's own displaced 1,176,653. The reason
is recorded in the exporter where the series would have been built.

**Not reproducible from the platform** (documented in the matrix, not silently dropped): the 2011-vintage
simulated ranges (pp. 8, 31, 46 — needs a second ensemble on 2012-era votes), the Democratic caucus
counter-proposals SB 3EX / SB 4EX / HB 4EX (pp. 11, 17, 34, 39, 49, 54), the citizen map-corps sample
plans (p. 20), and 2010→2020 county population change (p. 61 — no 2010 file).

**Verified** (headless Chromium, locator-driven): 12 sections × 7 chamber/year combos (2024 all three
chambers, 2022, 2018, 2016, 2008) — 0 label overlaps, 0 JS errors, 0 document overflow; county grid
159 cells in every combo with min text contrast 3.44:1 and no name clipped (longest, Chattahoochee,
auto-shrinks); grid hover tooltip / click-pin / A–Z toggle exercised; heatmap metric toggle exercised
in all three chambers; mobile 375 + 768 scroll rather than overflow; horizontal layout nav carries
02b and 04b; print PDF 20 pages with the whole county grid on one page. `npm run build` clean.

**Files changed**: `scripts/export_story_data.py` (+ its copy at `~/codebox/fgdp/scripts/`),
`public/data/story.json`, `src/lib/data.js`, `src/styles.css`, `src/App.jsx`,
`src/components/{Representation,CountyGrid}.jsx` (new), `src/components/{Benchmark,MapEffect,SeatsVsVotes,CountySwing}.jsx`.

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

