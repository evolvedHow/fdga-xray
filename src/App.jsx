import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import Statewide from './components/Statewide';
import SeatsVsVotes from './components/SeatsVsVotes';
import CountySwing from './components/CountySwing';
import CountyGrid from './components/CountyGrid';
import MapEffect from './components/MapEffect';
import Benchmark from './components/Benchmark';
import Representation from './components/Representation';
import ChamberBenchmark from './components/ChamberBenchmark';
import PartisanRiver from './components/PartisanRiver';
import PlanCompare from './components/PlanCompare';
import CountyMap from './components/CountyMap';
import Competitiveness from './components/Competitiveness';
import PrecinctXray from './components/PrecinctXray';
import Notes from './components/Notes';
import { loadStory, nearestKey } from './lib/data';
import { exportReportPng, printReport } from './lib/export';

const DEFAULT_STATE = {
  chamber: 'state_house',
  year: 2024,
  election: 'composite',
  layout: 'vertical',
  county: null,
  precinct: null,
  // Which map transition section 03 compares: the 2024 court remedy, or the
  // deck's own previous-map → 2021-enacted comparison.
  pair: 'remedy',
};

/** Read story state from the URL hash so views are shareable. */
function readHash(meta) {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const out = {};
  const chamber = params.get('chamber');
  if (chamber && meta.chambers.some((c) => c.key === chamber)) out.chamber = chamber;
  const year = Number(params.get('year'));
  if (Number.isFinite(year) && year > 1990) out.year = year;
  const election = params.get('election');
  if (election && meta.elections.some((e) => e.key === election)) out.election = election;
  const layout = params.get('layout');
  if (layout === 'vertical' || layout === 'horizontal') out.layout = layout;
  const pair = params.get('pair');
  if (pair === 'remedy' || pair === 'enactment') out.pair = pair;
  const county = params.get('county');
  if (county) out.county = county;
  const precinct = params.get('precinct');
  if (precinct) out.precinct = precinct;
  return out;
}

/** Serialise state into the hash without spamming history. */
function writeHash(state) {
  const params = new URLSearchParams();
  params.set('chamber', state.chamber);
  params.set('year', String(state.year));
  params.set('election', state.election);
  params.set('layout', state.layout);
  params.set('pair', state.pair);
  if (state.county) params.set('county', state.county);
  if (state.precinct) params.set('precinct', state.precinct);
  const next = `#${params.toString()}`;
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}

/**
 * FDGA X-Ray — a continuous, filterable data story built from the FDP common
 * data model. State → county → precinct, with a vertical/horizontal flow switch.
 */
