import React, { useMemo } from 'react';
import Section from './Section';
import FigureTools from './FigureTools';
import { fmtPct } from '../lib/data';

/**
 * Partisan River / Competitive Landscape
 *
 * Shows districts as connected dots ordered by partisan lean, with:
 * - Y-axis: Democratic vote share (0-100%)
 * - X-axis: Districts ordered from most Democratic to most Republican
 * - Gradient zones: Transparent blue/red showing competitive range (45-55%)
 * - Connected line: Shows progression across districts
 * - Dot colors: Blue = Democratic win, Red = Republican win
 */
export default function PartisanRiver({
  contests,
  chamber,
  year,
  chamberLabel,
}) {
  // Get contests for this year/chamber
  const contestKey = String(year);
  const contestList = contests?.[chamber]?.[contestKey] || [];

  // Extract and sort district-level data by Democratic vote share
  const districts = useMemo(() => {
    return contestList
      .map((contest, idx) => ({
        id: contest.id || `D${idx + 1}`,
        demShare: contest.demPct || 0,
        repShare: contest.repPct || 0,
        demWon: (contest.demPct || 0) > (contest.repPct || 0),
        margin: (contest.demPct || 0) - (contest.repPct || 0),
      }))
      .sort((a, b) => a.demShare - b.demShare); // Order left (Dem) to right (Rep)
  }, [contestList]);

  if (!districts.length) {
    return (
      <Section
        id="partisan-river"
        step="04"
        kicker="Competitive landscape"
        title="No district data available for this selection"
        lede="Select a year and chamber with district-level data to view the competitive landscape."
      />
    );
  }

  // SVG dimensions
  const W = 960;
  const H = 400;
  const M = { top: 40, right: 40, bottom: 60, left: 60 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  // Scale functions
  const xScale = (i) => M.left + (i / (Math.max(1, districts.length - 1))) * plotW;
  const yScale = (demShare) => M.top + plotH - demShare * plotH;

  // Competitive range (45-55% Democratic)
  const competitiveMin = 0.45;
  const competitiveMax = 0.55;
  const competitiveMinY = yScale(competitiveMax); // Inverted Y-axis
  const competitiveMaxY = yScale(competitiveMin);

  // Count winners
  const demWins = districts.filter((d) => d.demWon).length;
  const repWins = districts.length - demWins;

  return (
    <Section
      id="partisan-river"
      step="04"
      kicker="Competitive landscape"
      title={`How competitive are ${chamberLabel.toLowerCase()} districts?`}
      lede={`Each dot represents a district, ordered left to right from most Democratic to most Republican based on their vote share. The shaded zones show the competitive range (45-55% Democratic), where districts could plausibly swing either way. The connecting line shows the progression across the partisan spectrum. Blue dots indicate Democratic winners; red dots indicate Republican winners.`}
      aside={
        <>
          <dl>
            <dt>Democratic wins</dt>
            <dd>{demWins} districts</dd>
            <dt>Republican wins</dt>
            <dd>{repWins} districts</dd>
            <dt>In competitive range</dt>
            <dd>
              {districts.filter((d) => d.demShare >= competitiveMin && d.demShare <= competitiveMax)
                .length || '—'}
            </dd>
          </dl>
        </>
      }
    >
      <figure className="chart">
        <FigureTools
          name={`partisan-river-${chamber}-${year}`}
          title="Competitive landscape"
          subtitle={`${chamberLabel} districts ordered by Democratic vote share, ${year}`}
        />

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="partisan-river-chart"
          style={{ maxWidth: '100%', height: 'auto' }}
        >
          <defs>
            <linearGradient id="demoGradient" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#4A90E2" stopOpacity="0" />
              <stop offset="50%" stopColor="#4A90E2" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#4A90E2" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="gopGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E24A4A" stopOpacity="0" />
              <stop offset="50%" stopColor="#E24A4A" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#E24A4A" stopOpacity="0.25" />
            </linearGradient>
          </defs>

          {/* Competitive range gradient backgrounds */}
          <rect
            x={M.left}
            y={competitiveMinY}
            width={plotW}
            height={competitiveMaxY - competitiveMinY}
            fill="url(#demoGradient)"
            opacity="0.7"
          />
          <rect
            x={M.left}
            y={competitiveMaxY}
            width={plotW}
            height={competitiveMinY - competitiveMaxY}
            fill="url(#gopGradient)"
            opacity="0.7"
          />

          {/* 50% equilibrium line */}
          <line
            x1={M.left}
            y1={yScale(0.5)}
            x2={W - M.right}
            y2={yScale(0.5)}
            stroke="#999"
            strokeDasharray="3,3"
            strokeWidth="1"
            opacity="0.4"
          />

          {/* Connected line through districts */}
          <polyline
            points={districts
              .map((d, i) => `${xScale(i)},${yScale(d.demShare)}`)
              .join(' ')}
            fill="none"
            stroke="#ccc"
            strokeWidth="1.5"
            opacity="0.5"
          />

          {/* District dots */}
          {districts.map((district, i) => (
            <g key={i}>
              <circle
                cx={xScale(i)}
                cy={yScale(district.demShare)}
                r="4.5"
                fill={district.demWon ? '#4A90E2' : '#E24A4A'}
                stroke="white"
                strokeWidth="1.5"
                opacity="0.85"
              />
              <title>{`${district.id}: ${fmtPct(district.demShare)}D, ${fmtPct(
                district.repShare,
              )}R (${district.demWon ? 'Democratic' : 'Republican'} win)`}</title>
            </g>
          ))}

          {/* Y-axis */}
          <line
            x1={M.left}
            y1={M.top}
            x2={M.left}
            y2={H - M.bottom}
            stroke="#333"
            strokeWidth="1"
          />

          {/* X-axis */}
          <line
            x1={M.left}
            y1={H - M.bottom}
            x2={W - M.right}
            y2={H - M.bottom}
            stroke="#333"
            strokeWidth="1"
          />

          {/* Y-axis tick labels */}
          <g fontSize="11" fill="#666" textAnchor="end">
            <text x={M.left - 8} y={yScale(0.8) + 4}>
              80%
            </text>
            <text x={M.left - 8} y={yScale(0.6) + 4}>
              60%
            </text>
            <text x={M.left - 8} y={yScale(0.5) + 4} fontWeight="bold" fill="#333">
              50%
            </text>
            <text x={M.left - 8} y={yScale(0.4) + 4}>
              40%
            </text>
            <text x={M.left - 8} y={yScale(0.2) + 4}>
              20%
            </text>
          </g>

          {/* Y-axis label */}
          <text
            x="20"
            y={M.top + 15}
            fontSize="13"
            fontWeight="600"
            fill="#333"
            textAnchor="start"
          >
            Democratic Vote Share
          </text>

          {/* X-axis label */}
          <text
            x={W / 2}
            y={H - 12}
            fontSize="11"
            fill="#666"
            textAnchor="middle"
          >
            Districts ordered by Democratic vote share (left = most Dem, right = most GOP)
          </text>
        </svg>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            gap: '24px',
            marginTop: '16px',
            fontSize: '12px',
            color: '#666',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: '#4A90E2',
                borderRadius: '50%',
              }}
            />
            Democratic winner
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: '#E24A4A',
                borderRadius: '50%',
              }}
            />
            Republican winner
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '30px',
                height: '12px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(74, 144, 226, 0.2) 50%, transparent 100%)',
                border: '1px solid #ddd',
              }}
            />
            Competitive range (45–55%)
          </div>
        </div>
      </figure>
    </Section>
  );
}
