/**
 * Data access + small formatting/projection helpers for the FDGA X-Ray story.
 * The bundle is produced by `scripts/export_story_data.py` from the FDP
 * common data model, so the site is fully static (GitHub Pages / Modal safe).
 */

const BUNDLE_URL = `${import.meta.env.BASE_URL}data/story.json`;

/**
 * Chamber display names, matching the fdex (Georgia Explorer) map-plan
 * dropdown so the two apps read consistently ("State House", "US Congress").
 */
export const CHAMBER_LABELS = {
  us_house: 'US Congress',
  state_senate: 'State Senate',
  state_house: 'State House',
};

/** Chamber dropdown order, matching fdex: Congress, State Senate, State House. */
export const CHAMBER_ORDER = ['us_house', 'state_senate', 'state_house'];

/**
 * Precinct-lean dropdown labels, matching the fdex "Election Results by
 * precinct" overlay group (e.g. "2024 President — Actual Results (by precinct)").
 * Keys not listed fall back to the bundle's own label.
 */
export const ELECTION_OPTION_LABELS = {
  composite: 'Partisan Lean, 2018-2024 (avg. of 6 elections, by precinct)',
  g18: '2018 Governor — Actual Results (by precinct)',
  p20: '2020 President — Actual Results (by precinct)',
  r21: '2021 US Senate Runoff — Actual Results (by precinct)',
  g22: '2022 Governor — Actual Results (by precinct)',
  s22: '2022 US Senate — Actual Results (by precinct)',
  p24: '2024 President — Actual Results (by precinct)',
};

/**
 * First election year whose results are not yet certified (GA SOS).
 * Shown as "(unofficial)" in the year dropdown.
 */
export const UNOFFICIAL_FROM_YEAR = 2026;

/**
 * Align the bundle's meta labels/ordering with the fdex dropdown naming.
 * @param {object} meta story bundle meta
 * @returns {object} the same meta, relabelled in place
 */
