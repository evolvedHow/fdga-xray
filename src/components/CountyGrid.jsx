import React, { useEffect, useMemo, useState } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { countyShifts, fmtInt, fmtPct, niceCap, resolveCountyComparison } from '../lib/data';

/** Neutral paper colour every cell tint starts from. */
const PAPER = [247, 245, 251];
/** Party hues, matching the rest of the story (blue = D, red = R). */
const DEM = [31, 75, 174];
const REP = [219, 22, 35];
/** Fill used when a county did not move at all. */
const FLAT = '#eceaf2';

/**
 * Mix the paper colour toward a party hue.
 * @param {number[]} target RGB triplet to mix toward
 * @param {number} k mix weight, 0 = paper, 1 = full hue
 * @returns {string} CSS rgb() colour
 */
function tint(target, k) {
  const c = PAPER.map((p, i) => Math.round(p + (target[i] - p) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Minimum tint so a one-point move is still distinguishable from no move. */
const TINT_FLOOR = 0.1;
/**
 * Maximum tint. Deliberately capped below the point where the printed ink would
 * lose contrast: at 0.55 the darkest cell still clears a 3.4:1 ratio against
 * both the county name and the coloured shift value, so every cell keeps its
 * party-coloured text instead of switching to white.
 */
const TINT_CEIL = 0.55;

/**
 * Fill colour for one county cell: party hue, intensity by |shift|.
 * @param {number} shift change in the Democratic two-party share (shares, signed)
 * @param {number} cap shading saturation point, in percentage points
 * @returns {string} CSS rgb() colour
 */
function swingFill(shift, cap) {
  if (Math.abs(shift) < 1e-9) return FLAT;
  const t = Math.min(1, (Math.abs(shift) * 100) / cap);
  return tint(shift > 0 ? DEM : REP, TINT_FLOOR + (TINT_CEIL - TINT_FLOOR) * t);
}

/**
 * Font size for a county name, shrunk for the longest names so none of them
 * touch the edge of their square ("Chattahoochee" is the widest at 13 letters).
 * @param {string} name display county name
 */
function nameSize(name) {
  if (name.length > 11) return 8.4;
  if (name.length > 9) return 9;
  return 9.6;
}

/**
 * Signed shift as printed in a cell: "+2.3 D", "−4.1 R", or "0.0" when flat.
 * @param {number} shift change in the Democratic two-party share (shares)
 */
function shiftText(shift) {
  const pts = Math.abs(shift * 100).toFixed(1);
  if (Math.abs(shift) < 1e-9) return '0.0';
  return shift > 0 ? `+${pts} D` : `\u2212${pts} R`;
}

/** Grid geometry: 13 columns fit Georgia's 159 counties into a 13×13 block. */
const COLS = 13;
const W = 1160;
const CELL_H = 44;
const GAP = 5;
const M = { top: 14, right: 14, bottom: 84, left: 14 };

/**
 * Section 02b — the county swing grid: an alternative reading of section 02a.
 *
 * One square per county instead of one row. Each square carries the county
 * name and its signed shift ("+2.3 D" in blue, "−4.1 R" in red), and is shaded
 * by how far it moved — the deeper the tint, the larger the swing. Counties
 * that changed partisan majority between the two elections are outlined.
 * Squares can be ordered by size of shift or alphabetically; hovering shows the
 * underlying percentages and clicking pins a county below the chart.
 */
export default function CountyGrid({ countyVotes, electionKey, year, chamberLabel }) {
  const comparison = useMemo(() => resolveCountyComparison(electionKey, year), [electionKey, year]);

  const rows = useMemo(
    () => countyShifts(countyVotes, electionKey, comparison),
    [countyVotes, electionKey, comparison],
  );

  const [sort, setSort] = useState('magnitude');
  const [hover, setHover] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [pinned, setPinned] = useState(null);

  // Reset the interaction state whenever the comparison changes.
  const comparisonKey = comparison ? `${electionKey}:${comparison.prev}-${comparison.curr}` : '';
  useEffect(() => {
    setPinned(null);
    setHover(null);
  }, [comparisonKey]);

  const stats = useMemo(() => {
    const toD = rows.filter((r) => r.shift > 1e-9);
    const toR = rows.filter((r) => r.shift < -1e-9);
    const flat = rows.length - toD.length - toR.length;
    const flipped = rows.filter((r) => r.flipped);
    const gains = toD.length ? toD.reduce((a, b) => (b.shift > a ? b : a)) : null;
    const losses = toR.length ? toR.reduce((a, b) => (b.shift < a ? b : a)) : null;
    // Saturation point: the 90th percentile of |shift|, rounded to a nice
    // number, so a handful of uncontested-race outliers do not flatten the ramp.
    const mags = rows.map((r) => Math.abs(r.shift) * 100).sort((a, b) => a - b);
    const p90 = mags.length ? mags[Math.floor(0.9 * (mags.length - 1))] : 0;
    return { toD, toR, flat, flipped, gains, losses, cap: niceCap(Math.max(p90, 1)) };
  }, [rows]);

  const cells = useMemo(() => {
    if (sort === 'alpha') return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [rows, sort]);

  if (!comparison) {
    return (
      <Section id="county-grid" step="02b" kicker="County grid" title="No prior election for comparison">
        <p className="empty">
          Choose an election year with a previous cycle available to see county-level vote shifts.
        </p>
      </Section>
    );
  }

  if (!rows.length) {
    return (
      <Section id="county-grid" step="02b" kicker="County grid" title="Data not available for this comparison">
        <p className="empty">
          Swing data unavailable for {comparison.prev} → {comparison.curr}.
        </p>
      </Section>
    );
  }

  const nRows = Math.ceil(cells.length / COLS);
  const cellW = (W - M.left - M.right - GAP * (COLS - 1)) / COLS;
  const gridW = COLS * cellW + (COLS - 1) * GAP;
  const gridX = M.left + (W - M.left - M.right - gridW) / 2;
  const H = Math.round(M.top + nRows * (CELL_H + GAP) - GAP + M.bottom);
  const rankOf = new Map(rows.map((r, i) => [r.county, i + 1]));
  const cap = stats.cap;
  const pinnedRow = pinned != null ? rows.find((r) => r.county === pinned) : null;
  const saturated = rows.filter((r) => Math.abs(r.shift) * 100 > cap).length;

  return (
    <Section
      id="county-grid"
      step="02b"
      kicker="County grid"
      title={`Every county's swing, ${comparison.prev} → ${comparison.curr}`}
      lede={`One square per county: the name, and how far its Democratic two-party share moved between ${comparison.prev} and ${comparison.curr}. Blue squares shifted toward Democrats, red toward Republicans, and the deeper the tint the larger the move. The ${stats.flipped.length} outlined counties changed which party wins them.`}
      aside={
        <div className="aside-block">
          <p className="aside-title">The grid in numbers</p>
          <dl className="index-list">
            <div>
              <dt>Shifted toward Democrats</dt>
              <dd>
                <strong>{stats.toD.length}</strong> counties
              </dd>
            </div>
            <div>
              <dt>Shifted toward Republicans</dt>
              <dd>
                <strong>{stats.toR.length}</strong> counties
              </dd>
            </div>
            <div>
              <dt>No change</dt>
              <dd>
                <strong>{stats.flat}</strong> counties
              </dd>
            </div>
            <div>
              <dt>Changed partisan majority</dt>
              <dd>
                <strong>{stats.flipped.length}</strong> counties
              </dd>
            </div>
            <div>
              <dt>Largest Democratic gain</dt>
              <dd>
                {stats.gains ? (
                  <>
                    <strong>{stats.gains.name}</strong> +{(stats.gains.shift * 100).toFixed(1)} pts
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Largest Republican gain</dt>
              <dd>
                {stats.losses ? (
                  <>
                    <strong>{stats.losses.name}</strong> {(stats.losses.shift * 100).toFixed(1)} pts
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          <p className="micro-note">
            Shifts are measured on the two-party Democratic share, the same measure as sections 01
            and 02a. Very large county swings in a legislative race usually mean one party fielded no
            candidate in one of the two elections, not that every voter changed sides — hover a square
            to check the underlying percentages.
          </p>
        </div>
      }
      footer={`Source: fdga/facts.parquet, ${chamberLabel} county totals for ${comparison.prev} and ${comparison.curr}. Shift = ${comparison.curr} Democratic two-party share minus ${comparison.prev}, in percentage points; all ${rows.length} counties shown. Shading saturates at ±${cap} pts.`}
    >
      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Counties compared</span>
          <strong>{rows.length}</strong>
          <span className="kpi-sub">
            {comparison.prev} → {comparison.curr}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Toward Democrats</span>
          <strong>{stats.toD.length}</strong>
          <span className="kpi-sub">
            largest {stats.gains ? `${stats.gains.name} +${(stats.gains.shift * 100).toFixed(1)}` : '—'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Toward Republicans</span>
          <strong>{stats.toR.length}</strong>
          <span className="kpi-sub">
            largest {stats.losses ? `${stats.losses.name} ${(stats.losses.shift * 100).toFixed(1)}` : '—'}
          </span>
        </div>
        <div className={`kpi${stats.flipped.length ? ' is-flag' : ''}`}>
          <span className="kpi-label">Changed partisan majority</span>
          <strong>{stats.flipped.length}</strong>
          <span className="kpi-sub">outlined squares</span>
        </div>
      </div>

      <figure className="chart">
        <FigureTools
          name={`county-grid-${electionKey}-${comparison.prev}-${comparison.curr}`}
          title={`County swing grid: Democratic share change by county, ${comparison.prev} → ${comparison.curr}`}
          subtitle={`One square per county, shaded by the size of the shift; outlined squares changed partisan majority`}
        />
        <figcaption>
          Vote shift from {comparison.prev} to {comparison.curr} — one square per county
        </figcaption>

        <div className="chart-toggle" role="group" aria-label="Grid cell order">
          <span>Squares ordered:</span>
          <button
            type="button"
            className={sort === 'magnitude' ? 'is-active' : ''}
            aria-pressed={sort === 'magnitude'}
            onClick={() => setSort('magnitude')}
          >
            Largest shift first
          </button>
          <button
            type="button"
            className={sort === 'alpha' ? 'is-active' : ''}
            aria-pressed={sort === 'alpha'}
            onClick={() => setSort('alpha')}
          >
            A–Z
          </button>
          <span className="legend-hint">Hover a square for details · click to pin it below the chart</span>
        </div>

        <div className="chart-scroll is-dense">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Grid heatmap: one square per Georgia county showing its name and the change in Democratic two-party vote share from ${comparison.prev} to ${comparison.curr}; blue squares shifted toward Democrats, red toward Republicans, deeper tint means a larger shift; ${stats.flipped.length} outlined squares changed partisan majority`}
          >
            <defs>
              <linearGradient id={`swing-ramp-${electionKey}-${comparison.curr}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={tint(REP, TINT_CEIL)} />
                <stop offset="0.5" stopColor={tint(REP, TINT_FLOOR)} />
                <stop offset="0.5" stopColor={tint(DEM, TINT_FLOOR)} />
                <stop offset="1" stopColor={tint(DEM, TINT_CEIL)} />
              </linearGradient>
            </defs>

            {cells.map((r, i) => {
              const cx = gridX + (i % COLS) * (cellW + GAP);
              const cy = M.top + Math.floor(i / COLS) * (CELL_H + GAP);
              const fill = swingFill(r.shift, cap);
              const isPinned = pinned === r.county;
              const value = r.shift > 0 ? '#16347a' : r.shift < 0 ? '#8c0f18' : '#6b6680';
              return (
                <g
                  key={r.county}
                  style={{ cursor: 'pointer' }}
                  onMouseMove={(e) => {
                    setHover(r);
                    const box = e.currentTarget.closest('figure').getBoundingClientRect();
                    setPos({ x: e.clientX - box.left, y: e.clientY - box.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setPinned(isPinned ? null : r.county)}
                >
                  <title>
                    {`${r.name} County: ${r.shift > 0 ? '+' : ''}${(r.shift * 100).toFixed(1)} pts ` +
                      `(${comparison.prev}: ${(r.prevPct * 100).toFixed(1)}% D → ` +
                      `${comparison.curr}: ${(r.currPct * 100).toFixed(1)}% D)` +
                      `${r.flipped ? ' · changed partisan majority' : ''}`}
                  </title>
                  <rect
                    x={cx}
                    y={cy}
                    width={cellW}
                    height={CELL_H}
                    rx="5"
                    fill={fill}
                    stroke={isPinned ? '#4c2b86' : r.flipped ? '#1c1a2b' : 'none'}
                    strokeWidth={isPinned ? 2.6 : r.flipped ? 1.3 : 0}
                    strokeOpacity={isPinned ? 1 : 0.6}
                  />
                  <text
                    x={cx + cellW / 2}
                    y={cy + 18}
                    textAnchor="middle"
                    fontSize={nameSize(r.name)}
                    fontWeight="600"
                    fill="#3a3550"
                  >
                    {r.name}
                  </text>
                  <text x={cx + cellW / 2} y={cy + 34} textAnchor="middle" fontSize="11" fontWeight="700" fill={value}>
                    {shiftText(r.shift)}
                  </text>
                </g>
              );
            })}

            {/* colour ramp legend */}
            <g transform={`translate(${M.left}, ${H - 62})`}>
              <rect
                x="0"
                y="0"
                width="260"
                height="10"
                rx="5"
                fill={`url(#swing-ramp-${electionKey}-${comparison.curr})`}
                stroke="#d7d3e3"
                strokeWidth="0.6"
              />
              <text x="0" y="26" className="axis-label">
                −{cap} pts (R)
              </text>
              <text x="130" y="26" textAnchor="middle" className="axis-label">
                no change
              </text>
              <text x="260" y="26" textAnchor="end" className="axis-label">
                +{cap} pts (D)
              </text>
              <text x="284" y="9" className="axis-label">
                change in the Democratic two-party share{saturated ? ` · ${saturated} counties beyond ±${cap}` : ''}
              </text>
            </g>

            {/* flipped-county legend swatch */}
            <g transform={`translate(${M.left}, ${H - 22})`}>
              <rect x="0" y="-11" width="14" height="14" rx="3" fill={tint(REP, 0.3)} stroke="#1c1a2b" strokeWidth="1.3" strokeOpacity="0.6" />
              <text x="22" y="0" className="axis-label">
                outlined: the county changed partisan majority between {comparison.prev} and {comparison.curr} (
                {stats.flipped.length})
              </text>
            </g>
          </svg>
        </div>

        {hover && (
          <div className="map-tooltip" style={{ left: pos.x + 14, top: pos.y + 14 }} role="status">
            <strong>{hover.name} County</strong>
            <span>
              {hover.shift > 0 ? '+' : ''}
              {(hover.shift * 100).toFixed(1)} pts toward {hover.shift >= 0 ? 'Democrats' : 'Republicans'}
            </span>
            <span>
              {comparison.prev}: {fmtPct(hover.prevPct)} D → {comparison.curr}: {fmtPct(hover.currPct)} D
            </span>
            <em>
              rank {rankOf.get(hover.county)} of {rows.length} by size of shift · {fmtInt(hover.currVotes)} votes cast
              {hover.flipped ? ' · changed partisan majority' : ''}
            </em>
          </div>
        )}
      </figure>

      {pinnedRow && (
        <div className="map-selected" role="status">
          <strong>{pinnedRow.name} County</strong>
          <span>
            Democratic two-party share moved from {fmtPct(pinnedRow.prevPct)} in {comparison.prev} to{' '}
            {fmtPct(pinnedRow.currPct)} in {comparison.curr} — a shift of {pinnedRow.shift > 0 ? '+' : ''}
            {(pinnedRow.shift * 100).toFixed(1)} points, rank {rankOf.get(pinnedRow.county)} of {rows.length} by
            size. {fmtInt(pinnedRow.prevVotes)} votes were cast in {comparison.prev} and{' '}
            {fmtInt(pinnedRow.currVotes)} in {comparison.curr}.
            {pinnedRow.flipped
              ? ` The county now leans ${pinnedRow.currPct > 0.5 ? 'Democratic' : 'Republican'}; it leaned the other way in ${comparison.prev}.`
              : ` The county's partisan majority did not change.`}
          </span>
          <button type="button" className="primary-button" onClick={() => setPinned(null)}>
            Clear
          </button>
        </div>
      )}

      <p className="micro-note">
        {stats.toD.length} of {rows.length} counties moved toward Democrats and {stats.toR.length} toward Republicans
        between {comparison.prev} and {comparison.curr}; {stats.flipped.length} changed partisan majority. Tint depth is
        capped at ±{cap} points so a few extreme counties do not wash out the rest
        {saturated ? ` — ${saturated} counties sit beyond the cap and share its darkest shade` : ''}.
      </p>
    </Section>
  );
}
