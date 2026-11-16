import React, { useMemo } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { countyShifts, resolveCountyComparison } from '../lib/data';

/** Smallest "nice" axis bound that covers the data: 0.25, 0.5, 1, 2 or 5. */
function niceMax(v) {
  for (const c of [0.25, 0.5, 1, 2, 5, 10]) {
    if (v <= c) return c;
  }
  return Math.ceil(v);
}

const BLUE = '#1f4bae';
const RED = '#db1623';

/**
 * Section 02a — county-level vote swing, as a three-column lollipop chart.
 *
 * Every county gets one row: the dot sits on a signed axis centred at zero,
 * blue toward Democrats, red toward Republicans; the county's shift in points
 * is printed at the row end. Counties are sorted by |shift| and dealt into
 * three columns (largest shifts first) so all 159 counties fit in a figure
 * roughly as tall as it is wide instead of a 2,600px single column.
 */
export default function CountySwing({ countyGeoJSON, countyVotes, electionKey, year, chamberLabel }) {
  const comparison = useMemo(() => resolveCountyComparison(electionKey, year), [electionKey, year]);

  const arrows = useMemo(
    () => countyShifts(countyVotes, electionKey, comparison),
    [countyVotes, electionKey, comparison],
  );

  // ------------------------------------------------------------- layout
  const W = 1160;
  const COLS = 3;
  const rowH = 17;
  const M = { top: 62, right: 16, bottom: 52, left: 16 };
  const colGap = 30;
  const colW = (W - M.left - M.right - colGap * (COLS - 1)) / COLS;
  const labelW = 92; // county names, right-aligned
  const valueW = 46; // signed shift value, left-aligned
  const barPad = 10;
  const barW = colW - labelW - valueW - barPad * 2; // lollipop zone
  const rowsPerCol = Math.ceil(arrows.length / COLS);
  const H = arrows.length ? M.top + rowsPerCol * rowH + M.bottom : 200;

  const maxShift = useMemo(
    () => (arrows.length ? Math.max(...arrows.map((a) => Math.abs(a.shift))) : 0.01),
    [arrows],
  );
  const domain = niceMax(Math.max(maxShift, 0.05));
  const xScale = (shift) => (shift / domain) * (barW / 2); // px from column zero

  if (!comparison) {
    return (
      <Section id="county-swing" step="02a" kicker="County swings" title="No prior election for comparison">
        <p className="empty">
          Choose an election year with a previous cycle available to see county-level vote shifts.
        </p>
      </Section>
    );
  }

  if (arrows.length === 0) {
    return (
      <Section id="county-swing" step="02a" kicker="County swings" title="Data not available for this comparison">
        <p className="empty">
          Swing data unavailable for {comparison.prev} → {comparison.curr}.
        </p>
      </Section>
    );
  }

  const ticks = [-domain, -domain / 2, 0, domain / 2, domain];

  return (
    <Section
      id="county-swing"
      step="02a"
      kicker="County swings"
      title={`County-level vote shifts: ${comparison.prev} → ${comparison.curr}`}
      lede={`Each row is one county: the dot shows how far its Democratic share moved between ${comparison.prev} and ${comparison.curr} — blue toward Democrats, red toward Republicans. Counties are sorted by the size of the shift, largest first (left column), and every one of the ${arrows.length} counties is shown.`}
    >
      <figure className="chart">
        <FigureTools
          name={`county-swing-${electionKey}-${comparison.prev}-${comparison.curr}`}
          title="County vote shifts"
          subtitle={`Democratic share change by county, ${comparison.prev} → ${comparison.curr}`}
        />
        <figcaption>Vote shift from {comparison.prev} to {comparison.curr}, sorted by magnitude</figcaption>
        <div className="chart-scroll">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Lollipop chart of county vote shifts from ${comparison.prev} to ${comparison.curr}, sorted by magnitude`}
          >
            {/* legend */}
            <g transform={`translate(${M.left}, 20)`}>
              <circle cx="5" cy="-3" r="4" fill={BLUE} />
              <text x="15" y="0" className="axis-label" fontSize="11">
                shift toward Democrats
              </text>
              <circle cx="185" cy="-3" r="4" fill={RED} />
              <text x="195" y="0" className="axis-label" fontSize="11">
                shift toward Republicans
              </text>
              <text x="375" y="0" className="axis-label" fontSize="11" fill="#726d89">
                axis: change in the Democratic two-party share, percentage points
              </text>
            </g>

            {Array.from({ length: COLS }, (_, col) => {
              const rows = arrows.slice(col * rowsPerCol, (col + 1) * rowsPerCol);
              if (!rows.length) return null;
              const x0 = M.left + col * (colW + colGap);
              const barX0 = x0 + labelW + barPad;
              const zeroX = barX0 + barW / 2;
              const topRank = col * rowsPerCol + 1;
              const bottomRank = col * rowsPerCol + rows.length;
              return (
                <g key={col}>
                  {/* column header */}
                  <text x={x0} y={M.top - 16} className="axis-label" fontSize="10.5" fontWeight="700" fill="#726d89">
                    {col === 0
                      ? `Largest shifts · ranks ${topRank}–${bottomRank}`
                      : `Ranks ${topRank}–${bottomRank}`}
                  </text>

                  {/* zero line + gridlines */}
                  {ticks.map((t) => (
                    <line
                      key={t}
                      x1={zeroX + xScale(t)}
                      x2={zeroX + xScale(t)}
                      y1={M.top - 6}
                      y2={M.top + rows.length * rowH + 4}
                      className={t === 0 ? 'zero-line' : 'gridline'}
                    />
                  ))}

                  {/* rows */}
                  {rows.map((a, i) => {
                    const yc = M.top + i * rowH + rowH / 2 + 1;
                    const dx = xScale(a.shift);
                    const color = a.shift >= 0 ? BLUE : RED;
                    const tipX = zeroX + dx;
                    return (
                      <g key={a.county}>
                        <title>
                          {`${a.county} County: ${a.shift >= 0 ? '+' : ''}${(a.shift * 100).toFixed(1)} pts ` +
                            `(${comparison.prev}: ${(a.prevPct * 100).toFixed(1)}% D → ` +
                            `${comparison.curr}: ${(a.currPct * 100).toFixed(1)}% D)`}
                        </title>
                        <line x1={zeroX} x2={tipX} y1={yc} y2={yc} stroke={color} strokeWidth="1.4" opacity="0.75" />
                        <circle cx={tipX} cy={yc} r="3.1" fill={color} />
                        <text
                          x={x0 + labelW}
                          y={yc + 3.5}
                          textAnchor="end"
                          className="county-label"
                          fontSize="10.5"
                          fill="#4c4863"
                        >
                          {a.county}
                        </text>
                        <text
                          x={x0 + colW - valueW + 6}
                          y={yc + 3.5}
                          textAnchor="start"
                          className="shift-value"
                          fontSize="10"
                          fontWeight="600"
                          fill={color}
                        >
                          {`${a.shift >= 0 ? '+' : ''}${(a.shift * 100).toFixed(1)}`}
                        </text>
                      </g>
                    );
                  })}

                  {/* column axis ticks */}
                  {ticks.map((t) => (
                    <text
                      key={t}
                      x={zeroX + xScale(t)}
                      y={M.top + rows.length * rowH + 18}
                      textAnchor="middle"
                      className="axis-label"
                    >
                      {t > 0 ? `+${t}` : t}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </figure>

      <div className="story-footer">
        <strong>{comparison.prev} baseline:</strong> the same two-party measure as “The swing” ·{' '}
        <strong>{comparison.curr}:</strong> same measure. Shift = {comparison.curr} Democratic share minus{' '}
        {comparison.prev} Democratic share, in percentage points; all {arrows.length} counties shown, largest
        swings first.
      </div>
    </Section>
  );
}
