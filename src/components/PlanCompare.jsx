import React, { useMemo, useState } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { fmtInt, fmtPct } from '../lib/data';

/**
 * Role → colour and short name. Roles come from the exporter, which takes them
 * from the FDP plan catalogue (fdp/config/apps/map_compare.yml).
 */
const ROLES = {
  prior: { label: 'Previous map', color: '#8b87a3' },
  enacted21: { label: 'Enacted 2021', color: '#a05a7e' },
  dem: { label: 'Democratic proposal', color: '#1f4bae' },
  rep: { label: 'Republican draft', color: '#db1623' },
  proposed: { label: 'Committee proposal', color: '#c2703a' },
  alt: { label: 'Alternative 2021 draft', color: '#5b8db8' },
  remedy: { label: 'Remedial plan', color: '#2f7d6c' },
  current: { label: 'Enacted 2024 (in force)', color: '#4c2b86' },
};

/** Bill numbers as recorded in FDGA/PGP's 2022 evaluation of these same plans. */
const BILL_OF = {
  enacted_house22: 'HB 1EX',
  house_prop1_dem: 'HB 4EX',
  enacted_senate22: 'SB 1EX',
  senate_prop1_dem: 'SB 4EX',
  enacted_congress22: 'SB 2EX',
};

/** Which signal the lean curves and seat counts are drawn from. */
const SIGNALS = [
  { key: 'composite', label: '2018–2024 composite' },
  { key: 'deck1821', label: '2018–2021 index (2022 evaluation)' },
  { key: 'p24', label: '2024 President' },
];

/**
 * Section 03b — every catalogued plan scored on one basis.
 *
 * The 2022 FDGA / Princeton Gerrymandering Project evaluation compared four
 * maps side by side: the previous map, the enacted map, the Democratic caucus
 * counter-proposal, and the median of its simulated ensemble. This section does
 * the same from the FDP plan catalogue — the 2012/2014/2015 lines, the 2021
 * enacted maps, the Democratic and Republican proposals, the remedial plans and
 * the map in force now — each scored on the same VTD vote file, so the columns
 * are directly comparable.
 */
