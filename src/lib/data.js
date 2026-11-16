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
