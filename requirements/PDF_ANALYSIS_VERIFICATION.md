# Verification: "Final 2021 map evaluation v20 12192022.pdf" vs the FDGA X-Ray app

Source deck: `requirements/Final 2021 map evaluation v20 12192022.pdf` — 66 pages, Fair Districts GA /
Princeton Gerrymandering Project, "Evaluating Georgia's Redistricting Proposals and Enacted Maps – 2021".

App: `src/` (Vite + React), bundle `public/data/story.json` produced by `scripts/export_story_data.py`.

Legend: **present** = already in the app before this audit · **added** = built during this audit ·
**partial** = the analysis exists but one input the deck had is not in the data platform ·
**no** = cannot be reproduced from the data the platform holds (search evidence below).

The app is a live, filterable instrument rather than a slide deck, so one section covers many slides:
every partisan and representation analysis runs for all three chambers and all 14 cycles (2000–2026)
via the header dropdowns. The deck is a fixed snapshot of the 2021 enacted maps measured on
2016-18-20 votes; the app can be switched onto that exact basis (see "Reproducing the deck's numbers").

## Reproducing the deck's published numbers

Section 03b carries a **"2018–2021 index (2022 evaluation)"** signal — the mean Democratic share of the
2018 Governor, 2020 President and 2021 Senate runoff, i.e. the deck's own partisan index. Selected, it
reproduces the published figures. Verified by driving the built app in headless Chromium and asserting
each cell against the PDF text:

```
=== state_house (2018–2021 index) ===
  MATCH   previous map seats D               app=83  deck=83   [p49 83D/97R]
  MATCH   enacted 2021 seats D               app=82  deck=82   [p49 82D/98R]
  DIFFER  enacted 2021 competitive           app=6   deck=7    [p50]
  MATCH   Dem proposal seats D               app=84  deck=84   [p49 84D/96R]
  MATCH   Dem proposal competitive           app=8   deck=8    [p50]
  MATCH   enacted Black-majority             app=49  deck=49   [p57 enacted HB 1EX]
  MATCH   enacted coalition                  app=27  deck=27   [p57]
  MATCH   enacted influence                  app=32  deck=32   [p57]
  MATCH   enacted minority total             app=108 deck=108  [p57]
=== state_senate ===   all 10 MATCH  (24D prior, 23D enacted, 25D proposed; 14/6/13 = 33)
=== us_house ===       all 8 MATCH   (6D prior, 5D enacted; 2/3/3 = 8)

DECK CROSS-CHECK: 26 match, 1 differ
```

The one difference is the House enacted-map competitive count, 6 against the deck's 7 — a single
district sitting on the 46.5% boundary, where the deck's index legs are rounded differently. Everything
else, including all twelve enacted-map minority counts across the three chambers, matches exactly.

The classification thresholds that produce those matches are the deck's own: 50% majority, 37–50%
influence, any-part Black VAP (`pct_bvp`). Using Black *population* (`pct_bp_`) instead gives House
76/0/32 and Senate 20/0/13 — nowhere near the published tables — which is what confirms `pct_bvp` is
the right field rather than merely a plausible one.

## Framing and method

| Deck | Analysis | App | Status |
|---|---|---|---|
| p2, p61 | Georgia's racial composition ("diversity reigns") | 04b aside "Who Georgia's voters are" — White 52.8%, Black 30.0%, Hispanic 9.0%, Asian 4.5%, other 3.7%, all-minority 47.2% | **added** (voting-age denominator, not total population — labelled in the UI) |
| p61 | Rural loss → urban growth, % population change from 2010 | — | **no** — see searches below |
| p3, p62 | Swing state: 2012 R+3.3% → 2020 D+0.2% | 01 The swing — presidential/governor/US-Senate two-party lines 2000–2026, click to change year | present |
| p4 | Three fairness measures: partisan balance + competitiveness; majority-minority + influence; split communities | 04 (partisan + competition), 04b Representation, 04 aside split cities/towns (62 municipalities, 21st percentile) | **added** (04b completed the third measure) |
| p5 | Partnership matrix: 3 chambers × 3 measures; Phase 1 history, Phase 2 evaluation | chamber dropdown × sections 01–02b (history) and 03–04b (evaluation) | present (structurally) |
| p65 | Method: 1M simulated maps, 2020 Census, VRA + GGA guidelines | 04 lede + "Benchmark setup": 40,005 ReCom draws (House), 100,000 (Senate), 99,001 (Congress), no party/race/result data | present — FDGA's own ensembles, **not** PGP's 1M maps; stated in the section |
| p63, p64 | Senate + House + Congress benchmark comparison on one page | 04 per chamber (switch chambers in the header) | **partial**: no single side-by-side view of all three chambers |

