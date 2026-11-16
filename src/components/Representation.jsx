import React, { useMemo, useState } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { fmtInt, fmtPct, PARTY } from '../lib/data';

/** District label per chamber, matching the rest of the story. */
const PREFIX = { state_house: 'HD', state_senate: 'SD', us_house: 'CD' };

/**
 * Category rows, in the order the 2022 FDGA / Princeton Gerrymandering Project
 * evaluation reported them, each tied to the neutral-ensemble benchmark key that
 * measures the same thing. `parts` lists the plan-level categories that add up
 * to the row's count.
 */
const ROWS = [
  {
    key: 'black',
    label: 'Black-majority districts',
    parts: ['blackMajority'],
    benchmark: 'maj_black',
    definition: 'Any-part Black voting-age population at or above 50%.',
  },
  {
    key: 'coalition',
    label: 'Minority coalition-majority districts',
    parts: ['blackMajority', 'coalitionMajority'],
    benchmark: 'min_coal',
    definition: 'All minority groups together reach 50% of VAP, whether or not one group does.',
  },
  {
    key: 'influence',
    label: 'Minority influence districts',
    parts: ['minorityInfluence'],
    benchmark: 'min_influence',
    definition: 'All minorities together between 37% and 50% of VAP.',
  },
  {
    key: 'white',
    label: 'Majority-white districts',
    parts: ['whiteMajority'],
    benchmark: 'maj_white',
    definition: 'White-alone voting-age population at or above 50%.',
  },
];

/** Colours for the district ladder: majority, influence, then everything else. */
const CAT_FILL = { majority: '#4c2b86', influence: '#a05a7e', other: '#cdc7dd' };

/**
 * Section 04b — minority representation.
 *
 * The second of the three fairness tests in FDGA's 2022 evaluation of the
 * enacted maps: does the map reflect Georgia's diversity and comply with the
 * Voting Rights Act? Every district is classified from its own voting-age
 * population into majority / coalition / influence categories, under both the
 * 2021-23 lines and the 2024 remedial lines, and each count is placed against
 * the neutral-ensemble benchmark where the scorecard carries a CVAP run.
 */
