import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUp, BookOpen, Check, ChevronDown, CircleHelp, Database, GitBranch, LoaderCircle, Maximize2, Minimize2, Moon, Network, Plus, RotateCcw, SlidersHorizontal, Square, Sun, X } from 'lucide-react';
import { useRules } from './hooks/useRules';
import { useInference } from './hooks/useInference';
import { useTheme } from './hooks/useTheme';
import { SymptomMultiSelect } from './components/SymptomMultiSelect';
import { InferenceControls } from './components/InferenceControls';
import { SymptomGraph } from './components/graph/SymptomGraph';
import { GraphControls } from './components/graph/GraphControls';
import { NodeDetails } from './components/graph/NodeDetails';
import { InferenceResults } from './components/results/InferenceResults';
import { SymptomPaths } from './components/results/SymptomPaths';
import { SymptomComparison } from './components/results/SymptomComparison';
import { Methodology } from './components/Methodology';
import { PatientContext } from './components/PatientContext';
import { RagCombinations } from './components/results/RagCombinations';
import { displayContext, isContextToken } from './inference/context';
import { filterDatasetByGender, selectedGender } from './inference/genderFilter';
import { createSymptomTrie } from './trie/symptomTrie';
import { DEFAULT_OPTIONS } from './types/inference';
import type { InferenceOptions } from './types/inference';
import type { GraphHandle } from './types/graph';
import { canonicalKey, displaySymptom } from './inference/canonicalize';
import { formatNumber, percent } from './utils/format';

