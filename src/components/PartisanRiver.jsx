import React, { useEffect, useMemo, useState } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { fmtInt, fmtPct, PARTY } from '../lib/data';

/** District label per chamber, matching the rest of the story: HD / SD / CD. */
const PREFIX = { state_house: 'HD', state_senate: 'SD', us_house: 'CD' };

/**
 * Section 03a — Partisan River / Competitive Landscape.
 *
 * One dot per contested district, ordered left (most Democratic) to right
 * (most Republican) by its two-party Democratic share, with the connecting
 * line forming the "river". The shaded band is the competitive range
 * (45–55% Democratic). Uncontested seats carry no two-party share and are
 * counted separately below the chart instead of being plotted at 0% or 100%.
 */
export default function PartisanRiver({ contests, chamber, year, chamberLabel }) {
  const contestList = contests?.[chamber]?.[String(year)] || [];

  // Hover tooltip + click-to-pin interaction state.
  const [hover, setHover] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [pinned, setPinned] = useState(null);
  useEffect(() => {
    setPinned(null);
    setHover(null);
  }, [chamber, year]);

  const { districts, uncontested } = useMemo(() => {
    const rows = contestList
      .filter((c) => !c.uncontested && (c.d || 0) + (c.r || 0) > 0)
      .map((c) => {
        const twoParty = (c.d || 0) + (c.r || 0);
        const demShare = (c.d || 0) / twoParty;
        return {
          id: c.district,
          demShare,
          demWon: demShare > 0.5,
          winnerParty: c.winnerParty,
          winnerName: c.winnerName,
          margin: c.marginShare,
        };
      })
      .sort((a, b) => a.demShare - b.demShare);
    return { districts: rows, uncontested: contestList.filter((c) => c.uncontested).length };
  }, [contestList]);

  if (!contestList.length) {
    return (
      <Section
        id="partisan-river"
        step="03a"
        kicker="Competitive landscape"
        title="No district data available for this selection"
        lede="Select a year and chamber with district-level data to view the competitive landscape."
      />
    );
  }

  // Full-width figure; the y domain is the honest 0–100%.
  const dc = PREFIX[chamber] || 'District';
  const W = 1160;
  const H = 480;
  const M = { top: 30, right: 30, bottom: 56, left: 58 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const xScale = (i) => M.left + (i / Math.max(1, districts.length - 1)) * plotW;
  const yScale = (share) => M.top + plotH - share * plotH;

  const competitiveMin = 0.45;
  const competitiveMax = 0.55;
  const bandTop = yScale(competitiveMax);
  const bandBottom = yScale(competitiveMin);

  const demWins = districts.filter((d) => d.emWon).length;
  const repWins = districts.length - demWins;
  const inBand = districts.filter((d) => d.demShare >= competitiveMin && d.demShare <= competitiveMax).length;
  const within5 = districts.filter((d) => (d.margin || 0) < 0.05).length;

  const pinnedIdx = districts.findIndex((d) => d.id === pinned);
  const pinnedD = pinnedIdx >= 0 ? districts[pinnedIdx] : null;

  return (
    <Section
      id="partisan-river"
      step="03a"
      kicker="Competitive landscape"
      title={`How competitive are ${chamberLabel.toLowerCase()} districts?`}
      lede={`Each dot is one of the ${districts.length} contested ${chamberLabel.toLowerCase()} seats in ${year}, ordered left to right from most Democratic to most Republican by two-party vote share. The shaded band is the competitive range (45–55% Democratic), where a district could plausibly swing either way; the connecting line is the partisan "river" across the chamber.`}
      aside={
        <div className="aside-block">
          <p className="aside-title">The landscape in numbers</p>
          <dl className="index-list">
            <div>
              <dt>Democratic wins</dt>
              <dd>
                <strong>{demWins}</strong> districts
              </dd>
            </div>
            <div>
              <dt>Republican wins</dt>
              <dd>
                <strong>{repWins}</strong> districts
              </dd>
            </div>
            <div>
              <dt>Inside 45–55%</dt>
              <dd>
                <strong>{inBand || '—'}</strong> districts
              </dd>
            </div>
            <div>
              <dt>Decided by under 5 points</dt>
              <dd>
                <strong>{within5}</strong> districts
              </dd>
            </div>
            <div>
              <dt>Uncontested (not plotted)</dt>
              <dd>
                <strong>{uncontested}</strong> seats
              </dd>
            </div>
          </dl>
        </div>
      }
      footer={`Source: fdga/contests.parquet, ${year} ${chamberLabel}. Two-party share = Democratic votes ÷ (Democratic + Republican votes). ${uncontested} uncontested seats have no opposing-party share and are excluded from the chart.`}
    >
      <figure className="chart">
        <FigureTools
          name={`partisan-river-${chamber}-${year}`}
          title="Competitive landscape"
          subtitle={`${chamberLabel} contested districts ordered by Democratic vote share, ${year}`}
        />
        <figcaption>Every contested district, ordered by Democratic two-party share</figcaption>
        <div className="chart-scroll">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`River chart of ${districts.length} contested ${chamberLabel} districts in ${year}, ordered by Democratic two-party vote share, with the 45 to 55 percent competitive band shaded`}
          >
            {/* competitive band */}
            <rect x={M.left} y={bandTop} width={plotW} height={Math.max(0, bandBottom - bandTop)} fill="#6440a4" opacity="0.08" />
            <line x1={M.left} x2={M.left + plotW} y1={bandTop} y2={bandTop} className="gridline" />
            <line x1={M.left} x2={M.left + plotW} y1={bandBottom} y2={bandBottom} className="gridline" />
            <text x={M.left + plotW - 4} y={bandTop - 6} textAnchor="end" className="axis-label">
              competitive range 45–55% D
            </text>

            {/* horizontal gridlines + y ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line
                  x1={M.left}
                  x2={M.left + plotW}
                  y1={yScale(t)}
                  y2={yScale(t)}
                  className={t === 0.5 ? 'zero-line' : 'gridline'}
                />
                <text x={M.left - 8} y={yScale(t) + 3.5} textAnchor="end" className={`axis-label${t === 0.5 ? ' is-current' : ''}`}>
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}

            {/* the river */}
            {districts.length > 1 && (
              <polyline
                points={districts.map((d, i) => `${xScale(i).toFixed(1)},${yScale(d.demShare).toFixed(1)}`).join(' ')}
                fill="none"
                stroke="#bdb7cf"
                strokeWidth="1.6"
                opacity="0.8"
              />
            )}

            {/* District dots: hover for a tooltip, click to pin the label */}
            {districts.map((d, i) => {
              const inComp = d.demShare >= competitiveMin && d.demShare <= competitiveMax;
              const isPinned = pinned === d.id;
              return (
                <g key={d.id}>
                  <title>
                    {`${dc} ${String(Number(d.id))}: ${fmtPct(d.demShare)} Democratic` +
                      `${d.winnerName ? ` — ${d.winnerName}` : ''} (${d.demWon ? 'D' : 'R'} win, margin ${fmtPct(d.margin)})`}
                  </title>
                  <circle
                    cx={xScale(i)}
                    cy={yScale(d.demShare)}
                    r={inComp ? 5 : 4}
                    fill={d.demWon ? PARTY.D : PARTY.R}
                    stroke={inComp || isPinned ? '#7d3169' : '#ffffff'}
                    strokeWidth={inComp ? 1.6 : 1.2}
                    opacity="0.9"
                    pointerEvents="none"
                  />
                  <circle
                    cx={xScale(i)}
                    cy={yScale(d.demShare)}
                    r="9"
                    fill="transparent"
                    pointerEvents="all"
                    style={{ cursor: 'pointer' }}
                    onMouseMove={(e) => {
                      setHover(d);
                      const box = e.currentTarget.closest('figure').getBoundingClientRect();
                      setPos({ x: e.clientX - box.left, y: e.clientY - box.top });
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setPinned(isPinned ? null : d.id)}
                  />
                </g>
              );
            })}

            {/* Pinned district: plum ring + permanent label */}
            {pinnedD && (
              <g pointerEvents="none">
                <circle
                  cx={xScale(pinnedIdx)}
                  cy={yScale(pinnedD.demShare)}
                  r="8.5"
                  fill="none"
                  stroke="#7d3169"
                  strokeWidth="1.6"
                />
                <text
                  x={xScale(pinnedIdx)}
                  y={
                    yScale(pinnedD.demShare) < M.top + 22
                      ? yScale(pinnedD.demShare) + 24
                      : yScale(pinnedD.demShare) - 13
                  }
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight="700"
                  fill="#7d3169"
                  stroke="#ffffff"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {dc} {String(Number(pinnedD.id))}
                </text>
              </g>
            )}

            {/* axes */}
            <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + plotH} className="axis-line" />
            <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} className="axis-line" />
            <text x={M.left} y={H - 30} className="axis-label">
              ← most Democratic
            </text>
            <text x={M.left + plotW} y={H - 30} textAnchor="end" className="axis-label">
              most Republican →
            </text>
            <text x={M.left + plotW / 2} y={H - 12} textAnchor="middle" className="axis-label" fontSize="11">
              {districts.length} contested districts, ordered by Democratic two-party share
            </text>
          </svg>
        </div>

        {hover && (
          <div className="map-tooltip" style={{ left: pos.x + 14, top: pos.y + 14 }} role="status">
            <strong>
              {dc} {String(Number(hover.id))}
            </strong>
            <span>
              {fmtPct(hover.demShare)} Democratic · margin {fmtPct(hover.margin)}
            </span>
            <em>
              {hover.winnerParty === 'D' ? 'Democratic' : 'Republican'} win
              {hover.winnerName ? ` — ${hover.winnerName}` : ''}
            </em>
          </div>
        )}

        <div className="legend">
          <span className="legend-item">
            <i style={{ background: PARTY.D, height: 9, width: 9, borderRadius: '50%' }} /> Democratic winner
          </span>
          <span className="legend-item">
            <i style={{ background: PARTY.R, height: 9, width: 9, borderRadius: '50%' }} /> Republican winner
          </span>
          <span className="legend-item">
            <i style={{ background: 'transparent', border: '1.6px solid #7d3169', height: 9, width: 9, borderRadius: '50%' }} />{' '}
            inside the competitive range
          </span>
          <span className="legend-hint">
            Hover a dot for details · click to pin its district label · {fmtInt(uncontested)} uncontested seats not
            plotted
          </span>
        </div>
      </figure>
    </Section>
  );
}