## Partisan analysis

| Deck | Analysis | App | Status |
|---|---|---|---|
| p7, p30, p45 | "Partisan gap narrowing since 2010": statewide vote share vs seats won | 02 second figure — R vote share (dashed) vs seat share (solid), gap shaded, every cycle, narrowing/widening computed from data | **added** |
| p11, p34, p49 | Partisan balance: previous map vs Dem caucus proposal vs enacted | **03b Plan comparison** — every catalogued plan scored on one vote file: previous map, enacted 2021, Democratic proposal, Republican drafts, remedial plans, map in force. House 83 → 82 enacted / 84 proposed; Senate 24 → 23 / 25; Congress 6 → 5 | **added** (was declared out of scope in the first pass — the plan files were there) |
| p13, p35, p50 | Metric tables: election · PGP benchmark (98% of 1M) · PGP "A" grade · enacted · grade | 04 metric table — enacted · neutral 5th–95th · "A" band · percentile · grade · what it measures; 03b table adds the proposal columns | **added** |
| p12, p15, p37, p52 | Range of Democratic seats and of competitive seats: 98% range, "A" range, enacted | 04 two histograms (within 10 pts; seats leaning D) with middle-90% band, median, enacted marker, "A" band | **added** |
| p16, p17, p23, p38, p39, p53, p54, p66 | Sorted partisan-lean charts: previous / enacted / median simulated / Dem proposal | **03b lean curves** — one sorted curve per plan on one axis, competitive zone shaded, hover to isolate; the neutral-ensemble median sits in the table as the "median of simulated maps" row. Plus 03a Landscape (single election) and 03 scatter (prior vs current) | **added** |
| p21 | District cores not preserved: % required, old population out, new population in | 03 heatmap, **Moved out / Required** toggle; 03b transitions table gives the same totals for the deck's own 2015→2022, 2014→2022 and 2021→2022 transitions (House 3,296,328 moved = 30.8% of the state, 8.6× the 384,130 equality required) | **added** — "moved in" built then withdrawn, see below |
| p22 | Population over/under in each district | 03 figure 4 (signed deviation, every district, both maps) + 03b "Max pop. dev." column for all seven plans — the 2015 House map is 32.28% off ideal, the 2024 map 1.62% | **added** |
| p24, p25 | "5 extreme districts in the adopted map" against the competitive zone | 03 aside "The most extreme districts" (top 5 by margin) + 03a competitive band | **added** |
| p43, p58 | Incumbents drawn from a D-leaning into an R-leaning district | 03 incumbent table — last winners under the prior lines joined to each district's lean shift. House: 3 D→R, 4 R→D (Mary Margaret Oliver HD 82 −42.0 first); Senate: Elena Parent SD 42 −40.8; Congress: Lucy McBath CD 7 −22.9 | **added** |
| p8, p31, p46 | What the *2011* map would have produced in the 2012 election vs 2018-21 (two simulated ranges per era) | — | **no** — see searches below |
| p40, p55 | More safe districts / fewer competitive (FiveThirtyEight) | 04 "Safe seats, both parties" KPI + Safe D / Safe R rows against the neutral median | present — computed from FDGA's ensemble, not quoted from 538 |
| p9, p32, p47 | The two competing proposals and their authors' quotes | 03b scores the Republican drafts (`house_prop2_rep`, `house_prop3_rep`, `senate_prop2_rep`, `senate_prop3_rep`) alongside the Democratic ones; the quotes themselves are not data | **added** (plans) · quotes out of scope |
| p20 | Five citizen-drawn "A"-grade maps: 8R-6D, 2-5 competitive, 5-6 minority-majority, 9-15 counties split | 04 aside reports the split-communities benchmark; 03b scores the remedial plans on the same basis | **partial** — see searches below |

## Minority representation

