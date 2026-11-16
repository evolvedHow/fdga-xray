import React, { useMemo } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { fmtInt, fmtPct, PARTY } from '../lib/data';

/**
 * Competitive zone, as FDGA and the Princeton Gerrymandering Project define it:
 * a district whose two-party Democratic share lands between 46.5% and 53.5%.
 */
const BAND = [0.465, 0.535];

/** Margin buckets used for the competitiveness composition bars. */
const MARGIN_BUCKETS = [
  { key: 'close', label: 'inside 5', test: (m) => m < 5, fill: '#4c2b86' },
  { key: 'lean', label: '5–10', test: (m) => m >= 5 && m < 10, fill: '#8b6fc4' },
  { key: 'safe', label: '10–20', test: (m) => m >= 10 && m < 20, fill: '#c3b6e0' },
  { key: 'foregone', label: '20+', test: (m) => m >= 20, fill: '#e6e2f2' },
];

/** Signed point shift, e.g. +36.1 pts (shiftPts is already in points). */
const pts = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pts`;

/** District label per chamber: HD / SD / CD. */
const PREFIX = { state_house: 'HD', state_senate: 'SD', us_house: 'CD' };

/**
 * Section 3 — how the 2024 map changed the election, holding the voters fixed.
 *
 * The same 2024 presidential votes are counted twice: once under the 2021–23
 * lines, once under the 2024 remedial lines. Both plan files carry per-district
 * shares derived from the same VTD vote file, so the difference between the two
 * counts is the map and nothing else — no turnout change, no candidate quality,
 * no estimation.
 *
 * Figure 1 is a full-width scatter: x = a district's Democratic share under the
 * old lines, y = its share under the new ones. The diagonal is "no change"; a
 * stem's length is the shift the map produced. Flips and the largest movers are
 * labelled with greedy collision avoidance.
 */
export default function MapEffect({ effect, sources, chamberLabel, year }) {
  const districts = useMemo(
    () => (effect ? [...effect.districts].sort((a, b) => b.shiftPts - a.shiftPts) : []),
    [effect],
  );

  const p24 = useMemo(
    () => effect?.signals.find((s) => s.key === 'p24') || effect?.signals[0],
    [effect],
  );

  if (!effect || !p24) return null;

  const prior = effect.index.prior;
  const current = effect.index.current;
  const disp = effect.displacement;

  const lostByD = p24.flips.filter((f) => f.priorParty === 'D');
  const wonByD = p24.flips.filter((f) => f.priorParty === 'R');
  const netSeats = p24.currentSeatsD - p24.priorSeatsD;
  const seatWord = netSeats === 0 ? 'no net change' : `${netSeats > 0 ? '+' : ''}${netSeats} seat`;

  const remedyIds = effect.becameBvapMajority.map((r) => r.district);
  const source = (id) => sources?.find((s) => s.id === id);
  const dc = PREFIX[effect.chamber] || 'District';

  // Congressional districts are already equal to the person, so the population
  // that equality "requires" is a handful of people; a multiple against it is
  // meaningless and is replaced with the plain share.
  const minimumIsTrivial = disp.arithmeticMinimum < 1000;
  const multipleLabel =
    !minimumIsTrivial && disp.multiple
      ? `${disp.multiple.toFixed(0)}× the arithmetic minimum`
      : 'against almost no required movement';

  const inBand = (pct) => pct >= BAND[0] && pct <= BAND[1];
  const bandPrior = effect.districts.filter((d) => inBand(d.priorPct)).length;
  const bandCurrent = effect.districts.filter((d) => inBand(d.currentPct)).length;

  const moved = disp.districts || [];
  const heavy = moved.filter((d) => d.displacedPct >= 0.3).length;
  const worst = moved.slice(0, 4);

  // ---------------------------------------------------------------- figure 1
  // Full-width scatter: old-lines share (x) vs new-lines share (y).
  const W = 1160;
  const H = 620;
  const M = { top: 40, right: 30, bottom: 56, left: 66 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const allPct = districts.flatMap((d) => [d.priorPct, d.currentPct]);
  const lo = Math.max(0, Math.floor(Math.min(...allPct) * 20) / 20 - 0.025);
  const hi = Math.min(1, Math.ceil(Math.max(...allPct) * 20) / 20 + 0.025);
  const x = (v) => M.left + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * plotW;
  const y = (v) => M.top + plotH - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * plotH;

  const flipSet = new Set(
    districts.filter((d) => (d.priorPct > 0.5) !== (d.currentPct > 0.5)).map((d) => String(d.district)),
  );
  const remedySet = new Set(remedyIds.map(String));
  const tickSet = new Set([0.25, 0.5, 0.75].filter((t) => t > lo && t < hi));
  if (lo < 0.5 && hi > 0.5) tickSet.add(0.5);
  const ticks = Array.from(tickSet).sort((a, b) => a - b);

  // Labels: flips first, then remedy districts, then the biggest movers.
  const labelCandidates = [
    ...districts.filter((d) => flipSet.has(String(d.district))),
    ...districts.filter((d) => !flipSet.has(String(d.district)) && remedySet.has(String(d.district))),
    ...districts.filter(
      (d) => !flipSet.has(String(d.district)) && !remedySet.has(String(d.district)) && Math.abs(d.shiftPts) >= 10,
    ),
  ].sort((a, b) => Math.abs(b.shiftPts) - Math.abs(a.shiftPts));

  const placedBoxes = [];
  const placeLabel = (dotX, dotY, text) => {
    const w = text.length * 5.6 + 6;
    const h = 12;
    const cands = [
      [dotX + 9, dotY + 3.5],
      [dotX + 9, dotY - 7],
      [dotX - w - 7, dotY + 3.5],
      [dotX - w - 7, dotY - 7],
      [dotX + 12, dotY + 15],
      [dotX + 12, dotY - 18],
      [dotX - w - 10, dotY + 15],
    ];
    for (const [lx, ly] of cands) {
      const box = { x0: lx - 2, y0: ly - h + 3, x1: lx + w + 2, y1: ly + 4 };
      if (box.x0 < M.left - 4 || box.x1 > W - M.right + 4 || box.y0 < 6 || box.y1 > H - M.bottom + 14) continue;
      const hit = placedBoxes.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
      if (hit) continue;
      placedBoxes.push(box);
      return { lx, ly, anchor: lx < dotX ? 'end' : 'start' };
    }
    return null;
  };

  const labels = [];
  for (const d of labelCandidates) {
    const text = `${dc} ${d.district}`;
    const at = placeLabel(x(d.currentPct), y(d.currentPct), text);
    if (at) labels.push({ d, text, ...at });
  }

  // ---------------------------------------------------------------- figure 2
  const CW = 1160;
  const CH = 150;
  const CM = { top: 22, right: 96, bottom: 36, left: 92 };
  const cPlotW = CW - CM.left - CM.right;
  const barH = 26;
  const buckets = MARGIN_BUCKETS.map((b) => ({
    ...b,
    prior: effect.districts.filter((d) => b.test(Math.abs(d.priorPct - 0.5) * 100)).length,
    current: effect.districts.filter((d) => b.test(Math.abs(d.currentPct - 0.5) * 100)).length,
  }));
  const rowsFor = [
    { key: 'prior', label: effect.prior.label, y: CM.top },
    { key: 'current', label: effect.current.label, y: CM.top + 48 },
  ];

  // ---------------------------------------------------------------- figure 3
  const DW = 1160;
  const DH = 300;
  const DM = { top: 52, right: 16, bottom: 32, left: 14 };
  const dPlotW = DW - DM.left - DM.right;
  const dPlotH = DH - DM.top - DM.bottom;
  const slot = dPlotW / Math.max(1, moved.length);
  const maxMove = Math.max(0.05, ...moved.map((d) => d.displacedPct || 0));

  const isHistoricalData = year !== 2024;
  const yearNote = isHistoricalData
    ? ` (Note: this comparison uses 2024 presidential vote data, shown for context even though you're viewing ${year} results)`
    : '';

  return (
    <Section
      id="mapswap"
      step="03"
      kicker={`The map swap · ${chamberLabel} · 2024 redistricting effect${isHistoricalData ? ' (historical)' : ''}`}
      title={
        lostByD.length && wonByD.length
          ? `The 2024 redistricting gave Democrats ${wonByD.length} district${wonByD.length === 1 ? '' : 's'} and took ${lostByD.length} away`
          : 'The 2024 maps: same voters, different lines'
      }
      lede={`How the 2024 redistricting affected ${chamberLabel.toLowerCase()} by comparing the ${effect.prior.label} to the ${effect.current.label}, using the 2024 presidential vote. The seat count moved from ${p24.priorSeatsD} to ${p24.currentSeatsD} (${seatWord}), while ${fmtInt(disp.people)} people — ${fmtPct(disp.pct)} of the state — landed in a different district.${yearNote}`}
      aside={
        <div className="aside-block">
          <p className="aside-title">What the swap did not change</p>
          <dl className="index-list">
            <div>
              <dt>Seats leaning Democratic</dt>
              <dd>
                {p24.priorSeatsD} → <strong>{p24.currentSeatsD}</strong>
              </dd>
            </div>
            <div>
              <dt>Inside the competitive zone</dt>
              <dd>
                {bandPrior} → <strong>{bandCurrent}</strong>
              </dd>
            </div>
            <div>
              <dt>Decided by less than 5 points</dt>
              <dd>
                {prior.competitive5} → <strong>{current.competitive5}</strong>
              </dd>
            </div>
            <div>
              <dt>Decided by less than 10 points</dt>
              <dd>
                {prior.competitive10} → <strong>{current.competitive10}</strong>
              </dd>
            </div>
            <div>
              <dt>Average margin</dt>
              <dd>
                {prior.meanMargin.toFixed(1)} → <strong>{current.meanMargin.toFixed(1)} pts</strong>
              </dd>
            </div>
            <div>
              <dt>Median district lean</dt>
              <dd>
                {(prior.medianLean * 100).toFixed(1)} → <strong>{(current.medianLean * 100).toFixed(1)}% D</strong>
              </dd>
            </div>
          </dl>
          <p className="micro-note">
            The median district sits {Math.abs((0.5 - current.medianLean) * 100).toFixed(1)} points from a tie (
            {current.medianLean < 0.5 ? 'toward Republicans' : 'toward Democrats'}) while the average district sits
            at {(current.meanLean * 100).toFixed(1)}% D. When the middle district and the average district disagree,
            one party is packed into fewer districts.
          </p>
        </div>
      }
      footer={`Method: both plan files carry district-level shares computed from one VTD vote file, so the two counts differ only by the lines. Displacement is area-weighted population reassignment; the "arithmetic minimum" is the population that equalising district sizes requires (${fmtInt(disp.arithmeticMinimum)} people, ${fmtPct(disp.arithmeticMinimumPct, 2)}). Competitive zone = 46.5–53.5% two-party Democratic share, the threshold used in FDGA's 2022 evaluation with the Princeton Gerrymandering Project.`}
    >
      <div className="kpi-row">
        <div className="kpi is-flag">
          <span className="kpi-label">People reassigned</span>
          <strong>{fmtInt(disp.people)}</strong>
          <span className="kpi-sub">
            {fmtPct(disp.pct)} of Georgia · {multipleLabel}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Districts changing hands</span>
          <strong>{p24.flips.length}</strong>
          <span className="kpi-sub">
            {wonByD.length} to Democrats, {lostByD.length} to Republicans
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Net seat change</span>
          <strong>{seatWord}</strong>
          <span className="kpi-sub">
            {p24.priorSeatsD} → {p24.currentSeatsD} of {effect.seats} seats
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Competitive seats</span>
          <strong>{bandCurrent}</strong>
          <span className="kpi-sub">
            inside 3.5 points, out of {effect.seats}
          </span>
        </div>
      </div>

      <figure className="chart">
        <FigureTools
          name={`map-swap-${effect.chamber}`}
          title={`The 2024 redistricting effect on ${effect.label}: each district's 2024 presidential vote under both maps`}
          subtitle={`Every district: Democratic share under the ${effect.prior.label.toLowerCase()} (x) against the ${effect.current.label.toLowerCase()} (y)${isHistoricalData ? ' (shown for context with ' + year + ' results)' : ''}`}
        />
        <figcaption>The 2024 presidential vote in every district, under the old lines and the new ones</figcaption>
        <div className="chart-scroll">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Scatter plot: 2024 Democratic share in all ${effect.seats} districts under the ${effect.prior.label} on the x-axis and the ${effect.current.label} on the y-axis. Points on the dashed diagonal did not change; stems show the shift the new map produced.`}
          >
            {/* competitive zone: vertical band = old lines, horizontal band = new lines */}
            <rect x={x(BAND[0])} y={M.top} width={x(BAND[1]) - x(BAND[0])} height={plotH} fill="#6440a4" opacity="0.05" />
            <rect x={M.left} y={y(BAND[1])} width={plotW} height={y(BAND[0]) - y(BAND[1])} fill="#6440a4" opacity="0.05" />

            {/* gridlines + 50% crosshair */}
            {ticks.map((t) => (
              <g key={`gx-${t}`}>
                <line x1={x(t)} x2={x(t)} y1={M.top} y2={M.top + plotH} className={t === 0.5 ? 'zero-line' : 'gridline'} />
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} className={t === 0.5 ? 'zero-line' : 'gridline'} />
              </g>
            ))}

            {/* no-change diagonal */}
            <line
              x1={x(lo)}
              y1={y(lo)}
              x2={x(hi)}
              y2={y(hi)}
              stroke="#8b87a3"
              strokeWidth="1.2"
              strokeDasharray="5 4"
              opacity="0.8"
            />
            <text x={x(hi) - 6} y={y(hi) + 16} textAnchor="end" className="axis-label" fill="#726d89">
              no change
            </text>

            {/* districts: grey dot on the diagonal (old lines), coloured dot at the new share */}
            {districts.map((d) => {
              const sx = x(d.priorPct);
              const sy0 = y(d.priorPct);
              const sy1 = y(d.currentPct);
              const up = d.shiftPts > 0;
              const big = Math.abs(d.shiftPts) >= 10;
              const flip = flipSet.has(String(d.district));
              return (
                <g key={d.district} opacity={big || flip ? 1 : 0.6}>
                  <title>
                    {`${dc} ${d.district} — ${effect.prior.label}: ${(d.priorPct * 100).toFixed(1)}% D → ` +
                      `${effect.current.label}: ${(d.currentPct * 100).toFixed(1)}% D (${pts(d.shiftPts)})`}
                  </title>
                  <line x1={sx} x2={sx} y1={sy0} y2={sy1} stroke={up ? PARTY.D : PARTY.R} strokeWidth={big || flip ? 1.5 : 1} opacity="0.55" />
                  <circle cx={sx} cy={sy0} r="1.9" fill="#a9a3bf" />
                  <circle
                    cx={sx}
                    cy={sy1}
                    r={big || flip ? 3.6 : 2.5}
                    fill={d.currentPct > 0.5 ? PARTY.D : PARTY.R}
                    stroke={flip ? '#7d3169' : 'none'}
                    strokeWidth={flip ? 1.5 : 0}
                  />
                </g>
              );
            })}

            {/* labels for flips, remedy districts and the biggest movers */}
            {labels.map(({ d, text, lx, ly, anchor }) => {
              const dotX = x(d.currentPct);
              const dotY = y(d.currentPct);
              const up = d.shiftPts > 0;
              return (
                <g key={`lbl-${d.district}`}>
                  <line x1={dotX} y1={dotY} x2={anchor === 'start' ? lx - 2 : lx + 2} y2={ly - 3.5} stroke="#d7d3e3" strokeWidth="0.7" />
                  <text x={lx} y={ly} textAnchor={anchor} className="axis-label is-current" fontSize="10" fill={up ? PARTY.D : PARTY.R}>
                    {text}
                  </text>
                </g>
              );
            })}

            {/* axes */}
            <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} className="axis-line" />
            <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + plotH} className="axis-line" />
            {ticks.map((t) => (
              <g key={`t-${t}`}>
                <text x={x(t)} y={M.top + plotH + 18} textAnchor="middle" className={`axis-label${t === 0.5 ? ' is-current' : ''}`}>
                  {Math.round(t * 100)}% D
                </text>
                <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" className={`axis-label${t === 0.5 ? ' is-current' : ''}`}>
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            <text x={M.left + plotW / 2} y={H - 12} textAnchor="middle" className="axis-label" fontSize="11">
              {effect.prior.label}: Democratic two-party share
            </text>
            <text
              x={16}
              y={M.top + plotH / 2}
              textAnchor="middle"
              className="axis-label"
              fontSize="11"
              transform={`rotate(-90 16 ${M.top + plotH / 2})`}
            >
              {effect.current.label}: Democratic two-party share
            </text>
            <text x={(x(BAND[0]) + x(BAND[1])) / 2} y={M.top - 10} textAnchor="middle" className="axis-label">
              competitive zone
            </text>
          </svg>
        </div>
      </figure>

      <p className="micro-note">
        Grey dot: where the district sat under the {effect.prior.label} (on the diagonal). Coloured dot: where it
        lands under the {effect.current.label}; the stem between them is the shift the map produced, with no voter
        changing their mind. A plum ring marks the {p24.flips.length} districts that changed party control; a stem
        crossing the shaded band is a district that left the competitive zone.
      </p>

      <figure className="chart">
        <FigureTools
          name={`map-swap-margins-${effect.chamber}`}
          title={`${effect.label}: how safe each seat is, before and after`}
          subtitle="Districts grouped by the 2024 presidential margin, under each set of lines"
        />
        <figcaption>How many seats are decided by how much</figcaption>
        <svg
          viewBox={`0 0 ${CW} ${CH}`}
          role="img"
          aria-label="Two stacked bars comparing the number of safe and competitive seats under both maps"
        >
          {rowsFor.map((row) => {
            let offset = 0;
            return (
              <g key={row.key}>
                <text
                  x={CM.left - 10}
                  y={row.y + barH / 2 + 4}
                  textAnchor="end"
                  className={`axis-label ${row.key === 'current' ? 'is-current' : ''}`}
                  fontSize="11"
                >
                  {row.label}
                </text>
                {buckets.map((b) => {
                  const count = b[row.key];
                  const w = (count / effect.seats) * cPlotW;
                  const bx = CM.left + offset;
                  offset += w;
                  return (
                    <g key={b.key}>
                      <rect x={bx} y={row.y} width={Math.max(0, w)} height={barH} fill={b.fill} />
                      {w > 30 && (
                        <text
                          x={bx + w / 2}
                          y={row.y + barH / 2 + 4}
                          textAnchor="middle"
                          className="bar-value"
                          fill={b.key === 'close' ? '#ffffff' : '#3a3550'}
                        >
                          {count}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text x={CM.left + cPlotW + 10} y={row.y + barH / 2 + 4} className="axis-label" fontSize="11">
                  {buckets[3][row.key]} seats 20+
                </text>
              </g>
            );
          })}
          {/* Legend items at fixed spacing: proportional offsets collide when
              a chamber has few seats (e.g. the 56-seat Senate). */}
          {buckets.map((b, i) => (
            <g key={`legend-${b.key}`}>
              <rect x={CM.left + i * 150} y={CH - 24} width="10" height="10" rx="2" fill={b.fill} />
              <text x={CM.left + i * 150 + 14} y={CH - 15} className="axis-label" fontSize="11">
                {b.label}
              </text>
            </g>
          ))}
          <text x={CW - 6} y={CH - 15} textAnchor="end" className="axis-label" fontSize="11">
            margin in points
          </text>
        </svg>
      </figure>

      <figure className="chart">
        <FigureTools
          name={`map-swap-displacement-${effect.chamber}`}
          title={`${effect.label}: how much of each district's population was moved`}
          subtitle="Share of each district's residents reassigned to a different district, sorted largest first; tick shows the share population equality required"
        />
        <figcaption>Population moved out of each district, against what equality required</figcaption>
        <svg
          viewBox={`0 0 ${DW} ${DH}`}
          role="img"
          aria-label="Bar chart of the share of each district's population reassigned, compared with the share required for population equality"
        >
          {[0, 0.25, 0.5, 0.75].map((t) => (
            <g key={t}>
              <line
                x1={DM.left}
                x2={DW - DM.right}
                y1={DM.top + dPlotH * t}
                y2={DM.top + dPlotH * t}
                className="gridline"
              />
              <text x={DW - DM.right} y={DM.top + dPlotH * t - 5} textAnchor="end" className="axis-label">
                {Math.round((1 - t) * maxMove * 100)}%
              </text>
            </g>
          ))}

          {moved.map((d, i) => {
            const pct = d.displacedPct || 0;
            const h = (pct / maxMove) * dPlotH;
            const bx = DM.left + i * slot;
            const requiredH = Math.max(0.6, ((d.requiredPct || 0) / maxMove) * dPlotH);
            return (
              <g key={d.district}>
                <title>
                  {`${dc} ${d.district}: ${(pct * 100).toFixed(1)}% of residents moved to a different district ` +
                    `(equality required ${((d.requiredPct || 0) * 100).toFixed(1)}%)`}
                </title>
                <rect
                  x={bx}
                  y={DM.top + dPlotH - h}
                  width={Math.max(1, slot - 0.8)}
                  height={Math.max(0.6, h)}
                  fill={pct >= 0.3 ? '#7d3169' : '#b9a7c9'}
                />
                <rect x={bx} y={DM.top + dPlotH - requiredH} width={Math.max(1, slot - 0.8)} height={requiredH} fill="#1c1a2b" opacity="0.55" />
              </g>
            );
          })}

          <line x1={DM.left} x2={DW - DM.right} y1={DM.top + dPlotH} y2={DM.top + dPlotH} className="axis-line" />

          {/* The four largest bars sit within a few points of each other, so
              per-bar text always collides: mark them with triangles instead
              and list them in one annotation line above the plot. */}
          {worst.map((d, i) => {
            const barX = DM.left + i * slot + slot / 2;
            const barTopY = DM.top + dPlotH - ((d.displacedPct || 0) / maxMove) * dPlotH;
            return (
              <polygon
                key={`mark-${d.district}`}
                points={`${barX - 3.4},${barTopY - 6} ${barX + 3.4},${barTopY - 6} ${barX},${barTopY - 1}`}
                fill="#7d3169"
              />
            );
          })}
          <text x={DM.left} y={18} className="axis-label" fontSize="11" fontWeight="600" fill="#4c4863">
            ▴ Four largest: {worst.map((d) => `${dc} ${d.district} (${Math.round((d.displacedPct || 0) * 100)}%)`).join(' · ')}
          </text>
          <text x={DW - DM.right} y={DH - 10} textAnchor="end" className="axis-label">
            {moved.length} districts · dark bar above 30% moved
          </text>
        </svg>
      </figure>

      <p className="micro-note">
        {heavy} districts had at least 30% of their residents reassigned; the four largest are marked ▴ and listed
        above the chart. The black tick on each bar is the share that had to move to equalise population — under 1%
        almost everywhere. Districts keep their numbers between plans, so “moved” means residents of district{' '}
        {worst[0]?.district} were handed to a different member.
      </p>

      <div className="law-note">
        <p>
          <strong>There is no legal limit on how many voters a map may move.</strong>{' '}
          {minimumIsTrivial ? (
            <>
              Equalising district populations required moving {fmtInt(disp.arithmeticMinimum)} people, so the{' '}
              {fmtInt(disp.people)} reassigned here are not explained by population equality at all.
            </>
          ) : (
            <>
              The {fmtInt(disp.people)} people above are {disp.multiple?.toFixed(0)}× the {fmtInt(disp.arithmeticMinimum)}{' '}
              ({fmtPct(disp.arithmeticMinimumPct, 2)}) that equalising district populations forces any map to move.
            </>
          )}{' '}
          That is arithmetic, not a rule: exceeding it is not, by itself, unlawful, and this story does not claim that
          it is.
        </p>
        <p>
          <strong>What the court did order:</strong> on 26 October 2023 a federal court held that the 2021 House and
          Senate plans violated{' '}
          {source('vra-section-2') ? (
            <a href={source('vra-section-2').url} target="_blank" rel="noreferrer">
              Section 2 of the Voting Rights Act
            </a>
          ) : (
            'Section 2 of the Voting Rights Act'
          )}{' '}
          and required five new Black-majority House districts (
          {source('alpha-phi-alpha-case') ? (
            <a href={source('alpha-phi-alpha-case').url} target="_blank" rel="noreferrer">
              case record
            </a>
          ) : (
            'case record'
          )}
          ). Measured by voting-age population, the 2024 map created exactly {remedyIds.length === 1 ? 'one' : remedyIds.length}:{' '}
          {dc} {remedyIds.join(`, ${dc} `)} — and no district lost Black-majority status.
        </p>
        <p>
          <strong>The same map moved three Democratic districts to the Republican column</strong> —{dc}{' '}
          {lostByD.map((f) => f.district).join(`, ${dc} `)} — and four Republican districts to the Democrats. The court
          then approved the plans, holding that drawing with “an eye toward securing partisan advantage” does “not
          alone violate Section 2” (
          {source('alpha-phi-alpha-order-2023') ? (
            <a href={source('alpha-phi-alpha-order-2023').url} target="_blank" rel="noreferrer">
              28 December 2023 order
            </a>
          ) : (
            '28 December 2023 order'
          )}
          ). Federal courts cannot hear the partisan claim at all (
          {source('rucho') ? (
            <a href={source('rucho').url} target="_blank" rel="noreferrer">
              Rucho v. Common Cause
            </a>
          ) : (
            'Rucho v. Common Cause'
          )}
          ). That is the gap this page exists to make visible.
        </p>
      </div>

      {year !== 2024 && (
        <p className="micro-note">
          This comparison is fixed to 2024, the only election fought on two different sets of lines. The year filter
          above does not change it.
        </p>
      )}
    </Section>
  );
}