export default function PlanCompare({ plans, planPairs, ensemble, chamberLabel }) {
  const [signal, setSignal] = useState('composite');
  const [focus, setFocus] = useState(null);

  const list = useMemo(() => plans || [], [plans]);
  const transitions = useMemo(() => planPairs || [], [planPairs]);

  const lean = useMemo(
    () =>
      list.map((p) => ({
        id: p.id,
        label: p.label,
        role: p.role,
        values: p.districts
          .map((d) => d[signal])
          .filter((v) => v != null)
          .sort((a, b) => a - b),
      })),
    [list, signal],
  );

  if (!list.length) {
    return (
      <Section id="plans" step="03b" kicker="Plan comparison" title="No alternative plans on file">
        <p className="empty">The plan catalogue has no entries for this chamber.</p>
      </Section>
    );
  }

  const current = list.find((p) => p.role === 'current') || list[list.length - 1];
  const enacted21 = list.find((p) => p.role === 'enacted21');
  const dem = list.find((p) => p.role === 'dem');
  const prior = list.find((p) => p.role === 'prior');
  const neutralMedian = ensemble?.metrics?.find((m) => m.key === 'dem_seats');
  const sig = (p, key = signal) => p.signals[key] || {};

  const seats = (p, key = signal) => sig(p, key).seatsD;
  const comp = (p, key = signal) => sig(p, key).competitive;
  const minorityTotal = (p) =>
    p.representation.blackMajority + p.representation.coalitionMajority + p.representation.minorityInfluence;

  // ------------------------------------------------------------- lean curves
  const W = 1160;
  const H = 470;
  const M = { top: 30, right: 30, bottom: 62, left: 58 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const allVals = lean.flatMap((l) => l.values);
  const lo = Math.max(0, Math.floor(Math.min(...allVals) * 20) / 20 - 0.05);
  const hi = Math.min(1, Math.ceil(Math.max(...allVals) * 20) / 20 + 0.05);
  const lx = (i, n) => M.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const ly = (v) => M.top + plotH - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * plotH;
  const yTicks = [];
  for (let t = Math.ceil(lo * 20) / 20; t <= hi + 1e-9; t += 0.1) yTicks.push(Math.round(t * 100) / 100);

  const headline = dem && enacted21
    ? `The Democratic proposal would have produced ${seats(dem)} D seats; the enacted map produced ${seats(enacted21)}`
    : `${list.length} maps, one set of voters`;

  return (
    <Section
      id="plans"
      step="03b"
      kicker={`Plan comparison · ${chamberLabel}`}
      title={headline}
      lede={`Every ${chamberLabel.toLowerCase()} map on file in the FDP catalogue, scored on the same precinct vote file: the ${prior ? prior.label.replace(/^GA .* — /, '') : 'previous map'}, the 2021 enacted map, the competing proposals, the court's remedial plans and the map in force now. Same voters throughout — the only thing that changes is the lines. Seats and competitiveness are counted on the ${SIGNALS.find((s) => s.key === signal)?.label}.`}
      aside={
        <>
          <div className="aside-block">
            <p className="aside-title">What the comparison shows</p>
            <dl className="index-list">
              {enacted21 && (
                <div>
                  <dt>Enacted 2021 seats D</dt>
                  <dd>
                    <strong>{seats(enacted21)}</strong> of {enacted21.seats}
                  </dd>
                </div>
              )}
              {dem && (
                <div>
                  <dt>Democratic proposal</dt>
                  <dd>
                    <strong>{seats(dem)}</strong> seats D
                  </dd>
                </div>
              )}
              {prior && (
                <div>
                  <dt>Previous map</dt>
                  <dd>
                    <strong>{seats(prior)}</strong> seats D
                  </dd>
                </div>
              )}
              {neutralMedian && (
                <div>
                  <dt>Neutral-ensemble median</dt>
                  <dd>
                    <strong>{Math.round(neutralMedian.p50)}</strong> seats D
                  </dd>
                </div>
              )}
              {enacted21 && (
                <div>
                  <dt>Competitive seats</dt>
                  <dd>
                    {comp(prior || enacted21)} → <strong>{comp(enacted21)}</strong>
                    {dem ? ` (${comp(dem)} proposed)` : ''}
                  </dd>
                </div>
              )}
            </dl>
            <p className="micro-note">
              The neutral-ensemble median is the app&rsquo;s stand-in for the deck&rsquo;s “median of
              1 million simulated maps”: {fmtInt(ensemble?.run?.draws || 0)} maps drawn without party,
              race or result data, median {Math.round(neutralMedian?.p50 ?? 0)} Democratic seats
              against the {seats(current)} the map in force produces.
            </p>
          </div>

          <div className="aside-block">
            <p className="aside-title">Which plan is which</p>
            <ul className="grade-list">
              {Object.entries(ROLES)
                .filter(([key]) => list.some((p) => p.role === key))
                .map(([key, r]) => (
                  <li key={key}>
                    <span>
                      <i
                        style={{
                          display: 'inline-block',
                          width: 16,
                          height: 3,
                          background: r.color,
                          marginRight: 7,
                          verticalAlign: 'middle',
                        }}
                      />
                      {r.label}
                    </span>
                    <b>{list.filter((p) => p.role === key).length}</b>
                  </li>
                ))}
            </ul>
            <p className="micro-note">
              Labels are the FDP plan catalogue&rsquo;s own (
              <code>fdp/config/apps/map_compare.yml</code>), not names invented here. Where FDGA/PGP&rsquo;s
              2022 evaluation gives a bill number for the same plan it is shown in the table.
            </p>
          </div>
        </>
      }
      footer={`Source: FDP plan catalogue, ${list.length} plans for ${chamberLabel}, each scored on the same 2020-Census VTD vote file. Seats = districts where the Democratic two-party share exceeds 50%; competitive = 46.5–53.5%. Minority categories use any-part Black VAP and the 37–50% influence band — the definitions that reproduce FDGA/PGP's 2022 enacted-map counts exactly. Population deviation is measured against each plan's own ideal district size.`}
    >
      <div className="chart-toggle" role="group" aria-label="Election signal">
        <span>Counted on:</span>
        {SIGNALS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={signal === s.key ? 'is-active' : ''}
            aria-pressed={signal === s.key}
            onClick={() => setSignal(s.key)}
          >
            {s.label}
          </button>
        ))}
        <span className="legend-hint">Hover a row in the legend to isolate one map</span>
      </div>

      <figure className="chart">
        <FigureTools
          name={`plan-lean-${signal}-${current.id}`}
          title={`${chamberLabel}: partisan lean of every district, under every plan on file`}
          subtitle={`Each line is one map's districts sorted by Democratic two-party share (${SIGNALS.find((s) => s.key === signal)?.label})`}
        />
        <figcaption>Every map's partisan curve, on one set of voters</figcaption>
        <div className="chart-scroll">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Line chart comparing ${lean.length} redistricting plans for ${chamberLabel}: each line plots every district's Democratic two-party share, sorted, so a flatter curve means more competitive seats`}
          >
            <rect
              x={M.left}
              y={ly(0.535)}
              width={plotW}
              height={Math.max(0, ly(0.465) - ly(0.535))}
              fill="#6440a4"
              opacity="0.07"
            />
            {yTicks.map((t) => (
              <g key={`yt-${t}`}>
                <line x1={M.left} x2={M.left + plotW} y1={ly(t)} y2={ly(t)} className={Math.abs(t - 0.5) < 1e-9 ? 'zero-line' : 'gridline'} />
                <text x={M.left - 8} y={ly(t) + 3.5} textAnchor="end" className={`axis-label${Math.abs(t - 0.5) < 1e-9 ? ' is-current' : ''}`}>
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}
            <text x={M.left + plotW - 4} y={ly(0.535) - 6} textAnchor="end" className="axis-label">
              competitive zone 46.5–53.5%
            </text>

            {lean.map((l) => {
              const role = ROLES[l.role] || { color: '#8b87a3', label: l.role };
              const dim = focus && focus !== l.id;
              const isCurrent = l.id === current.id;
              return (
                <polyline
                  key={l.id}
                  points={l.values.map((v, i) => `${lx(i, l.values.length).toFixed(1)},${ly(v).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={role.color}
                  strokeWidth={isCurrent ? 3 : 2}
                  opacity={dim ? 0.16 : focus === l.id ? 1 : 0.85}
                  onMouseEnter={() => setFocus(l.id)}
                  onMouseLeave={() => setFocus(null)}
                >
                  <title>
                    {`${l.label}: ${seats(list.find((p) => p.id === l.id))} Democratic seats, ` +
                      `${comp(list.find((p) => p.id === l.id))} competitive (${SIGNALS.find((s) => s.key === signal)?.label})`}
                  </title>
                </polyline>
              );
            })}

            <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + plotH} className="axis-line" />
            <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} className="axis-line" />
            <text x={M.left} y={H - 34} className="axis-label">
              ← most Republican district
            </text>
            <text x={M.left + plotW} y={H - 34} textAnchor="end" className="axis-label">
              most Democratic district →
            </text>
            <text x={M.left + plotW / 2} y={H - 14} textAnchor="middle" className="axis-label" fontSize="11">
              districts of each plan, sorted by Democratic two-party share · a steeper curve means
              fewer competitive seats
            </text>
          </svg>
        </div>
        <div className="legend">
          {lean.map((l) => {
            const role = ROLES[l.role] || { color: '#8b87a3', label: l.role };
            return (
              <span
                key={l.id}
                className="legend-item"
                style={{ cursor: 'pointer', opacity: focus && focus !== l.id ? 0.4 : 1 }}
                onMouseEnter={() => setFocus(l.id)}
                onMouseLeave={() => setFocus(null)}
              >
                <i style={{ background: role.color, width: 16, height: 3, borderRadius: 2 }} />{' '}
                {BILL_OF[l.id] ? `${role.label} (${BILL_OF[l.id]})` : role.label}
              </span>
            );
          })}
        </div>
      </figure>

      <div className="table-scroll">
        <table className="metric-table">
          <caption>
            Every plan on file, scored the same way — the comparison table from FDGA/PGP&rsquo;s 2022
            evaluation, extended to the remedial and 2024 maps
          </caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col" className="num">Seats D</th>
              <th scope="col" className="num">Competitive</th>
              <th scope="col" className="num">Median lean</th>
              <th scope="col" className="num">Black-majority</th>
              <th scope="col" className="num">Coalition</th>
              <th scope="col" className="num">Influence</th>
              <th scope="col" className="num">Total</th>
              <th scope="col" className="num">Max pop. dev.</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const role = ROLES[p.role] || { label: p.role, color: '#8b87a3' };
              return (
                <tr
                  key={p.id}
                  className={p.id === current.id ? 'is-outside' : ''}
                  onMouseEnter={() => setFocus(p.id)}
                  onMouseLeave={() => setFocus(null)}
                  style={{ opacity: focus && focus !== p.id ? 0.45 : 1 }}
                >
                  <th scope="row">
                    {p.label.replace(/^GA .* — /, '')}
                    <span className="metric-note">
                      <i
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 3,
                          background: role.color,
                          marginRight: 6,
                          verticalAlign: 'middle',
                        }}
                      />
                      {role.label}
                      {BILL_OF[p.id] ? ` · ${BILL_OF[p.id]}` : ''} · {p.seats} districts
                    </span>
                  </th>
                  <td className="num">{seats(p) ?? '—'}</td>
                  <td className="num">{comp(p) ?? '—'}</td>
                  <td className="num">{fmtPct(sig(p).median)}</td>
                  <td className="num">{p.representation.blackMajority}</td>
                  <td className="num">{p.representation.coalitionMajority}</td>
                  <td className="num">{p.representation.minorityInfluence}</td>
                  <td className="num">{minorityTotal(p)}</td>
                  <td className="num">{fmtPct(Math.abs(p.population.maxDeviationPct || 0), 2)}</td>
                </tr>
              );
            })}
            {neutralMedian && (
              <tr>
                <th scope="row">
                  Neutral-ensemble median
                  <span className="metric-note">
                    {fmtInt(ensemble.run.draws)} maps drawn without party, race or results
                  </span>
                </th>
                <td className="num">{Math.round(neutralMedian.p50)}</td>
                <td className="num">
                  {(() => {
                    const c = ensemble.metrics.find((m) => m.key === 'comp_seats_10pt');
                    return c && c.p50 != null ? Math.round(c.p50) : '—';
                  })()}
                </td>
                <td className="num">—</td>
                <td className="num" colSpan={4}>
                  see 04b Representation for the demographic benchmarks
                </td>
                <td className="num">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="micro-note">
        Read across a row for one map&rsquo;s whole fairness profile; read down a column to see what
        the choice of map was worth. On the {SIGNALS.find((s) => s.key === signal)?.label}, the{' '}
        {list.length} plans on file span {Math.min(...list.map((p) => seats(p) ?? Infinity))} to{' '}
        {Math.max(...list.map((p) => seats(p) ?? -Infinity))} Democratic seats and{' '}
        {Math.min(...list.map((p) => comp(p) ?? Infinity))} to{' '}
        {Math.max(...list.map((p) => comp(p) ?? -Infinity))} competitive seats — the same voters in
        every column. Competitive-seat counts differ between this table and section 04 because this
        one uses the 46.5–53.5% band FDGA/PGP reported in 2022, while section 04 uses the
        scorecard&rsquo;s within-10-points test.
      </p>

      {transitions.length > 0 && (
        <div className="table-scroll">
          <table className="metric-table">
            <caption>How many people each transition moved — and how much of that equal populations forced</caption>
            <thead>
              <tr>
                <th scope="col">Transition</th>
                <th scope="col" className="num">People moved</th>
                <th scope="col" className="num">Share of Georgia</th>
                <th scope="col" className="num">Required for equal population</th>
                <th scope="col" className="num">Multiple</th>
                <th scope="col">Districts renumbered</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    {t.label}
                    <span className="metric-note">
                      {t.planA} → {t.planB} · {t.districts} districts · {t.method}
                    </span>
                  </th>
                  <td className="num">{fmtInt(t.people)}</td>
                  <td className="num">{fmtPct(t.pct)}</td>
                  <td className="num">
                    {fmtInt(t.arithmeticMinimum)}
                    <span className="metric-note">
                      {t.minimumIsTrivial ? 'districts already equal' : fmtPct(t.arithmeticMinimumPct, 2)}
                    </span>
                  </td>
                  <td className="num">
                    {t.minimumIsTrivial ? 'n/a' : t.multiple ? `${t.multiple.toFixed(0)}×` : '—'}
                  </td>
                  <td>
                    {t.renumberedDistricts
                      ? `${t.renumberedDistricts} of ${t.districts} changed number`
                      : 'numbering preserved'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="micro-note">
        &ldquo;Districts renumbered&rdquo; counts districts whose residents ended up predominantly in a
        differently-numbered seat: {transitions.map((t) => `${t.label.replace(/^GA /, '')} ${t.renumberedDistricts} of ${t.districts}`).join(' · ')}.
        Section 03&rsquo;s per-district views compare <em>seat numbers</em> — district N before against
        district N after — which is the incumbent&rsquo;s-eye view the 2022 evaluation took; it is not a
        claim that the same people stayed in the same numbered seat.
      </p>

      <div className="law-note">
        <p>
          <strong>These counts reproduce the 2022 evaluation.</strong> Scored this way, the 2021
          enacted maps come out at {enacted21 ? `${enacted21.representation.blackMajority} Black-majority, ${enacted21.representation.coalitionMajority} coalition and ${enacted21.representation.minorityInfluence} influence districts` : '—'}{' '}
          for the {chamberLabel}, which is the enacted-map column of FDGA/PGP&rsquo;s 2022 minority
          table. That the numbers land on the published figures is the check that the classification
          thresholds (50% majority, 37–50% influence, any-part Black VAP) are the same ones.
        </p>
        <p>
          <strong>Why the proposals are here.</strong> A proposal is not law and never took effect;
          it is evidence about the enacted map. When two drafts drawn in the same cycle from the same
          census data produce materially different seat counts and different numbers of
          minority-opportunity districts, the difference is a choice, not a constraint — which is the
          argument the 2022 evaluation made with these same files.
        </p>
        <p>
          <strong>One basis for every plan.</strong> All {list.length} plans are scored on the same
          2020-Census precincts and the same vote file, so no plan benefits from a friendlier election
          or a different population vintage. The 2012/2014/2015 lines are the pre-2021 maps re-scored
          on 2020 Census geography, which is how the deck&rsquo;s “Previous Map” panels were built.
        </p>
      </div>
    </Section>
  );
}