export function applyConsistentNaming(meta) {
  if (!meta) return meta;
  if (Array.isArray(meta.chambers)) {
    for (const c of meta.chambers) {
      if (CHAMBER_LABELS[c.key]) c.label = CHAMBER_LABELS[c.key];
    }
    meta.chambers.sort((a, b) => {
      const ia = CHAMBER_ORDER.indexOf(a.key);
      const ib = CHAMBER_ORDER.indexOf(b.key);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }
  return meta;
}

/**
 * Fetch the pre-built story bundle.
 * @returns {Promise<object>} story bundle
 */
export async function loadStory() {
  const res = await fetch(BUNDLE_URL);
  if (!res.ok) throw new Error(`Could not load story data (${res.status})`);
  const data = await res.json();
  applyConsistentNaming(data.meta);
  return data;
}

const intFmt = new Intl.NumberFormat('en-US');

/** Format an integer with thousands separators. */
export const fmtInt = (n) => (n == null || Number.isNaN(n) ? '—' : intFmt.format(Math.round(n)));

/** Format a 0–1 share as a percentage with one decimal. */
export const fmtPct = (v, digits = 1) =>
  v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(digits)}%`;

/** Format a signed point gap, e.g. +3.2 pts. */
export const fmtPts = (v, digits = 1) =>
  v == null || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)} pts`;

/** Compact vote counts: 1.2M / 482K. */
export function fmtCompact(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

/** Clamp a number into [lo, hi]. */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Linear scale factory.
 * @param {[number, number]} domain
 * @param {[number, number]} range
 */
export function scaleLinear([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((clamp(v, d0, d1) - d0) / span) * (r1 - r0);
}

/** Party colours used across the story (blue = Democratic, red = Republican). */
export const PARTY = {
  D: '#1f4bae',
  R: '#db1623',
  other: '#8b87a3',
};

/**
 * Diverging red → lavender → blue colour for a Democratic share.
 * Domain is deliberately narrowed to 25–75% for visual contrast.
 * @param {number|null} pctD
 */
export function leanColor(pctD) {
  if (pctD == null || Number.isNaN(pctD)) return '#d8d4e4';
  const t = clamp((pctD - 0.25) / 0.5, 0, 1); // 0 = strong R, 1 = strong D
  const red = [219, 22, 35];
  const mid = [240, 238, 246];
  const blue = [31, 75, 174];
  const a = t < 0.5 ? red : mid;
  const b = t < 0.5 ? mid : blue;
  const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const mix = a.map((c, i) => Math.round(c + (b[i] - c) * u));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

/**
 * Equirectangular projection that preserves Georgia's aspect ratio.
 * @param {number} w target width
 * @param {number} h target height
 * @param {[number, number, number, number]} bounds [minLon, minLat, maxLon, maxLat]
 * @returns {(lon:number, lat:number)=>[number, number]}
 */
export function makeProjection(w, h, bounds) {
  const [x0, y0, x1, y1] = bounds;
  const kx = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const dx = (x1 - x0) * kx;
  const dy = y1 - y0;
  const scale = Math.min(w / dx, h / dy);
  const ox = (w - dx * scale) / 2;
  const oy = (h - dy * scale) / 2;
  return (lon, lat) => [ox + (lon - x0) * kx * scale, oy + (y1 - lat) * scale];
}

/**
 * Turn a GeoJSON Polygon/MultiPolygon into an SVG path string.
 * @param {object} geometry
 * @param {(lon:number, lat:number)=>[number,number]} project
 */
export function geometryToPath(geometry, project) {
  if (!geometry) return '';
  const rings =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const parts = [];
  for (const polygon of rings) {
    for (const ring of polygon) {
      if (!ring.length) continue;
      const d = ring
        .map(([lon, lat], i) => {
          const [x, y] = project(lon, lat);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join('');
      parts.push(`${d}Z`);
    }
  }
  return parts.join('');
}

/** Compute the lon/lat bounds of a FeatureCollection. */
export function featureBounds(features) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      x0 = Math.min(x0, lon);
      y0 = Math.min(y0, lat);
      x1 = Math.max(x1, lon);
      y1 = Math.max(y1, lat);
      return;
    }
    coords.forEach(walk);
  };
  features.forEach((ft) => walk(ft.geometry.coordinates));
  return [x0, y0, x1, y1];
}

/**
 * County-swing comparisons: for each office, the prior cycle each election year
 * is measured against (e.g. the 2024 president compares with 2020).
 *
 * Chamber races are every two years, so both the presidential-cycle years and
 * the midterms get a like-for-like pair four years back; that keeps every
 * selectable year comparable instead of leaving midterms without a baseline.
 */
export const COUNTY_COMPARISONS = {
  president: { 2020: 2024, 2016: 2020, 2012: 2016, 2008: 2012, 2004: 2008, 2000: 2004 },
  governor: { 2018: 2022, 2014: 2018, 2010: 2014, 2006: 2010, 2002: 2006 },
  us_house: {
    2022: 2026, 2020: 2024, 2018: 2022, 2016: 2020, 2014: 2018, 2012: 2016,
    2010: 2014, 2008: 2012, 2006: 2010, 2004: 2008, 2002: 2006, 2000: 2004,
  },
  us_senate: { 2020: 2024, 2016: 2020, 2012: 2016, 2008: 2012, 2004: 2008, 2000: 2004 },
  state_house: {
    2022: 2026, 2020: 2024, 2018: 2022, 2016: 2020, 2014: 2018, 2012: 2016,
    2010: 2014, 2008: 2012, 2006: 2010, 2004: 2008, 2002: 2006, 2000: 2004,
  },
  state_senate: {
    2022: 2026, 2020: 2024, 2018: 2022, 2016: 2020, 2014: 2018, 2012: 2016,
    2010: 2014, 2008: 2012, 2006: 2010, 2004: 2008, 2002: 2006, 2000: 2004,
  },
};

/**
 * Resolve the prior/current pair for a county-swing comparison.
 * @param {string} electionKey office key, e.g. "state_house"
 * @param {number} year currently selected election year
 * @returns {{prev:number, curr:number}|null} the pair, or null when the office
 *   or year has no previous cycle to compare against
 */
export function resolveCountyComparison(electionKey, year) {
  const comp = COUNTY_COMPARISONS[electionKey];
  if (!comp) return null;
  const prevYear = Object.keys(comp).find((prev) => Number(comp[prev]) === Number(year));
  if (!prevYear) return null;
  return { prev: Number(prevYear), curr: Number(year) };
}

/**
 * Two-party Democratic share of one county's votes.
 *
 * Computed as d/(d+r) rather than taken from the bundle's `pctD` (which is a
 * share of *all* votes): cycles where third-party or write-in votes are large
 * would otherwise read as a collapse in Democratic support. This matches the
 * definition used by the district-level charts.
 * @param {{d:number, r:number, pctD?:number}} row county vote totals
 * @returns {number|null} Democratic two-party share, or null when there are no
 *   major-party votes to compare
 */
export function twoPartyDem(row) {
  if (!row) return null;
  const major = (row.d || 0) + (row.r || 0);
  if (major > 0) return row.d / major;
  return row.pctD != null ? row.pctD : null;
}

/**
 * Per-county Democratic-share shift between two cycles of one office.
 * @param {object} countyVotes bundle `county_votes`, keyed office → year → county
 * @param {string} electionKey office key
 * @param {{prev:number, curr:number}} comparison resolved year pair
 * @returns {Array<{county:string, name:string, shift:number, prevPct:number,
 *   currPct:number, flipped:boolean, prevVotes:number, currVotes:number}>}
 *   every county present in both cycles, sorted by |shift|, largest first
 */
export function countyShifts(countyVotes, electionKey, comparison) {
  const votes = countyVotes?.[electionKey];
  if (!votes || !comparison) return [];
  const prev = votes[String(comparison.prev)];
  const curr = votes[String(comparison.curr)];
  if (!prev || !curr) return [];

  const out = [];
  for (const county of Object.keys(curr)) {
    const p = prev[county];
    const c = curr[county];
    if (!p || !c) continue;
    const prevPct = twoPartyDem(p);
    const currPct = twoPartyDem(c);
    if (prevPct == null || currPct == null) continue;
    out.push({
      county,
      name: titleCaseCounty(county),
      shift: currPct - prevPct, // positive = Democratic gain, in shares
      prevPct,
      currPct,
      flipped: prevPct > 0.5 !== currPct > 0.5,
      prevVotes: p.total || 0,
      currVotes: c.total || 0,
    });
  }
  out.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
  return out;
}

/**
 * Render an uppercase county key from the vote tables as display text.
 * @param {string} county e.g. "BEN HILL"
 * @returns {string} e.g. "Ben Hill"
 */
export function titleCaseCounty(county) {
  return String(county)
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Smallest "nice" shading cap at or above a value, so a colour ramp saturates
 * on a round number rather than on one extreme county.
 * @param {number} v reference magnitude (percentage points)
 * @returns {number} a round cap in percentage points
 */
export function niceCap(v) {
  for (const c of [1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100]) {
    if (v <= c) return c;
  }
  return Math.ceil(v / 25) * 25;
}

/** Finds the closest year key present in an object of {year: value}. */
export function nearestKey(obj, year) {
  const keys = Object.keys(obj)
    .map(Number)
    .sort((a, b) => a - b);
  if (!keys.length) return null;
  let best = keys[0];
  for (const k of keys) {
    if (Math.abs(k - year) < Math.abs(best - year)) best = k;
  }
  return String(best);
}