| Deck | Analysis | App | Status |
|---|---|---|---|
| p18, p42, p57 | Minority table: Black majority / coalition / influence, existing vs adopted vs Dem proposal, with totals | 04b (both enacted maps + benchmark) and 03b (all seven plans, including the Dem proposal column). House enacted 49/27/32 = 108 and proposed 41/32/37 = 110; Senate enacted 14/6/13 = 33 and proposed 13/9/12 = 34; Congress enacted 2/3/3 = 8 | **added** — totals match the deck exactly on all six columns |
| p19, p41, p56 | Benchmarks vs enacted map, with the category definitions and the VRA note | 04b range chart (both maps, neutral 5th–95th, "A" band, scorecard grade) + definitions aside + law note | **added** |
| p26 | Loses/gains a Black-majority district, named | 04b KPI + "Which districts crossed 50%": HD 64/74/117/145/149, SD 17/28, CD 5/6 — identical to the bundle's independently computed `becameBvapMajority`, and House 49 + 5 = 54 is the court-ordered remedy | **added** |
| p27 | Same number of majority-minority districts | 04b coalition-majority row (prior vs current); 03b for all plans | **added** |
| p28 | Influence districts by group: Asian 0, all minorities 3, Black 2, Hispanic 0 | 04b Hispanic KPI (majority + influence, naming districts), Black-influence count, per-district Black/Hispanic/Asian/all-minority shares in the bundle | **added** |
| — | District-level ladder | 04b first figure: every district's Black VAP share under both maps, sorted, 50% line and 37–50% band | **added** (no deck equivalent) |

Documented differences from the deck, both stated in the UI: the benchmark denominator is ACS *citizen*
VAP while the district counts are VAP (so the benchmark's enacted figure is not expected to equal the
count beside it), and districts are classified on *any-part* Black VAP with the narrower Black-alone
count reported alongside.

## Searches run to establish what is genuinely absent

Three exclusions survive. These are the commands and their output, so the absence is evidenced rather
than asserted. (Two earlier exclusions — the Democratic caucus proposals and the pre-2021 maps — were
**wrong** and have been withdrawn; `boundaries/**` held them all along.)

**1. Proposal and historical plans — FOUND (exclusion withdrawn).**

```
$ find fdp/data/repos/main/boundaries -type f | sort
boundaries/house/house_prop1_dem.geojson        # → fdp/config/apps/map_compare.yml:
boundaries/house/house_prop2_rep.geojson        #   "GA House — Proposed Plan 1 (Democratic)"
boundaries/house/house_prop3_rep.geojson
boundaries/house/house15_census20.geojson       #   "GA House — 2015 Plan (2020 Census data)"
boundaries/house/enacted_house22.geojson        #   "GA House — Enacted 2022"
boundaries/senate/senate_prop1_dem.geojson      #   "GA Senate — Proposed Plan 1 (Democratic)"
boundaries/senate/senate14_census20.geojson     #   "GA Senate — 2014 Plan (2020 Census data)"
boundaries/congress/congress12_census20.geojson #   "GA Congress — 2012 Plan (2020 Census data)"
... (36 plan files total, all carrying the same 6 election signals + demographics)
$ ls fdp/data/repos/main/displacement/
congress_2123_to_24.json  congress_21_to_22.json  house_15_to_22.json
house_2123_to_24.json     senate_14_to_22.json    senate_2123_to_24.json
```

All are exported by `load_plans()` / `load_plan_pairs()` and rendered in section 03b. Plan names are
taken verbatim from the catalogue; the app invents none. Bill numbers (HB 1EX / HB 4EX / SB 1EX /
SB 4EX / SB 2EX) are attributed to the deck, not to the catalogue.

One identification was **declined**: `congress21_p2` scores 7D/7R on the deck's index, exactly the
deck's SB 3EX figure (p11), but it yields 0 competitive districts where the deck reports 1 (p13). It is
therefore shown under the neutral role "Alternative 2021 draft" and is not labelled the Democratic
caucus proposal.

**2. A 2011-vintage ensemble (deck pp. 8, 31, 46) — genuinely absent.**

```
$ ls fdp/data/repos/main/ensemble/
GA-2026-100K-2601_plans.parquet
fdga_baseline_benchmarks_2601_{house,senate,congress}_{plans,scores,draw_stats,competitive_counts}.parquet
fdga_baseline_benchmarks_2601_{senate,congress}_demographics.parquet   (+ _alarm_ variants)
fdga_baseline_benchmarks_2601_{house,senate,congress}_scorecard.json
senate_100K_2601_plans.parquet

$ python3 -c "import json,glob; [print(f.split('/')[-1], len(json.load(open(f))['elections']), \
      [e['label'] for e in json.load(open(f))['elections']]) for f in sorted(glob.glob('ensemble/*scorecard.json'))]"
  fdga_baseline_benchmarks_2601_congress_scorecard.json  1 ['2018–2024 Composite']
  fdga_baseline_benchmarks_2601_house_scorecard.json     1 ['2018–2024 Composite']
  fdga_baseline_benchmarks_2601_senate_scorecard.json    1 ['2018–2024 Composite']
```