export default function Representation({ effect, ensemble, stateVap, chamberLabel }) {
  const [hover, setHover] = useState(null);

  const rep = effect?.representation;
  const demoBench = useMemo(() => {
    const out = {};
    for (const m of ensemble?.demographics || []) out[m.key] = m;
    return out;
  }, [ensemble]);

  const rows = useMemo(() => {
    if (!rep) return [];
    return ROWS.map((r) => {
      const prior = r.parts.reduce((s, p) => s + (rep.prior.counts[p] || 0), 0);
      const current = r.parts.reduce((s, p) => s + (rep.current.counts[p] || 0), 0);
      const bench = demoBench[r.benchmark] || null;
      return { ...r, prior, current, bench, delta: current - prior };
    });
  }, [rep, demoBench]);

  const ladder = useMemo(() => {
    if (!effect) return [];
    return effect.districts
      .filter((d) => d.currentDemo && d.currentDemo.black != null)
      .map((d) => ({
        district: d.district,
        prior: d.priorDemo?.black ?? null,
        current: d.currentDemo.black,
        minority: d.currentDemo.minority,
        crossed:
          d.priorDemo?.black != null && d.priorDemo.black < 0.5 && d.currentDemo.black >= 0.5,
        lost: d.priorDemo?.black != null && d.priorDemo.black >= 0.5 && d.currentDemo.black < 0.5,
      }))
      .sort((a, b) => a.current - b.current);
  }, [effect]);

  if (!effect || !rep) {
    return (
      <Section
        id="representation"
        step="04b"
        kicker="Representation"
        title="No district demographics for this chamber"
      >
        <p className="empty">Representation data is available for the House, Senate and Congress.</p>
      </Section>
    );
  }

  const dc = PREFIX[effect.chamber] || 'District';
  const th = rep.thresholds;
  const blackMajority = rep.current.counts.blackMajority;
  const priorBlackMajority = rep.prior.counts.blackMajority;
  const coalitionNow = rep.current.counts.blackMajority + rep.current.counts.coalitionMajority;
  const influenceNow = rep.current.counts.minorityInfluence;
  const crossed = ladder.filter((d) => d.crossed);
  const lost = ladder.filter((d) => d.lost);
  const benchRows = rows.filter((r) => r.bench);
  const stateMinority = stateVap?.minorityShare;

  // ------------------------------------------------------------- ladder chart
  const W = 1160;
  const H = 430;
  const M = { top: 30, right: 24, bottom: 52, left: 56 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const maxY = Math.max(0.7, Math.ceil(Math.max(...ladder.map((d) => d.current)) * 20) / 20);
  const lx = (i) => M.left + (ladder.length === 1 ? plotW / 2 : (i / (ladder.length - 1)) * plotW);
  const ly = (v) => M.top + plotH - (Math.min(maxY, Math.max(0, v)) / maxY) * plotH;
  const yTicks = [];
  for (let t = 0; t <= maxY + 1e-9; t += 0.1) yTicks.push(Math.round(t * 100) / 100);

  // ---------------------------------------------------------- benchmark chart
  const BW = 1160;
  const BROW = 54;
  const BM = { top: 34, right: 150, bottom: 68, left: 250 };
  const bPlotW = BW - BM.left - BM.right;
  const benchMax = Math.max(
    10,
    ...rows.flatMap((r) => [r.prior, r.current, r.bench?.p95 || 0, r.bench?.enacted || 0]),
  );
  const bx = (v) => BM.left + (Math.max(0, Math.min(benchMax, v)) / benchMax) * bPlotW;
  const BH = BM.top + rows.length * BROW + BM.bottom;

  // Legend laid out by measured text width so no item collides with the next,
  // whatever the two plan labels are called.
  const LEGEND = [
    { kind: 'hollow', text: effect.prior.label },
    { kind: 'solid', text: effect.current.label },
    { kind: 'band', text: 'neutral maps, 5th–95th pct' },
    { kind: 'aband', text: 'scorecard \u201cA\u201d band' },
  ];
  let legendCursor = 0;
  const legend = LEGEND.map((item) => {
    const at = legendCursor;
    const swatch = item.kind === 'hollow' || item.kind === 'solid' ? 14 : 32;
    legendCursor += swatch + item.text.length * 5.7 + 36;
    return { ...item, x: at };
  });

  return (
    <Section
      id="representation"
      step="04b"
      kicker={`Representation · ${chamberLabel}`}
      title={
        crossed.length
          ? `The 2024 map added ${crossed.length} Black-majority ${crossed.length === 1 ? 'district' : 'districts'} — the court-ordered remedy`
          : `${blackMajority} Black-majority districts, ${coalitionNow} where minorities form a majority`
      }
      lede={`Fairness has a second test beyond partisanship: does the map reflect Georgia's diversity, and does it comply with the Voting Rights Act? Every ${chamberLabel.toLowerCase()} district is classified from its own voting-age population — Black-majority at ${Math.round(th.majority * 100)}% or more, minority influence between ${Math.round(th.influenceLo * 100)}% and ${Math.round(th.influenceHi * 100)}%. Under the ${effect.current.label} there are ${blackMajority} Black-majority districts, ${coalitionNow} where all minorities together form a majority, and ${influenceNow} influence districts; under the ${effect.prior.label} the counts were ${priorBlackMajority} and ${rep.prior.counts.blackMajority + rep.prior.counts.coalitionMajority}.`}
      aside={
        <>
          <div className="aside-block">
            <p className="aside-title">The three categories</p>
            <dl className="index-list">
              <div>
                <dt>Majority districts</dt>
                <dd>one group is 50%+ of VAP</dd>
              </div>
              <div>
                <dt>Coalition districts</dt>
                <dd>minorities together are 50%+</dd>
              </div>
              <div>
                <dt>Influence districts</dt>
                <dd>
                  {Math.round(th.influenceLo * 100)}–{Math.round(th.influenceHi * 100)}% minority
                </dd>
              </div>
            </dl>
            <p className="micro-note">
              Majority districts are protected under the Voting Rights Act when they meet the
              statutory test. Coalition districts are majority-minority but may not be legally
              protected. Influence districts are where a minority group can affect the outcome
              without deciding it alone.
            </p>
          </div>

          {stateVap && (
            <div className="aside-block">
              <p className="aside-title">Who Georgia's voters are</p>
              <dl className="index-list">
                {stateVap.groups.map((g) => (
                  <div key={g.label}>
                    <dt>{g.label}</dt>
                    <dd>{fmtPct(g.share)}</dd>
                  </div>
                ))}
                <div>
                  <dt>All minorities combined</dt>
                  <dd>
                    <strong>{fmtPct(stateMinority)}</strong>
                  </dd>
                </div>
              </dl>
              <p className="micro-note">
                {fmtInt(stateVap.vap)} voting-age residents, 2020 Census. {stateMinority != null &&
                  `If ${fmtPct(stateMinority)} of voters are a minority and ${coalitionNow} of ${effect.seats} districts are minority-majority, the map is ${Math.abs(coalitionNow / effect.seats - stateMinority) < 0.05 ? 'close to' : coalitionNow / effect.seats < stateMinority ? 'below' : 'above'} that share of the chamber.`}
              </p>
            </div>
          )}

          <div className="aside-block">
            <p className="aside-title">Which districts crossed 50%</p>
            {crossed.length ? (
              <p className="micro-note">
                {crossed.map((d) => `${dc} ${d.district}`).join(', ')} went from below to above 50%
                Black VAP between the {effect.prior.label} and the {effect.current.label}.
              </p>
            ) : (
              <p className="micro-note">
                No district crossed above the 50% Black VAP line between these two maps.
              </p>
            )}
            {lost.length ? (
              <p className="micro-note">
                {lost.map((d) => `${dc} ${d.district}`).join(', ')} fell below 50% Black VAP —{' '}
                {lost.length === 1 ? 'a district that lost' : 'districts that lost'} Black-majority
                status under the {effect.current.label}.
              </p>
            ) : (
              <p className="micro-note">
                No district lost Black-majority status: all {priorBlackMajority} of the{' '}
                {effect.prior.label}&rsquo;s Black-majority districts are still at or above 50%.
              </p>
            )}
          </div>
        </>
      }
      footer={`Method: each district is classified from the voting-age population carried in its own plan file — ${effect.prior.label} and ${effect.current.label}. Black share is any-part Black VAP, the same expansive definition the 2022 FDGA/PGP evaluation used for enacted-map counts. Majority = ${Math.round(th.majority * 100)}%+, influence = ${Math.round(th.influenceLo * 100)}–${Math.round(th.influenceHi * 100)}%.${benchRows.length ? ` Benchmarks: FDGA neutral-ensemble scorecard, ${ensemble.demographicSource?.source === 'cvap' ? `${ensemble.demographicSource.year} ACS CVAP` : 'CVAP'} — citizen voting-age population, which excludes non-citizens and so runs a little higher than the VAP counts here.` : ' This chamber has no CVAP benchmark run, so only the two maps are compared.'}`}
    >
      <div className="kpi-row">
        <div className="kpi is-flag">
          <span className="kpi-label">Black-majority districts</span>
          <strong>{blackMajority}</strong>
          <span className="kpi-sub">
            {priorBlackMajority} under the {effect.prior.label} ·{' '}
            {crossed.length > 0 ? `+${crossed.length} from the remedy` : 'no change'}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Minority coalition-majority</span>
          <strong>{coalitionNow}</strong>
          <span className="kpi-sub">
            {rep.current.counts.coalitionMajority} coalition-only ·{' '}
            {rep.prior.counts.blackMajority + rep.prior.counts.coalitionMajority} before
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Minority influence</span>
          <strong>{influenceNow}</strong>
          <span className="kpi-sub">
            {Math.round(th.influenceLo * 100)}–{Math.round(th.influenceHi * 100)}% minority VAP ·{' '}
            {rep.prior.counts.minorityInfluence} before
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Hispanic districts</span>
          <strong>
            {rep.current.counts.hispanicMajority} maj · {rep.current.counts.hispanicInfluence} infl
          </strong>
          <span className="kpi-sub">
            {rep.current.counts.hispanicMajority
              ? `${dc} ${rep.current.districts.hispanicMajority.join(', ')}`
              : `${rep.current.counts.hispanicInfluence} in the 37–50% band`}
          </span>
        </div>
      </div>

      <figure className="chart">
        <FigureTools
          name={`representation-ladder-${effect.chamber}`}
          title={`${chamberLabel}: every district's Black voting-age share, under both maps`}
          subtitle={`Districts sorted by Black VAP share under the ${effect.current.label}; the grey dot is the same district under the ${effect.prior.label}`}
        />
        <figcaption>Black share of voting-age population in every district</figcaption>
        <div className="chart-scroll">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Ladder chart of ${ladder.length} ${chamberLabel} districts sorted by Black voting-age population share, with the 50 percent majority threshold and the 37 to 50 percent influence band marked`}
          >
            {/* influence band + majority threshold */}
            <rect
              x={M.left}
              y={ly(th.influenceHi)}
              width={plotW}
              height={Math.max(0, ly(th.influenceLo) - ly(th.influenceHi))}
              fill="#a05a7e"
              opacity="0.08"
            />
            {yTicks.map((t) => (
              <g key={`y-${t}`}>
                <line x1={M.left} x2={M.left + plotW} y1={ly(t)} y2={ly(t)} className="gridline" />
                <text x={M.left - 8} y={ly(t) + 3.5} textAnchor="end" className="axis-label">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            <line x1={M.left} x2={M.left + plotW} y1={ly(0.5)} y2={ly(0.5)} className="zero-line" />
            <text x={M.left + plotW - 4} y={ly(0.5) - 6} textAnchor="end" className="axis-label">
              50% — majority threshold
            </text>
            <text x={M.left + plotW - 4} y={ly(th.influenceLo) + 14} textAnchor="end" className="axis-label">
              {Math.round(th.influenceLo * 100)}% — influence floor
            </text>

            {ladder.map((d, i) => {
              const cat = d.current >= th.majority ? 'majority' : d.current >= th.influenceLo ? 'influence' : 'other';
              const changed = d.prior != null && Math.abs(d.prior - d.current) >= 0.005;
              return (
                <g
                  key={d.district}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>
                    {`${dc} ${d.district}: ${fmtPct(d.current)} Black VAP under the ${effect.current.label}` +
                      `${d.prior != null ? ` (was ${fmtPct(d.prior)})` : ''}` +
                      `${d.minority != null ? ` · ${fmtPct(d.minority)} all-minority` : ''}`}
                  </title>
                  {changed && (
                    <line
                      x1={lx(i)}
                      x2={lx(i)}
                      y1={ly(d.prior)}
                      y2={ly(d.current)}
                      stroke={d.current > d.prior ? PARTY.D : PARTY.R}
                      strokeWidth="1.2"
                      opacity="0.5"
                    />
                  )}
                  {d.prior != null && changed && <circle cx={lx(i)} cy={ly(d.prior)} r="1.8" fill="#a9a3bf" />}
                  <circle
                    cx={lx(i)}
                    cy={ly(d.current)}
                    r={d.crossed ? 4.4 : 3.1}
                    fill={CAT_FILL[cat]}
                    stroke={d.crossed ? '#1c1a2b' : 'none'}
                    strokeWidth={d.crossed ? 1.3 : 0}
                  />
                </g>
              );
            })}

            <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + plotH} className="axis-line" />
            <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} className="axis-line" />
            <text x={M.left} y={H - 26} className="axis-label">
              ← lowest Black VAP share
            </text>
            <text x={M.left + plotW} y={H - 26} textAnchor="end" className="axis-label">
              highest →
            </text>
            <text x={M.left + plotW / 2} y={H - 8} textAnchor="middle" className="axis-label" fontSize="11">
              {ladder.length} districts, sorted by Black share of voting-age population under the{' '}
              {effect.current.label}
            </text>
          </svg>
        </div>
        <div className="legend">
          <span className="legend-item">
            <i style={{ background: CAT_FILL.majority, height: 9, width: 9, borderRadius: '50%' }} /> 50%+
            Black VAP ({blackMajority})
          </span>
          <span className="legend-item">
            <i style={{ background: CAT_FILL.influence, height: 9, width: 9, borderRadius: '50%' }} />{' '}
            {Math.round(th.influenceLo * 100)}–50% ({rep.current.counts.blackInfluence})
          </span>
          <span className="legend-item">
            <i style={{ background: CAT_FILL.other, height: 9, width: 9, borderRadius: '50%' }} /> below{' '}
            {Math.round(th.influenceLo * 100)}%
          </span>
          <span className="legend-hint">
            outlined dot = crossed 50% between the two maps ({crossed.length}) · grey dot = the same
            district under the {effect.prior.label}
          </span>
        </div>
        {hover && (
          <p className="micro-note" role="status">
            <strong>
              {dc} {hover.district}
            </strong>{' '}
            — {fmtPct(hover.current)} Black VAP
            {hover.prior != null ? `, was ${fmtPct(hover.prior)}` : ''}
            {hover.minority != null ? ` · ${fmtPct(hover.minority)} all-minority VAP` : ''}
            {hover.crossed ? ' · crossed the 50% majority line' : ''}
          </p>
        )}
      </figure>

      <figure className="chart">
        <FigureTools
          name={`representation-benchmarks-${effect.chamber}`}
          title={`${chamberLabel}: representation counts against the neutral-ensemble benchmark`}
          subtitle="Each row: the two enacted maps, the range neutral maps produce, and the scorecard's 'A' band"
        />
        <figcaption>Both maps against the benchmark range</figcaption>
        <div className="chart-scroll">
          <svg
            viewBox={`0 0 ${BW} ${BH}`}
            role="img"
            aria-label={`Range plot comparing ${chamberLabel} minority-representation counts under both maps with the neutral-ensemble benchmark range and A-grade band`}
          >
            <text x={BM.left} y={18} className="axis-label">
              districts
            </text>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={`gx-${t}`}>
                <line
                  x1={BM.left + bPlotW * t}
                  x2={BM.left + bPlotW * t}
                  y1={BM.top - 10}
                  y2={BH - BM.bottom}
                  className="gridline"
                />
                <text
                  x={BM.left + bPlotW * t}
                  y={BH - BM.bottom + 16}
                  textAnchor="middle"
                  className="axis-label"
                >
                  {Math.round(benchMax * t)}
                </text>
              </g>
            ))}

            {rows.map((r, i) => {
              const yc = BM.top + i * BROW + BROW / 2;
              const b = r.bench;
              return (
                <g key={r.key}>
                  <text x={BM.left - 14} y={yc - 3} textAnchor="end" className="bench-label">
                    {r.label}
                  </text>
                  <text x={BM.left - 14} y={yc + 9} textAnchor="end" className="bench-value">
                    {r.prior} → {r.current}
                    {b ? ` · scorecard ${Math.round(b.enacted)}` : ''}
                  </text>

                  {/* neutral ensemble p5–p95 */}
                  {b && (
                    <g>
                      <rect
                        x={bx(b.p5)}
                        y={yc - 13}
                        width={Math.max(1.5, bx(b.p95) - bx(b.p5))}
                        height={11}
                        rx="3"
                        fill="#6440a4"
                        opacity="0.28"
                      />
                      <line x1={bx(b.p50)} x2={bx(b.p50)} y1={yc - 15} y2={yc} stroke="#4c2b86" strokeWidth="1.6" />
                      {/* the scorecard's "A" band */}
                      {b.aGradeLo != null && (
                        <rect
                          x={bx(b.aGradeLo)}
                          y={yc + 3}
                          width={Math.max(
                            2,
                            bx(b.aGradeHi != null ? b.aGradeHi : Math.max(b.aGradeLo, b.p95)) - bx(b.aGradeLo),
                          )}
                          height={8}
                          rx="2.5"
                          fill="#7d3169"
                          opacity="0.55"
                        />
                      )}
                      <circle cx={bx(b.enacted)} cy={yc - 7.5} r="3.4" fill="#ffffff" stroke="#4c2b86" strokeWidth="1.6" />
                      <text x={BW - BM.right + 12} y={yc - 3} className="bench-value">
                        {b.grade ? `grade ${b.grade}` : ''}
                      </text>
                      <text x={BW - BM.right + 12} y={yc + 9} className="bench-value">
                        neutral {Math.round(b.p5)}–{Math.round(b.p95)}
                      </text>
                    </g>
                  )}

                  {/* the two enacted maps */}
                  <circle cx={bx(r.prior)} cy={yc + 16} r="4.2" fill="#ffffff" stroke="#8b87a3" strokeWidth="1.6" />
                  <circle cx={bx(r.current)} cy={yc + 16} r="4.6" fill="#4c2b86" />
                  {!b && (
                    <text x={BW - BM.right + 12} y={yc + 4} className="bench-value">
                      no CVAP run
                    </text>
                  )}
                </g>
              );
            })}

            <g transform={`translate(${BM.left}, ${BH - 18})`}>
              {legend.map((item) => (
                <g key={item.kind} transform={`translate(${item.x}, 0)`}>
                  {item.kind === 'hollow' && (
                    <circle cx="4" cy="-3" r="4.2" fill="#ffffff" stroke="#8b87a3" strokeWidth="1.6" />
                  )}
                  {item.kind === 'solid' && <circle cx="4" cy="-3" r="4.6" fill="#4c2b86" />}
                  {item.kind === 'band' && (
                    <rect x="0" y="-9" width="26" height="11" rx="3" fill="#6440a4" opacity="0.28" />
                  )}
                  {item.kind === 'aband' && (
                    <rect x="0" y="-6" width="26" height="8" rx="2.5" fill="#7d3169" opacity="0.55" />
                  )}
                  <text x={item.kind === 'hollow' || item.kind === 'solid' ? 14 : 32} y="0" className="axis-label">
                    {item.text}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </figure>

      <p className="micro-note">
        Read a row as: what the two enacted maps contain, against what maps drawn without any
        demographic target contain. A count above the neutral range is not a fault — it is usually the
        Voting Rights Act remedy showing up in the numbers. A count below it is where a
        vote-dilution claim starts.
      </p>

      <div className="law-note">
        <p>
          <strong>Why these counts move.</strong> On 26 October 2023 a federal court held that the
          2021 House and Senate plans violated Section 2 of the Voting Rights Act and required new
          Black-majority districts. The {effect.current.label} is that remedy: {crossed.length}{' '}
          {crossed.length === 1 ? 'district' : 'districts'} crossed the 50% Black VAP line (
          {crossed.map((d) => `${dc} ${d.district}`).join(', ') || 'none'}), taking Black-majority{' '}
          {chamberLabel.toLowerCase()} seats from {priorBlackMajority} to {blackMajority}.
        </p>
        <p>
          <strong>VAP here, CVAP in the benchmark.</strong> The district counts on this page use
          voting-age population from the plan files. The neutral-ensemble benchmark uses citizen
          voting-age population, which removes non-citizens from the denominator and so reports
          slightly higher Black shares{benchRows.length ? ` — its enacted figure (${benchRows[0].bench ? Math.round(benchRows[0].bench.enacted) : '—'}) is not expected to equal the ${blackMajority} counted here` : ''}. Both are shown, labelled, rather than blended.
        </p>
        <p>
          <strong>Any-part Black.</strong> A district counts as Black-majority when people who are
          Black alone <em>or in combination</em> reach 50% of VAP. The 2022 FDGA/PGP evaluation used
          the same expansive definition for its enacted-map column and noted that the narrower
          Black-alone definition gives lower counts — the plan files carry that too (
          {fmtInt(
            effect.districts.filter((d) => (d.currentDemo?.blackAlone ?? 0) >= 0.5).length,
          )}{' '}
          {chamberLabel.toLowerCase()} districts are 50%+ Black-alone).
        </p>
      </div>
    </Section>
  );
}