export default function App() {
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [state, setState] = useState(DEFAULT_STATE);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState(null);
  const flowRef = useRef(null);
  const noteTimer = useRef(null);

  useEffect(() => {
    let live = true;
    loadStory()
      .then((data) => {
        if (!live) return;
        setStory(data);
        const fromHash = readHash(data.meta);
        // Drop hash values that do not exist in this bundle (stale shared links).
        if (fromHash.county && !data.counties.features.some((f) => f.properties.fips === fromHash.county)) {
          delete fromHash.county;
        }
        if (fromHash.precinct && !data.precincts.some((p) => p.geoid === fromHash.precinct)) {
          delete fromHash.precinct;
        }
        setState((s) => ({ ...s, ...fromHash }));
      })
      .catch((err) => live && setError(err));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (story) writeHash(state);
  }, [story, state]);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  const flash = useCallback((message) => {
    setNote(message);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 8000);
  }, []);

  const meta = story?.meta;
  const chamberMeta = useMemo(
    () => meta?.chambers.find((c) => c.key === state.chamber) || meta?.chambers[0],
    [meta, state.chamber],
  );

  const chamberRows = useMemo(
    () => (story ? story.chamber_year.filter((r) => r.chamber === state.chamber) : []),
    [story, state.chamber],
  );

  const years = useMemo(
    () => Array.from(new Set(chamberRows.map((r) => r.year))).sort((a, b) => a - b),
    [chamberRows],
  );

  const year = useMemo(() => {
    if (!years.length) return state.year;
    if (years.includes(state.year)) return state.year;
    return years[years.length - 1];
  }, [years, state.year]);

  const chamberRow = useMemo(
    () => chamberRows.find((r) => r.year === year) || null,
    [chamberRows, year],
  );

  const contestYears = story?.contests?.[state.chamber] || {};
  const contestKey = useMemo(() => nearestKey(contestYears, year), [contestYears, year]);
  const contests = contestKey ? contestYears[contestKey] : [];

  const votesYears = story?.county_votes?.[chamberMeta?.office] || {};
  const voteKey = useMemo(() => nearestKey(votesYears, year), [votesYears, year]);
  const countyVotes = voteKey ? votesYears[voteKey] : null;

  const electionLabel = useMemo(
    () => meta?.elections.find((e) => e.key === state.election)?.label || '',
    [meta, state.election],
  );

  /**
   * Section 03 can compare either published transition: the 2021-23 lines
   * against the 2024 court remedy, or the pre-2021 map against the 2021 enacted
   * map (the comparison FDGA/PGP's 2022 evaluation ran). Both are scored on the
   * same 2024 presidential vote, so only the lines differ.
   */
  const historyEffect = story?.map_effect_history?.[state.chamber] || null;
  const activeEffect =
    state.pair === 'enactment' && historyEffect
      ? historyEffect
      : story?.map_effect?.[state.chamber] || null;

  const pairControl = historyEffect ? (
    <div className="chart-toggle" role="group" aria-label="Which map transition to compare">
      <span>Comparing:</span>
      <button
        type="button"
        className={state.pair === 'remedy' ? 'is-active' : ''}
        aria-pressed={state.pair === 'remedy'}
        onClick={() => setState((s) => ({ ...s, pair: 'remedy' }))}
      >
        2021-23 lines → 2024 remedy
      </button>
      <button
        type="button"
        className={state.pair === 'enactment' ? 'is-active' : ''}
        aria-pressed={state.pair === 'enactment'}
        onClick={() => setState((s) => ({ ...s, pair: 'enactment' }))}
      >
        Previous map → 2021 enacted
      </button>
      <span className="legend-hint">both scored on the same 2024 presidential vote</span>
    </div>
  ) : null;

  const scrollToPrecincts = useCallback(() => {
    const el = document.getElementById('precincts');
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'start' });
  }, []);

  const selectCounty = useCallback(
    (fips, { jump = false } = {}) => {
      setState((s) => ({ ...s, county: fips, precinct: null }));
      if (jump && fips) scrollToPrecincts();
    },
    [scrollToPrecincts],
  );

  const exploreCounty = useCallback(() => {
    scrollToPrecincts();
  }, [scrollToPrecincts]);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, county: null, precinct: null }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    flowRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, []);

  const onExportPng = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const sections = await exportReportPng({
        filename: `fdga-xray-${state.chamber}-${year}-${day}.png`,
      });
      flash(`Saved a PNG of ${sections} story sections.`);
    } catch (err) {
      console.error('Report PNG export failed', err);
      flash('PNG export failed — try a desktop browser, or use Report PDF.');
    } finally {
      setExporting(false);
    }
  }, [exporting, state.chamber, year, flash]);

  const onExportPdf = useCallback(() => {
    printReport();
    flash('Choose “Save as PDF” in the print dialog.');
  }, [flash]);

  const onFlowKeyDown = useCallback((e) => {
    if (state.layout !== 'horizontal') return;
    const node = flowRef.current;
    if (!node) return;
    const card = node.querySelector('.story-card');
    const step = card ? card.getBoundingClientRect().width + 24 : 820;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      node.scrollBy({ left: step, behavior: 'smooth' });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      node.scrollBy({ left: -step, behavior: 'smooth' });
    }
  }, [state.layout]);

  if (error) {
    return (
      <div className="state-screen">
        <img src={`${import.meta.env.BASE_URL}fdga_icon.png`} alt="Fair Districts GA" width="64" />
        <h1>Story data did not load</h1>
        <p>{error.message}</p>
        <p className="micro-note">
          Run <code>cd ~/codebox/fgdp/fdp &amp;&amp; .venv/bin/python ../scripts/export_story_data.py</code>{' '}
          to rebuild <code>public/data/story.json</code>.
        </p>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="state-screen">
        <img src={`${import.meta.env.BASE_URL}fdga_icon.png`} alt="Fair Districts GA" width="64" />
        <h1>Loading the X-Ray…</h1>
        <p>Reading 2,698 precincts and 159 counties from the FDP bundle.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#swing">
        Skip to the story
      </a>

      <Header
        meta={meta}
        chamber={state.chamber}
        onChamber={(chamber) => setState((s) => ({ ...s, chamber, county: null, precinct: null }))}
        year={year}
        years={years}
        onYear={(y) => setState((s) => ({ ...s, year: y, precinct: null }))}
        election={state.election}
        onElection={(election) => setState((s) => ({ ...s, election }))}
        layout={state.layout}
        onLayout={(layout) => setState((s) => ({ ...s, layout }))}
        onReset={reset}
        hasDrill={Boolean(state.county || state.precinct)}
        onExportPng={onExportPng}
        onExportPdf={onExportPdf}
        exporting={exporting}
      />

      {note && (
        <p className="export-note" role="status">
          {note}
        </p>
      )}

      <nav className="spine" aria-label="Story sections">
        {[
          ['swing', '01', 'The swing'],
          ['seats', '02', 'Votes vs seats'],
          ['county-swing', '02a', 'County swings'],
          ['county-grid', '02b', 'County grid'],
          ['mapswap', '03', 'The map swap'],
          ['partisan-river', '03a', 'Landscape'],
          ['plans', '03b', 'Plan comparison'],
          ['benchmark', '04', 'The benchmark'],
          ['representation', '04b', 'Representation'],
          ['chambers', '04c', 'All chambers'],
          ['counties', '05', 'County map'],
          ['competition', '06', 'Competition'],
          ['precincts', '07', 'Precinct X-Ray'],
          ['notes', '08', 'Method'],
        ].map(([id, n, label]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' }); }}>
            <span>{n}</span> {label}
          </a>
        ))}
      </nav>

      <main
        id="top"
        ref={flowRef}
        className={`story-flow ${state.layout}`}
        tabIndex={-1}
        onKeyDown={onFlowKeyDown}
        aria-label="Continuous data story"
      >
        <div className="print-summary">
          <strong>FDGA X-Ray</strong>
          <span>
            {chamberMeta.label} · {year} · precinct lean: {electionLabel} ·{' '}
            {state.county ? 'drill-down active' : 'statewide'} · exported{' '}
            {new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}
          </span>
        </div>

        <Statewide
          statewide={story.statewide}
          chamberRow={chamberRow}
          chamberLabel={chamberMeta.label}
          year={year}
          onYear={(y) => setState((s) => ({ ...s, year: y }))}
        />

        <SeatsVsVotes rows={chamberRows} year={year} chamberLabel={chamberMeta.label} />

        <CountySwing
          countyGeoJSON={story.counties}
          countyVotes={story.county_votes}
          electionKey={chamberMeta.office}
          year={year}
          chamberLabel={chamberMeta.label}
        />

        <CountyGrid
          countyVotes={story.county_votes}
          electionKey={chamberMeta.office}
          year={year}
          chamberLabel={chamberMeta.label}
        />

        <MapEffect
          effect={activeEffect}
          sources={story.sources}
          chamberLabel={chamberMeta.label}
          year={year}
          contests={story.contests}
          chamber={chamberMeta.key}
          pairControl={pairControl}
        />

        <PartisanRiver
          contests={story.contests}
          chamber={chamberMeta.key}
          year={year}
          chamberLabel={chamberMeta.label}
        />
        <PlanCompare
          plans={story.plans?.[chamberMeta.key]}
          planPairs={story.plan_pairs?.[chamberMeta.key]}
          ensemble={story.ensemble?.[chamberMeta.key]}
          chamberLabel={chamberMeta.label}
        />
        <Benchmark ensemble={story.ensemble?.[chamberMeta.key]} chamberLabel={chamberMeta.label} />

        <Representation
          effect={story.map_effect?.[chamberMeta.key]}
          ensemble={story.ensemble?.[chamberMeta.key]}
          stateVap={story.state_vap}
          chamberLabel={chamberMeta.label}
        />

        <ChamberBenchmark ensembles={story.ensemble} chambers={meta.chambers} />

        <CountyMap
          counties={story.counties}
          countyVotes={countyVotes}
          chamberLabel={chamberMeta.label}
          year={year}
          selectedCounty={state.county}
          onSelectCounty={(fips) => selectCounty(fips)}
          onExplore={exploreCounty}
        />

        <Competitiveness contests={contests} chamberLabel={chamberMeta.label} year={year} />

        <PrecinctXray
          precincts={story.precincts}
          counties={story.counties}
          election={state.election}
          electionLabel={electionLabel}
          selectedCounty={state.county}
          onSelectCounty={selectCounty}
          selectedPrecinct={state.precinct}
          onSelectPrecinct={(geoid) => setState((s) => ({ ...s, precinct: geoid }))}
          countyVotes={countyVotes}
          chamberLabel={chamberMeta.label}
          year={year}
        />

        <Notes meta={meta} />
      </main>

      <footer className="site-footer">
        <img src={`${import.meta.env.BASE_URL}fdga_icon.png`} alt="" width="28" height="27" />
        <span>
          Fair Districts GA · FDGA X-Ray · data generated {new Date(meta.generated).toLocaleDateString('en-US', { dateStyle: 'medium' })}
        </span>
      </footer>
    </div>
  );
}