Every ensemble is the 2601 baseline run scored on exactly one election — the 2018–2024 composite. The
deck's pp. 8/31/46 need the *same* ensembles re-scored on 2012-era votes: a second scoring run over
100K–1M stored plans (`fdp/scripts/score_ensemble_demographics.py` plus the competitive-count scorer),
not a lookup. That is a data-platform job, not a front-end one.

**3. Citizen map-corps sample plans (deck p. 20) — genuinely absent.**

```
$ cd fdp/data/repos/main && find . -iname "*corps*" -o -iname "*sample*" -o -iname "*a_grade*" \
      -o -iname "*fairmap*" -o -iname "*fair_map*"
(no output, exit 1)
$ grep -rl "map corps\|mapping corps\|Map Corps" fdp/config fdp/data/repos/main
(no output, exit 1)
```

The five "A"-grade citizen maps are not in the platform. What *is* there and is now shown: the
scorecard's `a_grade_range` per metric (the "A" band in 04), the remedial plans in 03b, and the
split-communities benchmark the deck's "9-15 counties split" claim corresponds to.

**4. 2010 Census population (deck p. 61, "rural loss → urban growth") — genuinely absent.**

```
$ cd ~/codebox/fgdp/fdp && .venv/bin/python -c "import duckdb; con=duckdb.connect(); \
  [print(t, [r[0] for r in con.execute(f\"DESCRIBE SELECT * FROM 'data/repos/main/{t}'\").fetchall()]) \
   for t in ['block/block_points.parquet','lookups/ga_block_vtd_lookup_2020.parquet','block/ga-2024-cvap-block.parquet']]"

block/block_points.parquet -> ['GEOID20', 'lat', 'lon']
lookups/ga_block_vtd_lookup_2020.parquet -> ['block_GEOID20', 'vtd_GEOID20']
block/ga-2024-cvap-block.parquet -> ['GEOID20', 'CVAP_TOT24', 'CVAP_HSP24', 'CVAP_WHT24',
                                     'CVAP_BLA24', 'CVAP_AMI24', 'CVAP_NHP24', 'CVAP_ASN24', 'CVAP_BLK24']
```

No 2010 population field exists anywhere in `block/`, `lookups/`, `demographics/` or `vtd/`. The
`demographics/*.json` files are socioeconomic per district — median income, poverty, education,
insurance, single-parent households — not vintage population. A 2010→2020 change map needs a 2010
Census file the platform does not hold.

## Deliberately not shipped

A "moved in" heatmap view. The plan files' `moved_to` blocks do not reconcile: for the House, 6 districts
receive more people than they contain (HD 134: 76,704 inbound against 59,606 total) and total inbound
1,725,086 exceeds the same file's own `displaced_pop` of 1,176,653. The reason is recorded in
`load_map_effect()` where the series would have been built. "Moved out" and "required" both reconcile
against the summary and are the two series the district-cores test needs.

## Data corrections made while verifying

- **County keys were not comparable across cycles.** The 2026 ingest wrote `"APPLING COUNTY"` where every
  earlier cycle wrote `"APPLING"` (795 keys, 5 offices), so any comparison touching 2026 matched nothing.
- **County shifts used a three-party share.** In 2026, 67% of votes sit in `other`, which would have read
  as a Democratic collapse. `countyShifts` now computes d/(d+r), matching every other chart.
- **Midterm years had no county baseline**; the comparison table only paired presidential-cycle years.
- **Congress district ids**: `"13"` in the displacement files vs `13.0` in the plan GeoJSONs — normalised
  through `int(float(...))`. The same artifact inflated the Congress renumbering count from 4 to 14.
- **Plan schemas differ by vintage**: 2024 plans carry `pct_*_al` shares; 2015/2021-23 plans carry counts
  (`wvap`/`bvap`/`bipoc_vap` over `tvap`). `demographic_shares()` resolves both, verified
  district-by-district where two plans share boundaries (`bvap/tvap` ≡ `pct_bvp`).

## Re-verifying

```bash
cd ~/codebox/fgdp/fdp && .venv/bin/python ../scripts/export_story_data.py
cp ~/codebox/fgdp/public/data/story.json ~/codebox/fgdp/fair-districts-xray/public/data/story.json
cd ~/codebox/fgdp/fair-districts-xray && npm run build
```

Then, for each chamber: 02 has two figures · 02a and 02b list all counties · 03 has four figures, the
heatmap toggle and the incumbent table · 03b has lean curves for every plan, two tables and three
signal options · 04 has three figures and a seven-row metric table · 04b has two figures. Selecting
"2018–2021 index" in 03b should reproduce the deck's seat counts.
