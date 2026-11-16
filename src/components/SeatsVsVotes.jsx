import React, { useMemo } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { fmtInt, fmtPct, fmtPts, PARTY } from '../lib/data';

/**
 * Section 2 — votes versus seats for the selected chamber and year, with the
 * gap tracked across every cycle.
 */
export default function SeatsVsVotes({ rows, year, chamberLabel }) {
  const current = rows.find((r) => r.year === year) || rows[rows.length - 1];

  const trend = useMemo(
    () => [...rows].sort((a, b) => a.year - b.year),
    [rows],
  );

  // Full card width; viewBox ≈ rendered size so fonts stay crisp (~1:1).
  const W = 1060;
  const H = 210;
  const M = { top: 18, right: 12, bottom: 28, left: 12 };
  const barH = 26;
  const zero = H / 2 + 4;
  const maxGap = Math.max(0.12, ...trend.map((r) => Math.abs(r.gapR || 0)));
  const slot = (W - M.left - M.right) / trend.length;

  if (!current) return null;

  const gap = current.pctSeatsR - current.pctVotesR;
  const dVotes = current.pctVotesD ?? 0;
  const rVotes = current.pctVotesR ?? 0;
  const dSeats = current.pctSeatsD ?? 0;
  const rSeats = current.pctSeatsR ?? 0;

  const declared = current.racesContested;
  const uncontested = current.racesUncontested;

  // ------------------------------------------- vote share vs seat share, by cycle
  // The deck's "partisan gap narrowing since 2010" chart: one line for the
  // Republican share of the two-party vote, one for the Republican share of
  // seats, with the gap between them shaded.
  const W2 = 1060;
  const H2 = 330;
  const M2 = { top: 30, right: 26, bottom: 42, left: 54 };
  const plotW2 = W2 - M2.left - M2.right;
  const plotH2 = H2 - M2.top - M2.bottom;
  const first = trend[0];
  const last = trend[trend.length - 1];
  const x2 = (yr) =>
    M2.left + ((yr - first.year) / (last.year - first.year || 1)) * plotW2;
  const y2 = (v) => M2.top + plotH2 - Math.max(0, Math.min(1, v ?? 0)) * plotH2;
  const gapFirst = (first.pctSeatsR ?? 0) - (first.pctVotesR ?? 0);
  const gapLast = (last.pctSeatsR ?? 0) - (last.pctVotesR ?? 0);
  const narrowing = Math.abs(gapLast) < Math.abs(gapFirst);
  const gapArea =
    `M${trend.map((r) => `${x2(r.year)},${y2(r.pctSeatsR)}`).join('L')}` +
    `L${[...trend].reverse().map((r) => `${x2(r.year)},${y2(r.pctVotesR)}`).join('L')}Z`;

  return (
    <Section
      id="seats"
      step="02"
      kicker={`${chamberLabel} · ${year}`}
      title={
        Math.abs(gap) < 0.01
          ? 'Seats track votes almost exactly'
          : gap > 0
            ? 'A Republican seat bonus, district by district'
            : 'A Democratic seat bonus, district by district'
      }
      lede={`${fmtInt(current.votesD)} Democratic and ${fmtInt(current.votesR)} Republican votes were cast across ${fmtInt(current.racesTotal)} seats. Those votes became ${current.seatsD ?? '—'} Democratic and ${current.seatsR ?? '—'} Republican seats.`}
      footer={`Source: fdga/chamber_year.parquet. Gap = seat share minus two-party vote share (positive = Republican bonus). ${uncontested} of ${current.racesTotal} seats were uncontested.`}
    >
      <div className="split-bars">
        <div className="split-row">
          <span className="split-label">Votes</span>
          <div className="split-track" role="img" aria-label={`Votes: ${fmtPct(dVotes)} Democratic, ${fmtPct(rVotes)} Republican`}>
            <div className="split-part" style={{ width: `${dVotes * 100}%`, background: PARTY.D }}>
              {dVotes > 0.08 ? fmtPct(dVotes) : ''}
            </div>
            <div className="split-part" style={{ width: `${rVotes * 100}%`, background: PARTY.R }}>
              {rVotes > 0.08 ? fmtPct(rVotes) : ''}
            </div>
          </div>
        </div>
        <div className="split-row">
          <span className="split-label">Seats</span>
          <div className="split-track" role="img" aria-label={`Seats: ${fmtPct(dSeats)} Democratic, ${fmtPct(rSeats)} Republican`}>
            <div className="split-part" style={{ width: `${dSeats * 100}%`, background: PARTY.D }}>
              {dSeats > 0.08 ? fmtPct(dSeats) : ''}
            </div>
            <div className="split-part" style={{ width: `${rSeats * 100}%`, background: PARTY.R }}>
              {rSeats > 0.08 ? fmtPct(rSeats) : ''}
            </div>
          </div>
        </div>
        <p className={`gap-callout ${Math.abs(gap) >= 0.02 ? 'is-flag' : ''}`}>
          Seat bonus for Republicans: <strong>{fmtPts(gap)}</strong>
          <span>
            {uncontested} uncontested seats · {current.racesCompetitive} races inside 5.5 points
          </span>
        </p>
      </div>

      <figure className="chart">
        <FigureTools
          name={`seats-vs-votes-${chamberLabel}-${year}`}
          title="Seats versus votes"
          subtitle={`${chamberLabel}, ${year}: seat share minus two-party vote share, every cycle`}
        />
        <figcaption>Seat-minus-votes gap, every cycle</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart of the seat-minus-votes gap by election year">
          <line x1={M.left} x2={W - M.right} y1={zero} y2={zero} className="zero-line" />
          {trend.map((r, i) => {
            const g = r.gapR || 0;
            // Keep headroom below the bars so the selected year's value label
            // never collides with the year tick row.
            const h = (Math.abs(g) / maxGap) * (H / 2 - 46);
            const cx = M.left + slot * i + slot / 2;
            return (
              <g key={r.year}>
                <rect
                  x={cx - Math.min(16, slot * 0.32)}
                  y={g >= 0 ? zero - h : zero}
                  width={Math.min(32, slot * 0.64)}
                  height={Math.max(1, h)}
                  rx="2"
                  fill={g >= 0 ? PARTY.R : PARTY.D}
                  opacity={r.year === year ? 1 : 0.45}
                />
                <text x={cx} y={H - 8} textAnchor="middle" className={`axis-label ${r.year === year ? 'is-current' : ''}`}>
                  {String(r.year).slice(2)}
                </text>
                {r.year === year && (
                  <text
                    x={cx}
                    y={g >= 0 ? zero - h - 6 : zero + h + 14}
                    textAnchor="middle"
                    className="bar-value"
                  >
                    {fmtPts(g)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </figure>

      <figure className="chart">
        <FigureTools
          name={`vote-seat-gap-${chamberLabel}`}
          title={`${chamberLabel}: Republican vote share against Republican seat share, every cycle`}
          subtitle={`The gap between the two lines is the seat bonus; ${first.year} to ${last.year}`}
        />
        <figcaption>
          Vote share vs seat share, {first.year}–{last.year}: the gap is the shaded area
        </figcaption>
        <svg
          viewBox={`0 0 ${W2} ${H2}`}
          role="img"
          aria-label={`Line chart comparing the Republican share of the two-party vote with the Republican share of ${chamberLabel} seats from ${first.year} to ${last.year}; the shaded area between them is the seat bonus`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={`g-${t}`}>
              <line x1={M2.left} x2={W2 - M2.right} y1={y2(t)} y2={y2(t)} className={t === 0.5 ? 'zero-line' : 'gridline'} />
              <text x={M2.left - 8} y={y2(t) + 4} textAnchor="end" className={`axis-label${t === 0.5 ? ' is-current' : ''}`}>
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}

          <path d={gapArea} fill="#8b6fc4" opacity="0.16" />

          <line x1={x2(year)} x2={x2(year)} y1={M2.top} y2={M2.top + plotH2} className="year-rule" />

          <path
            d={trend.map((r, i) => `${i === 0 ? 'M' : 'L'}${x2(r.year)},${y2(r.pctVotesR)}`).join('')}
            fill="none"
            stroke={PARTY.R}
            strokeWidth="2.2"
            strokeDasharray="6 4"
            opacity="0.85"
          />
          <path
            d={trend.map((r, i) => `${i === 0 ? 'M' : 'L'}${x2(r.year)},${y2(r.pctSeatsR)}`).join('')}
            fill="none"
            stroke={PARTY.R}
            strokeWidth="2.4"
          />

          {trend.map((r) => (
            <g key={`d-${r.year}`}>
              <title>
                {`${r.year}: Republicans won ${fmtPct(r.pctVotesR)} of the two-party vote and ` +
                  `${fmtPct(r.pctSeatsR)} of seats (${r.seatsR ?? '—'}R–${r.seatsD ?? '—'}D), a gap of ` +
                  `${r.gapR > 0 ? '+' : ''}${((r.gapR || 0) * 100).toFixed(1)} pts`}
              </title>
              <circle cx={x2(r.year)} cy={y2(r.pctVotesR)} r={r.year === year ? 4.6 : 3} fill="#ffffff" stroke={PARTY.R} strokeWidth="1.8" />
              <circle cx={x2(r.year)} cy={y2(r.pctSeatsR)} r={r.year === year ? 4.6 : 3} fill={PARTY.R} />
            </g>
          ))}

          {trend.map((r) => (
            <text key={`t-${r.year}`} x={x2(r.year)} y={H2 - 18} textAnchor="middle" className={`axis-label${r.year === year ? ' is-current' : ''}`}>
              {String(r.year).slice(2)}
            </text>
          ))}
          <line x1={M2.left} x2={W2 - M2.right} y1={M2.top + plotH2} y2={M2.top + plotH2} className="axis-line" />
          <text x={W2 - M2.right} y={M2.top - 12} textAnchor="end" className="axis-label">
            solid = share of seats · dashed = share of the two-party vote
          </text>
          <text x={M2.left} y={H2 - 2} className="axis-label" fontSize="11">
            {last.year}: {last.seatsR ?? '—'}R–{last.seatsD ?? '—'}D on {fmtPct(last.pctVotesR)} of the vote
          </text>
        </svg>
        <div className="legend">
          <span className="legend-item">
            <i style={{ background: PARTY.R }} /> Republican seat share
          </span>
          <span className="legend-item">
            <i style={{ background: '#ffffff', border: `1.8px solid ${PARTY.R}` }} /> Republican vote share
          </span>
          <span className="legend-hint">
            50% line = an even split of both votes and seats · shaded area = the seat bonus
          </span>
        </div>
      </figure>

      <p className="micro-note">
        In {first.year} Republicans won {fmtPct(first.pctVotesR)} of the {chamberLabel.toLowerCase()} vote and{' '}
        {fmtPct(first.pctSeatsR)} of the seats — a gap of {gapFirst > 0 ? '+' : ''}
        {(gapFirst * 100).toFixed(1)} points. By {last.year} the vote share was {fmtPct(last.pctVotesR)} and the seat
        share {fmtPct(last.pctSeatsR)}, a gap of {gapLast > 0 ? '+' : ''}
        {(gapLast * 100).toFixed(1)} points. The gap has {narrowing ? 'narrowed as Georgia became competitive' : 'widened'}{' '}
        over that span; the {year} cycle sits {Math.abs(gap) < Math.abs(gapFirst) ? 'closer to' : 'further from'} the
        even-split line than {first.year} did.
      </p>
    </Section>
  );
}