const EMPTY_FREQUENCY = {};
export default function App() {
  const rules = useRules();
  const inference = useInference(rules.data);
  const { theme, toggleTheme } = useTheme();
  const [observed, setObserved] = useState<string[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);
  const gender = selectedGender(contexts);
  const visibleData = useMemo(() => rules.data ? filterDatasetByGender(rules.data, gender) : null, [rules.data, gender]);
  const symptomTrie = useMemo(() => visibleData ? createSymptomTrie(visibleData.symptom_frequency) : null, [visibleData]);
  const unavailableGenderSymptoms = gender && rules.data
    ? (rules.data[gender === 'male' ? 'male_symptoms' : 'female_symptoms'] ?? []).filter(name => !Object.hasOwn(rules.data!.symptom_frequency, name)).length
    : 0;
  const [removedSymptoms, setRemovedSymptoms] = useState(0);
  const [options, setOptions] = useState<InferenceOptions>({ ...DEFAULT_OPTIONS });
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleDepth, setVisibleDepth] = useState(3);
  const [viewScore, setViewScore] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [methodology, setMethodology] = useState(false);
  const [ragOpen, setRagOpen] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [comparisonSession, setComparisonSession] = useState(0);
  const settings = useRef<HTMLDetailsElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const graph = useRef<GraphHandle>(null);
  const result = inference.result;
  const candidates = useMemo(() => result?.candidates ?? [], [result]);
  const selectedCandidate = useMemo(() => candidates.find(candidate => candidate.symptom === selected), [candidates, selected]);
  const graphObserved = result?.observed ?? observed;
  const selectedObserved = selected && graphObserved.includes(selected) ? selected : undefined;
  const dirty = !!result && (canonicalKey(observed) !== canonicalKey(result.observed) || canonicalKey(contexts) !== canonicalKey(result.contexts) || JSON.stringify(options) !== JSON.stringify(result.options));
  const highestDepth = result?.options.maxDepth ?? options.maxDepth;
  const visibleCount = candidates.filter(candidate => candidate.depth <= visibleDepth && candidate.inferenceScore >= viewScore).length;
  const suggested = useMemo(() => symptomTrie?.search('', 4, new Set(observed)) ?? [], [symptomTrie, observed]);
  const run = () => {
    if (rules.loading || !inference.ready || !observed.length) return;
    setSelected(null); setVisibleDepth(options.maxDepth); setViewScore(0);
    if (settings.current) settings.current.open = false;
    inference.run(observed, options, contexts);
  };
  const selectSymptom = useCallback((symptom: string) => {
    const candidate = candidates.find(item => item.symptom === symptom);
    if (candidate) {
      setVisibleDepth(depth => Math.max(depth, candidate.depth));
      setViewScore(score => score > candidate.inferenceScore ? 0 : score);
    }
    setSelected(symptom);
  }, [candidates]);
  const clear = () => {
    inference.clear(); setObserved([]); setSelected(null); setVisibleDepth(options.maxDepth); setViewScore(0);
    setContexts([]);
    setRemovedSymptoms(0);
    setComparisonSession(value => value + 1);
    thread.current?.scrollTo({ top: 0 });
  };
  useEffect(() => { setSelected(null); }, [result]);
  useEffect(() => {
    if (visibleData) setObserved(previous => previous.filter(symptom => Object.hasOwn(visibleData.symptom_frequency, symptom)));
    if (rules.data) setContexts(previous => previous.filter(token => Object.hasOwn(rules.data!.context_frequency ?? {}, token)));
    setSelected(null);
  }, [rules.data, visibleData]);
  useEffect(() => {
    if (!graphExpanded) return;
    const restore = (event: KeyboardEvent) => { if (event.key === 'Escape') setGraphExpanded(false); };
    window.addEventListener('keydown', restore);
    return () => window.removeEventListener('keydown', restore);
  }, [graphExpanded]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (settings.current && !settings.current.contains(event.target as Node)) settings.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  function changeObserved(next: string[]) {
    setObserved(next.filter(symptom => visibleData && Object.hasOwn(visibleData.symptom_frequency, symptom)));
    if (!result && selected && !next.includes(selected)) setSelected(null);
  }
  function changeContexts(next: string[]) {
    if (selectedGender(next) !== gender) {
      const filtered = rules.data ? filterDatasetByGender(rules.data, selectedGender(next)) : null;
      const kept = observed.filter(symptom => filtered && Object.hasOwn(filtered.symptom_frequency, symptom));
      setRemovedSymptoms(observed.length - kept.length);
      setObserved(kept); setSelected(null); inference.clear();
    }
    setContexts(next);
  }
  const status = rules.loading ? 'Loading dataset…' : rules.error ? rules.data ? 'Using cached dataset' : 'Dataset offline' : inference.ready ? 'Dataset in memory' : 'Preparing engine…';
  return <div className={'console-shell' + (graphExpanded ? ' graph-expanded' : '')}>
    <a className="skip-link" href="#workspace">Skip to explorer</a>
    <aside className="console-sidebar" aria-label="Workspace navigation">
      <a className="brand" href="./" aria-label="CuraMate home"><Activity size={24} strokeWidth={1.8} /><strong>CuraMate</strong></a>
      <button className="new-exploration" onClick={clear}><Plus size={18} />New exploration</button>
      <div className="sidebar-navigation">
        <span className="sidebar-label">Workspace</span>
        <a href="#workspace" className="sidebar-link active"><Network size={17} />Symptom explorer</a>
        <a href="#symptom-comparison" className="sidebar-link" onClick={() => setGraphExpanded(false)}><GitBranch size={17} />Compare symptoms</a>
        <button className="sidebar-link" onClick={() => setMethodology(true)}><BookOpen size={17} />How it works</button>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-dataset">
          <div className="sidebar-label"><Database size={14} />Association dataset</div>
          {rules.loading ? <div className="skeleton skeleton-line" /> : rules.data ? <><p>{formatNumber(rules.data.metadata.transactions)} records</p><span>{rules.data.metadata.unique_symptoms} symptoms · {formatNumber(rules.data.metadata.rules_saved)} rules</span></> : <p className="muted">Waiting for connection</p>}
          {rules.loadedAt && <span className="dataset-cached-at">Loaded {rules.loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · cached in this tab</span>}
        </div>
        <button className="sidebar-link theme-switch" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
        <div className="sidebar-footer"><span className="local-indicator" />Inference runs on your device</div>
      </div>
    </aside>
    <main id="workspace" className="console-main">
      <header className="console-header">
        <div className="console-title"><span className="mobile-brand"><Activity size={19} />CuraMate<span>/</span></span><h1>Symptom explorer</h1><span className="research-label">Research</span></div>
        <div className="header-actions"><span className={'dataset-status ' + (rules.error ? 'offline' : '')}><span className="status-dot" />{status}</span>
          <button className="rag-trigger" disabled={!rules.data || rules.loading || inference.running} onClick={() => setRagOpen(true)} title="Generate complete symptom combinations for RAG queries">Top K <span>combinations</span></button>
          <button className="reload-dataset" disabled={rules.loading || inference.running} onClick={rules.reload} title="Make one new API request and replace the cached dataset" aria-label="Reload dataset"><RotateCcw size={15} className={rules.loading ? 'spin' : ''} /><span>Reload dataset</span></button>
          <button className="icon-button mobile-theme" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-button mobile-new" aria-label="New exploration" onClick={clear}><Plus size={19} /></button>
          <button className="icon-button" aria-label="About the inference model" title="About the inference model" onClick={() => setMethodology(true)}><CircleHelp size={18} /></button>
        </div>
      </header>
      <div className="conversation-scroll" ref={thread}>
        <div className="conversation">
          {rules.error && <div className="connection-banner" role="alert"><CircleHelp size={18} /><div><strong>{rules.configurationMissing ? 'Connect your dataset to begin' : rules.data ? 'Reload failed — using the previous dataset' : 'The dataset could not be loaded'}</strong><p>{rules.configurationMissing ? <>Set <code>VITE_RULES_API_URL</code>, then restart or rebuild the app.</> : rules.error}</p></div>{!rules.configurationMissing && <button className="secondary-button" disabled={rules.loading} onClick={rules.retry}><RotateCcw size={14} />Retry</button>}</div>}
          {result && <div className="observation-message"><span className="message-label">Observed symptoms</span><div>{result.observed.map(symptom => <button key={symptom} onClick={() => selectSymptom(symptom)}>{displaySymptom(symptom)}</button>)}</div></div>}
          <div className="assistant-message"><span className="assistant-avatar"><Activity size={20} /></span><div className="assistant-copy"><strong>CuraMate</strong>
            {rules.loading ? <p>Loading your symptom catalog…</p> : result ? <p>{candidates.length ? <>Found <b>{candidates.length} candidate {candidates.length === 1 ? 'association' : 'associations'}</b>. Explore the network below, or select a symptom to see its evidence.</> : 'No additional associations exceeded the selected inference threshold. You can change the symptoms or lower the threshold.'}</p> : <><h2>What symptoms are you observing?</h2><p>Add symptoms below. I’ll trace the associations and show how each candidate is reached.</p></>}
          </div></div>
          <section className="network-panel" aria-labelledby="network-title">
            <div className="network-heading"><h2 id="network-title"><GitBranch size={17} />Association network</h2><div className="graph-filters">
              <label className="sr-only" htmlFor="visible-depth">Visible inference depth</label><select id="visible-depth" value={Math.min(visibleDepth, highestDepth)} onChange={event => setVisibleDepth(Number(event.target.value))} disabled={!result}>{Array.from({ length: highestDepth + 1 }, (_, depth) => <option key={depth} value={depth}>{depth === 0 ? 'Observed only' : depth === highestDepth ? 'All depths' : 'Depth 0–' + depth}</option>)}</select>
              <label className="sr-only" htmlFor="view-score">Filter displayed inference scores</label><select id="view-score" value={viewScore} onChange={event => setViewScore(Number(event.target.value))} disabled={!result}><option value="0">All scores</option><option value=".7">≥ 70%</option><option value=".8">≥ 80%</option><option value=".9">≥ 90%</option></select>
              {result && (visibleDepth < highestDepth || viewScore > 0) && <button className="text-button show-all" onClick={() => { setVisibleDepth(highestDepth); setViewScore(0); }}>Show all</button>}
              <button className="icon-button expand-graph" aria-label={graphExpanded ? 'Restore graph size' : 'Expand graph to workspace'} aria-pressed={graphExpanded} title={graphExpanded ? 'Restore graph (Esc)' : 'Expand graph'} onClick={() => setGraphExpanded(value => !value)}>{graphExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
            </div></div>
            <div className="graph-stage">
              <SymptomGraph ref={graph} observed={graphObserved} candidates={candidates} maxDepth={visibleDepth} minScore={viewScore} selected={selected} onSelect={setSelected} onZoom={setZoom} theme={theme} />
              {!graphObserved.length && <div className="graph-empty">{rules.loading ? <LoaderCircle size={29} className="spin" /> : <Network size={34} strokeWidth={1.3} />}<h3>Your symptom network</h3><p>{rules.loading ? 'Preparing the dataset…' : 'Selected symptoms appear here immediately.\nRun discovery to connect their evidence.'}</p></div>}
              {inference.running && <div className="inference-progress" role="status"><LoaderCircle size={15} className="spin" />Tracing associations…</div>}
              <div className="graph-bottom"><GraphControls graph={graph} disabled={!graphObserved.length} zoom={zoom} /><span className="graph-hint">{result ? visibleCount + ' candidates' : 'Scroll to zoom · drag to pan'}</span></div>
            </div>
            <div className="graph-legend"><span><i className="legend-dot observed-dot" />Observed</span><span><i className="legend-dot latent-dot" />Candidate</span><span>Link labels = direct confidence</span>{(result?.options.associationMode ?? options.associationMode) !== 'pairwise' && <span><i className="legend-diamond" />Joint rule</span>}{selected && <button className="text-button" onClick={() => setSelected(null)}><X size={12} />Clear selection</button>}{!selected && <span className="graph-selection-hint">Select a node for evidence</span>}</div>
            {(result?.contexts ?? contexts).length > 0 && <div className="graph-context"><span>Patient context{(result?.options.associationMode ?? options.associationMode) === 'pairwise' ? ' · gender filters symptoms; context does not condition scores' : ''}</span><div className="context-badges">{(result?.contexts ?? contexts).map(token => <span className="context-badge" key={token}>{displayContext(token)}</span>)}</div></div>}
            {graphExpanded && selectedCandidate && <div className="expanded-evidence"><strong>{displaySymptom(selectedCandidate.symptom)}</strong><span>Score {percent(selectedCandidate.inferenceScore)} · {selectedCandidate.bestEvidence.antecedents.map(token => isContextToken(token) ? displayContext(token) : displaySymptom(token)).join(' + ')} → {displaySymptom(selectedCandidate.symptom)}</span><span>Direct confidence {percent(selectedCandidate.bestEvidence.rule.confidence, 1)} · {formatNumber(selectedCandidate.bestEvidence.rule.occurrences)} / {formatNumber(selectedCandidate.bestEvidence.rule.antecedent_occurrences)} records</span></div>}
          </section>
          {dirty && <div className="stale-results" role="status"><span>Your observations or settings have changed.</span><button className="text-button" onClick={run} disabled={!observed.length || inference.running || rules.loading}>Update network <RotateCcw size={13} /></button></div>}
          {visibleData && symptomTrie && <SymptomComparison key={comparisonSession} data={visibleData} trie={symptomTrie} observed={observed} />}
          {result && <InferenceResults result={result} selected={selected} onSelect={selectSymptom} visibleDepth={visibleDepth} />}
          {result?.paths && <SymptomPaths key={JSON.stringify([result.observed, result.options])} result={result.paths} observed={result.observed} />}
          {(selectedCandidate || selectedObserved) && <NodeDetails candidate={selectedCandidate} observed={selectedObserved} frequency={selectedObserved ? rules.data?.symptom_frequency[selectedObserved] : undefined} onSelect={selectSymptom} onClose={() => setSelected(null)} />}
          {result && <p className="run-metadata"><Check size={13} />{formatNumber(result.evaluatedAntecedents)} antecedents checked · {Math.max(1, Math.round(result.durationMs))} ms · local inference</p>}
          {inference.error && <div className="connection-banner" role="alert"><CircleHelp size={18} /><p>{inference.error}</p></div>}
          {result?.truncated && <div className="connection-banner" role="status"><CircleHelp size={18} /><div><strong>Exploration limit reached</strong><p>These are partial results. Reduce the number of symptoms, depth, or candidates per depth and try again.</p></div></div>}
        </div>
      </div>
      <div className="composer-dock"><div className="composer-wrapper">
        {!result && suggested.length > 0 && <div className="suggested-symptoms"><span>Quick add</span>{suggested.map(symptom => <button key={symptom} disabled={inference.running} onClick={() => changeObserved([...observed, symptom])}><Plus size={12} />{displaySymptom(symptom)}</button>)}</div>}
        <div className="composer">
          <div className="composer-input-heading"><span>Symptoms</span><span>{gender ? displaySymptom(gender) + ' · ' + Object.keys(visibleData?.symptom_frequency ?? {}).length + ' available' : observed.length ? observed.length + ' selected · all symptoms' : 'All symptoms'}</span></div>
          {rules.loading ? <div className="composer-loading"><LoaderCircle className="spin" size={18} /><span>Loading available symptoms…</span></div> : <SymptomMultiSelect trie={symptomTrie} frequency={visibleData?.symptom_frequency ?? EMPTY_FREQUENCY} selected={observed} onChange={changeObserved} disabled={!rules.data || inference.running} />}
          {gender && rules.data?.[gender === 'male' ? 'male_symptoms' : 'female_symptoms'] === undefined && <p className="gender-filter-notice" role="status">The API has no {gender} symptom list; showing all symptoms.</p>}
          {unavailableGenderSymptoms > 0 && <p className="gender-filter-notice" role="status">{unavailableGenderSymptoms} names in the {gender} list have no symptom-frequency data and are unavailable for exploration.</p>}
          {removedSymptoms > 0 && <p className="gender-filter-notice" role="status">Removed {removedSymptoms} selected {removedSymptoms === 1 ? 'symptom' : 'symptoms'} outside the new gender list.</p>}
          {rules.data?.context_frequency && <PatientContext frequency={rules.data.context_frequency} contexts={contexts} onChange={changeContexts} disabled={rules.loading || inference.running} combined={options.associationMode !== 'pairwise'} />}
          <div className="composer-actions">
            <details className="settings-menu" ref={settings} onKeyDown={event => { if (event.key === 'Escape' && settings.current) settings.current.open = false; }}><summary><SlidersHorizontal size={16} />Settings<ChevronDown size={12} /></summary><div className="settings-popover"><InferenceControls options={options} onChange={setOptions} disabled={!rules.data || inference.running} /></div></details>
            <span className="settings-summary">{percent(options.minScore)} minimum <span>·</span> depth {options.maxDepth}</span>
            {observed.length > 0 && <button className="text-button clear-observed" disabled={inference.running} onClick={() => changeObserved([])}>Clear</button>}
            {inference.running ? <button className="send-button" aria-label="Cancel exploration" title="Cancel exploration" onClick={inference.clear}><Square size={15} fill="currentColor" /></button> : <button className="send-button" aria-label="Discover latent symptoms" title="Discover latent symptoms" disabled={!observed.length || !inference.ready || !rules.data || rules.loading} onClick={run}><ArrowUp size={21} /></button>}
          </div>
        </div><p className="composer-notice">Association-derived decision-support visualization; not a diagnosis.</p>
      </div></div>
    </main>
    <Methodology open={methodology} onClose={() => setMethodology(false)} />
    {ragOpen && rules.data && <RagCombinations data={rules.data} observed={observed} contexts={contexts} options={options} onClose={() => setRagOpen(false)} />}
  </div>;
}
