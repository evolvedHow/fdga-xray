import React, { useMemo } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { fmtInt } from '../lib/data';

/** Chamber colours for the cross-chamber dot plot. */
const CHAMBER_COLOR = {
  state_house: '#4c2b86',
  state_senate: '#7d3169',
  us_house: '#1f4bae',
};

/** Metric rows, in the order the scorecards present them. */
const METRIC_ORDER = [
  'dem_seats',
  'comp_seats_10pt',
  'comp_seats_7pt',
  'dem_safe_seats',
  'rep_safe_seats',
  'efficiency_gap',
  'mean_median',
];

/** Representation rows, keyed as the scorecards key them. */
const DEMO_ORDER = [
  { key: 'maj_black', label: 'Black-majority districts' },
  { key: 'min_coal', label: 'Minority coalition-majority' },
  { key: 'min_influence', label: 'Minority influence (37–50%)' },
  { key: 'maj_white', label: 'Majority-white districts' },
];

/** Format a metric value by unit. */
function fmt(m, v) {
  if (v == null) return '—';
  if (m.unit === 'seats') return String(Math.round(v));
  if (m.unit === 'points') return `${(v * 100).toFixed(1)} pt`;
  return `${(v * 100).toFixed(1)}%`;
}

/** A one-sided "A" band reads as "at least"; a two-sided one as a range. */
function fmtBand(m, lo, hi) {
  if (lo == null && hi == null) return '—';
  const one = (v) => fmt(m, v);
  if (lo == null) return `≤ ${one(hi)}`;
  if (hi == null) return `≥ ${one(lo)}`;
  if (Math.abs(hi - lo) < 1e-9) return one(lo);
  return `${one(lo)} – ${one(hi)}`;
}

/**
 * Section 04c — the three chambers side by side.
 *
 * FDGA/PGP's 2022 evaluation closed with a Senate / House / Congress benchmark
 * comparison on one page. The rest of this story filters to one chamber at a
 * time, so this section reads all three ensemble scorecards at once: where each
 * enacted map ranks among its own neutral maps, what the "A" band requires, and
 * how the minority-representation counts compare.
 */
