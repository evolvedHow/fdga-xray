
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