export default function ChamberBenchmark({ ensembles, chambers }) {
  const order = useMemo(
    () => (chambers || []).filter((c) => ensembles?.[c.key]),
    [chambers, ensembles],
  );

  const rows = useMemo(() => {
    if (!order.length) return [];
    const template = ensembles[order[0].key].metrics || [];
    return METRIC_ORDER.map((key) => {
      const spec = template.find((m) => m.key === key);
      if (!spec) return null;
      return {
        key,
        label: spec.label,
        unit: spec.unit,
        group: spec.group,
        cells: order.map((c) => {
          const m = (ensembles[c.key].metrics || []).find((x) => x.key === key);
          return m
            ? { chamber: c.key, enacted: m.enacted, grade: m.grade, pctRank: m.pctRank, p5: m.p5, p95: m.p95, p50: m.p50, aLo: m.aGradeLo, aHi: m.aGradeHi }
            : null;
        }),
      };
    }).filter(Boolean);
  }, [order, ensembles]);

  const demoRows = useMemo(
    () =>
      DEMO_ORDER.map((d) => ({
        ...d,
        cells: order.map((c) => {
          const list = ensembles[c.key].demographics || [];
          const m = list.find((x) => x.key === d.key);
          return m
            ? { chamber: c.key, enacted: m.enacted, grade: m.grade, pctRank: m.pctRank, p5: m.p5, p95: m.p95, aLo: m.aGradeLo, aHi: m.aGradeHi }
            : null;
        }),
      })),
    [order, ensembles],
  );

  const splitRow = useMemo(
    () =>
      order.map((c) => {
        const b = ensembles[c.key].benchmarks?.muni_splits;
        return b ? { chamber: c.key, ...b } : null;
      }),
    [order, ensembles],
  );

  if (!order.length) {
    return (
      <Section id="chambers" step="04c" kicker="All three chambers" title="No benchmark data">
        <p className="empty">Neutral-ensemble scorecards are unavailable.</p>
      </Section>
    );
  }

  // ------------------------------------------------------------------ dot plot
  const W = 1160;
  const rowH = 46;
  const M = { top: 44, right: 40, bottom: 44, left: 190 };
  const plotW = W - M.left - M.right;
  const H = M.top + rows.length * rowH + M.bottom;
  const x = (pct) => M.left + (Math.max(0, Math.min(100, (pct || 0) * 100)) / 100) * plotW;
  const baseline = H - M.bottom;
  const dotOffset = { 0: -9, 1: 0, 2: 9 };

  return (
    <Section
      id="chambers"
      step="04c"
      kicker="All three chambers"
      title="House, Senate and Congress against their own neutral benchmarks"
      lede={`The rest of this story filters to one chamber; this is the side-by-side view. Each dot is one enacted map's percentile rank among the neutral maps drawn for its own chamber — ${order.map((c) => `${c.label} ${fmtInt(ensembles[c.key].run.draws)}`).join(', ')}. A dot inside the shaded band is where geography alone could have landed; outside it, fewer than 5 in 100 neutral maps do.`}
      aside={
        <>
          <div className="aside-block">
            <p className="aside-title">Reading the three chambers together</p>
            <p className="micro-note">
              Percentiles are within-chamber, so they answer “how unusual is this map for an elected
              body of this size and geography?”, not “which chamber is worse”. A 100th-percentile
              efficiency gap in the Senate and a 90th in Congress are both outliers; the raw values are
              not comparable across chambers, the ranks are.
            </p>
          </div>
          <div className="aside-block">
            <p className="aside-title">What each chamber&rsquo;s map is</p>
            <dl className="index-list">
              {order.map((c) => (
                <div key={c.key}>
                  <dt>{c.label}</dt>
                  <dd>
                    {ensembles[c.key].run.districts} districts · {fmtInt(ensembles[c.key].run.draws)}{' '}
                    neutral maps
                  </dd>
                </div>
              ))}
            </dl>
            <p className="micro-note">
              All three scorecards use the same drawing method (
              {order.map((c) => ensembles[c.key].run.algorithm).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
              ) and the same election basis ({order[0] ? ensembles[order[0].key].run.election : '—'}), so the
              comparison is like for like.
            </p>
          </div>
          <div className="aside-block">
            <p className="aside-title">Split communities</p>
            <dl className="index-list">
              {splitRow.map(
                (s) =>
                  s && (
                    <div key={s.chamber}>
                      <dt>{order.find((c) => c.key === s.chamber)?.label}</dt>
                      <dd>
                        <strong>{s.enacted}</strong> municipalities · grade {s.grade || '—'}
                      </dd>
                    </div>
                  ),
              )}
            </dl>
            <p className="micro-note">
              The scorecards count split <em>municipalities</em>, not counties — their
              <code> county_splits</code> field is unpopulated for all three chambers, so a county
              count cannot be reported here.
            </p>
          </div>
        </>
      }
      footer={`Source: FDGA neutral-ensemble scorecards, one per chamber (${order.map((c) => `${c.label} ${fmtInt(ensembles[c.key].run.draws)}`).join(' · ')} maps; ${order[0] ? ensembles[order[0].key].run.algorithm : 'ReCom'}, ${order[0] ? ensembles[order[0].key].run.election : ''}). Percentiles are within-chamber. Minority benchmarks use ${order.find((c) => (ensembles[c.key].demographics || []).length) ? `${ensembles[order.find((c) => (ensembles[c.key].demographics || []).length).key].demographicSource?.year || ''} ACS CVAP` : 'CVAP'}; the House scorecard carries no CVAP run.`}
    >
      <figure className="chart">
        <FigureTools
          name="benchmark-all-chambers"
          title="House, Senate and Congress: percentile rank on every fairness test"
          subtitle="Each row is one test; each dot is one chamber's enacted map ranked among its own neutral maps"
        />
        <figcaption>Percentile rank of each enacted map, all three chambers on one axis</figcaption>
        <div className="chart-scroll">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Dot plot of ${rows.length} fairness tests against ${order.length} chambers, showing each enacted map's percentile rank among its own neutral ensemble`}
          >
            <rect x={x(0.05)} y={M.top - 14} width={x(0.95) - x(0.05)} height={rows.length * rowH + 8} rx="10" fill="#6440a4" opacity="0.08" />
            <text x={(x(0.05) + x(0.95)) / 2} y={M.top - 20} textAnchor="middle" className="axis-label">
              middle 90% of neutral maps
            </text>

            {[0, 25, 50, 75, 100].map((t) => (
              <g key={`g-${t}`}>
                <line x1={x(t / 100)} x2={x(t / 100)} y1={M.top - 14} y2={baseline} className={t === 50 ? 'zero-line' : 'gridline'} />
                <text x={x(t / 100)} y={baseline + 18} textAnchor="middle" className="axis-label">
                  {t}
                </text>
              </g>
            ))}

            {rows.map((r, i) => {
              const yc = M.top + i * rowH + rowH / 2;
              return (
                <g key={r.key}>
                  <line x1={x(0)} x2={x(1)} y1={yc} y2={yc} stroke="#e4e0ee" strokeWidth="1" />
                  <text x={M.left - 14} y={yc + 4} textAnchor="end" className="bench-label">
                    {r.label}
                  </text>
                  {r.cells.map((cell, ci) =>
                    cell ? (
                      <g key={cell.chamber}>
                        <title>
                          {`${order.find((c) => c.key === cell.chamber)?.label}: ${fmt(r, cell.enacted)} — ` +
                            `${Math.round((cell.pctRank || 0) * 100)}th percentile, grade ${cell.grade || '—'}, ` +
                            `neutral ${fmt(r, cell.p5)}–${fmt(r, cell.p95)}, "A" band ${fmtBand(r, cell.aLo, cell.aHi)}`}
                        </title>
                        <circle
                          cx={x(cell.pctRank)}
                          cy={yc + dotOffset[ci] * (order.length > 1 ? 1 : 0)}
                          r="5.4"
                          fill={CHAMBER_COLOR[cell.chamber] || '#8b6fc4'}
                          stroke="#ffffff"
                          strokeWidth="1.4"
                        />
                      </g>
                    ) : null,
                  )}
                </g>
              );
            })}

            <line x1={M.left} x2={W - M.right} y1={baseline} y2={baseline} className="axis-line" />
            <text x={x(0)} y={baseline + 32} className="axis-label">
              0 = lowest among neutral maps
            </text>
            <text x={x(1)} y={baseline + 32} textAnchor="end" className="axis-label">
              100 = highest
            </text>
          </svg>
        </div>
        <div className="legend">
          {order.map((c, i) => (
            <span key={c.key} className="legend-item">
              <i
                style={{
                  background: CHAMBER_COLOR[c.key] || '#8b6fc4',
                  height: 9,
                  width: 9,
                  borderRadius: '50%',
                  transform: `translateY(${dotOffset[i] * 0.4}px)`,
                }}
              />{' '}
              {c.label}
            </span>
          ))}
          <span className="legend-hint">dots are stacked vertically where chambers would overlap · hover for values</span>
        </div>
      </figure>

      <div className="table-scroll">
        <table className="metric-table">
          <caption>Partisan and competition tests, all three chambers</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {order.map((c) => (
                <th scope="col" key={c.key} className="num">
                  {c.label}
                </th>
              ))}
              {order.map((c) => (
                <th scope="col" key={`n-${c.key}`} className="num">
                  {c.label} · neutral range
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                {r.cells.map((cell, i) => (
                  <td className="num" key={`e-${i}`}>
                    {cell ? fmt(r, cell.enacted) : '—'}
                    {cell?.grade && (
                      <b
                        className="grade-chip"
                        style={{
                          background:
                            { A: '#4c2b86', B: '#6440a4', C: '#8b6fc4', D: '#a05a7e', F: '#7d3169' }[cell.grade] ||
                            '#8b6fc4',
                          marginLeft: 6,
                        }}
                      >
                        {cell.grade}
                      </b>
                    )}
                  </td>
                ))}
                {r.cells.map((cell, i) => (
                  <td className="num" key={`r-${i}`}>
                    {cell ? `${fmt(r, cell.p5)} – ${fmt(r, cell.p95)}` : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-scroll">
        <table className="metric-table">
          <caption>
            Minority representation and split communities — the enacted map against the
            scorecard&rsquo;s &ldquo;A&rdquo; band
          </caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {order.map((c) => (
                <th scope="col" key={c.key} className="num">
                  {c.label} enacted
                </th>
              ))}
              {order.map((c) => (
                <th scope="col" key={`a-${c.key}`} className="num">
                  {c.label} · &ldquo;A&rdquo; band
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {demoRows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                {r.cells.map((cell, i) => (
                  <td className="num" key={`e-${i}`}>
                    {cell ? Math.round(cell.enacted) : 'no CVAP run'}
                  </td>
                ))}
                {r.cells.map((cell, i) => (
                  <td className="num" key={`a-${i}`}>
                    {cell ? fmtBand({ unit: 'seats' }, cell.aLo, cell.aHi) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">
                Split municipalities
                <span className="metric-note">county_splits is unpopulated in every scorecard</span>
              </th>
              {splitRow.map((s, i) => (
                <td className="num" key={`s-${i}`}>
                  {s ? `${s.enacted} (${s.grade || '—'})` : '—'}
                </td>
              ))}
              {splitRow.map((s, i) => (
                <td className="num" key={`sb-${i}`}>
                  {s ? `≤ ${s.p5}` : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="law-note">
        <p>
          <strong>What this section can answer, and what it cannot.</strong> Percentile ranks are
          computed inside each chamber&rsquo;s own ensemble, so they say how unusual a map is for that
          chamber — not which chamber is gerrymandered worse. Raw values are not comparable across
          chambers of 180, 56 and 14 seats; the ranks are.
        </p>
        <p>
          <strong>Where the House column is blank.</strong> The House scorecard carries no citizen
          voting-age population run, so its minority benchmarks cannot be reported against a neutral
          range. Section 04b still counts the House&rsquo;s majority, coalition and influence districts
          from the plan files themselves ({' '}
          <em>enacted vs previous map</em>); only the benchmark comparison is missing, and the gap is
          in the scorecard, not in the census data.
        </p>
      </div>
    </Section>
  );
}
