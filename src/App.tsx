import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUp, BookOpen, Check, ChevronDown, ChevronUp, CircleHelp, Database, FlaskConical, GitBranch, LoaderCircle, Maximize2, Minimize2, Moon, Network, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, SlidersHorizontal, Square, Sun, X } from 'lucide-react';
import { useAnalytics } from './hooks/useAnalytics';
import { DiagnosisResults } from './components/results/DiagnosisResults';
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
const ValidationLab = lazy(() => import('./components/validation/ValidationLab').then(module => ({ default: module.ValidationLab })));
const WORKSPACE_TABS = ['clinical', 'comparison', 'validation'] as const;
type WorkspaceTab = typeof WORKSPACE_TABS[number];
export default function App() {
  const rules = useRules();
  const inference = useInference(rules.data);
  const analytics = useAnalytics(rules.data);
  const [latentK, setLatentK] = useState('10');
  const [diagnosisK, setDiagnosisK] = useState('3');
  const [glass, setGlass] = useState(false);
  const [inputsCollapsed, setInputsCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const validLimits = Number.isInteger(Number(latentK)) && Number(latentK) >= 1 && Number(latentK) <= 100 && Number.isSafeInteger(Number(diagnosisK)) && Number(diagnosisK) > 0;
  const busy = inference.running || analytics.running;
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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('clinical');
  const [comparisonVisited, setComparisonVisited] = useState(false);
  const [validationVisited, setValidationVisited] = useState(false);
  function switchTab(tab: WorkspaceTab) {
    setActiveTab(tab); setGraphExpanded(false);
    if (tab === 'comparison') setComparisonVisited(true);
    if (tab === 'validation') setValidationVisited(true);
  }
  const thread = useRef<HTMLDivElement>(null);
  const evidencePane = useRef<HTMLDivElement>(null);
  const diagnosisPane = useRef<HTMLElement>(null);
  const graph = useRef<GraphHandle>(null);
  const result = inference.result;
  const candidates = useMemo(() => result?.candidates ?? [], [result]);
  const selectedCandidate = useMemo(() => candidates.find(candidate => candidate.symptom === selected), [candidates, selected]);
  const graphObserved = result?.observed ?? observed;
  const selectedObserved = selected && graphObserved.includes(selected) ? selected : undefined;
  const dirty = !!result && (canonicalKey(observed) !== canonicalKey(result.observed) || canonicalKey(contexts) !== canonicalKey(result.contexts) || JSON.stringify(options) !== JSON.stringify(result.options));
  const highestDepth = result?.options.maxDepth ?? options.maxDepth;
  const visibleCount = candidates.filter(candidate => candidate.depth <= visibleDepth && candidate.inferenceScore >= viewScore).length;
  const run = () => {
    if (rules.loading || !inference.ready || !analytics.ready || busy || !validLimits || !observed.length) return;
    evidencePane.current?.scrollTo({ top: 0 }); diagnosisPane.current?.scrollTo({ top: 0 });
    setSelected(null); setVisibleDepth(options.maxDepth); setViewScore(0);
    if (settings.current) settings.current.open = false;
    inference.clear();
    inference.run(observed, options, contexts);
    analytics.start(observed, contexts, options, Number(latentK), Number(diagnosisK));
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
    analytics.reset(); inference.clear(); setObserved([]); setSelected(null); setVisibleDepth(options.maxDepth); setViewScore(0);
    setContexts([]);
    setRemovedSymptoms(0);
    setInputsCollapsed(false);
    setComparisonSession(value => value + 1);
    thread.current?.scrollTo({ top: 0 });
    evidencePane.current?.scrollTo({ top: 0 }); diagnosisPane.current?.scrollTo({ top: 0 });
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
    analytics.reset();
    setObserved(next.filter(symptom => visibleData && Object.hasOwn(visibleData.symptom_frequency, symptom)));
    if (!result && selected && !next.includes(selected)) setSelected(null);
  }
  function changeContexts(next: string[]) {
    analytics.reset();
    if (selectedGender(next) !== gender) {
      const filtered = rules.data ? filterDatasetByGender(rules.data, selectedGender(next)) : null;
      const kept = observed.filter(symptom => filtered && Object.hasOwn(filtered.symptom_frequency, symptom));
      setRemovedSymptoms(observed.length - kept.length);
      setObserved(kept); setSelected(null); inference.clear();
    }
    setContexts(next);
  }
  const status = rules.loading ? 'Loading dataset…' : rules.error ? rules.data ? 'Using cached dataset' : 'Dataset offline' : inference.ready ? 'Dataset in memory' : 'Preparing engine…';
  return <div className={'console-shell analytics-shell' + (glass ? ' glass-tiles' : '') + (sidebarCollapsed ? ' sidebar-collapsed' : '') + (graphExpanded ? ' graph-expanded' : '')}>
    <a className="skip-link" href="#workspace">Skip to explorer</a>
    <aside id="workspace-sidebar" className="console-sidebar" aria-label="Workspace navigation" hidden={sidebarCollapsed}>
      <a className="brand" href="./" aria-label="CuraMate home"><Activity size={24} strokeWidth={1.8} /><strong>CuraMate</strong></a>
      <button className="new-exploration" onClick={clear}><Plus size={18} />New exploration</button>
      <div className="sidebar-navigation">
        <span className="sidebar-label">Workspace</span>
        <button className={"sidebar-link " + (activeTab === "clinical" ? "active" : "")} onClick={() => switchTab("clinical")}><Network size={17} />Clinical workspace</button>
        <button className={"sidebar-link " + (activeTab === "comparison" ? "active" : "")} onClick={() => switchTab("comparison")}><GitBranch size={17} />Compare symptoms</button>
        <button className={"sidebar-link " + (activeTab === "validation" ? "active" : "")} onClick={() => switchTab("validation")}><FlaskConical size={17} />Validation Lab</button>
        <button className="sidebar-link" onClick={() => setMethodology(true)}><BookOpen size={17} />How it works</button>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-dataset">
          <div className="sidebar-label"><Database size={14} />Association dataset</div>
          {rules.loading ? <div className="skeleton skeleton-line" /> : rules.data ? <><p>{formatNumber(rules.data.metadata.transactions)} records</p><span>{rules.data.metadata.unique_symptoms} symptoms · {formatNumber(rules.data.metadata.rules_saved)} rules</span></> : <p className="muted">Waiting for connection</p>}
          {rules.loadedAt && <span className="dataset-cached-at">Loaded {rules.loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · cached in this tab</span>}
        </div>
        <button className="sidebar-link theme-switch" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
        <div className="sidebar-footer"><span className="local-indicator" />Latent inference stays on device</div>
      </div>
    </aside>
    <main id="workspace" className="console-main">
      <header className="console-header">
        <div className="console-title"><button type="button" className="icon-button sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="workspace-sidebar" onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button><span className="mobile-brand"><Activity size={19} />CuraMate<span>/</span></span><h1>{activeTab === "clinical" ? "Clinical workspace" : activeTab === "comparison" ? "Symptom comparison" : "Validation Lab"}</h1><span className="research-label">Research</span></div>
        <div className="header-actions"><button className="rag-trigger glass-toggle" aria-pressed={glass} onClick={() => setGlass(value => !value)} title="Toggle glass tiles">Glass {glass ? 'on' : 'off'}</button><span className={'dataset-status ' + (rules.error ? 'offline' : '')}><span className="status-dot" />{status}</span>
          <button className="rag-trigger" disabled={!rules.data || rules.loading || busy} onClick={() => setRagOpen(true)} title="Generate complete symptom combinations for RAG queries">Top K <span>combinations</span></button>
          <button className="reload-dataset" disabled={rules.loading || busy} onClick={rules.reload} title="Make one new API request and replace the cached dataset" aria-label="Reload dataset"><RotateCcw size={15} className={rules.loading ? 'spin' : ''} /><span>Reload dataset</span></button>
          <button className="icon-button mobile-theme" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-button mobile-new" aria-label="New exploration" onClick={clear}><Plus size={19} /></button>
          <button className="icon-button" aria-label="About the inference model" title="About the inference model" onClick={() => setMethodology(true)}><CircleHelp size={18} /></button>
        </div>
      </header>
      <div className="workspace-tabs" role="tablist" aria-label="Workspace views">
        {WORKSPACE_TABS.map(tab => <button key={tab} id={tab + '-tab'} role="tab" aria-selected={activeTab === tab} aria-controls={tab + '-panel'} tabIndex={activeTab === tab ? 0 : -1} onClick={() => switchTab(tab)} onKeyDown={event => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? WORKSPACE_TABS[0] : event.key === 'End' ? WORKSPACE_TABS[WORKSPACE_TABS.length - 1] : WORKSPACE_TABS[(WORKSPACE_TABS.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : WORKSPACE_TABS.length - 1)) % WORKSPACE_TABS.length];
            switchTab(next); document.getElementById(next + '-tab')?.focus();
          }
        }}>{tab === 'clinical' ? <Network size={17} /> : tab === 'comparison' ? <GitBranch size={17} /> : <FlaskConical size={17} />}{tab === 'clinical' ? 'Clinical workspace' : tab === 'comparison' ? 'Compare symptoms' : 'Validation Lab'}</button>)}
      </div>
      <div className="conversation-scroll" ref={thread} hidden={activeTab !== 'clinical'} id="clinical-panel" role="tabpanel" aria-labelledby="clinical-tab">
        <div className="conversation">
          {rules.error && <div className="connection-banner" role="alert"><CircleHelp size={18} /><div><strong>{rules.configurationMissing ? 'Connect your dataset to begin' : rules.data ? 'Reload failed — using the previous dataset' : 'The dataset could not be loaded'}</strong><p>{rules.configurationMissing ? <>Set <code>VITE_RULES_API_URL</code>, then restart or rebuild the app.</> : rules.error}</p></div>{!rules.configurationMissing && <button className="secondary-button" disabled={rules.loading} onClick={rules.retry}><RotateCcw size={14} />Retry</button>}</div>}
          <div className="analytics-grid"><div className="analytics-left" ref={evidencePane} role="region" aria-label="Symptom evidence, independently scrollable" tabIndex={0}>
          <div className="evidence-heading"><span>Symptom evidence</span><small>Associations &amp; paths</small></div>
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
              {!graphObserved.length && <div className="graph-empty">{rules.loading ? <LoaderCircle size={29} className="spin" /> : <Network size={34} strokeWidth={1.3} />}<h3>Your symptom network</h3><p>{rules.loading ? 'Preparing the dataset…' : 'Selected symptoms appear here immediately.\nClick Analyze to connect their evidence.'}</p></div>}
              {inference.running && <div className="inference-progress" role="status"><LoaderCircle size={15} className="spin" />Tracing associations…</div>}
              <div className="graph-bottom"><GraphControls graph={graph} disabled={!graphObserved.length} zoom={zoom} /><span className="graph-hint">{result ? visibleCount + ' candidates' : 'Scroll to zoom · drag to pan'}</span></div>
            </div>
            <div className="graph-legend"><span><i className="legend-dot observed-dot" />Observed</span><span><i className="legend-dot latent-dot" />Candidate</span><span>Link labels = direct confidence</span>{(result?.options.associationMode ?? options.associationMode) !== 'pairwise' && <span><i className="legend-diamond" />Joint rule</span>}{selected && <button className="text-button" onClick={() => setSelected(null)}><X size={12} />Clear selection</button>}{!selected && <span className="graph-selection-hint">Select a node for evidence</span>}</div>
            {(result?.contexts ?? contexts).length > 0 && <div className="graph-context"><span>Patient context{(result?.options.associationMode ?? options.associationMode) === 'pairwise' ? ' · gender filters symptoms; context does not condition scores' : ''}</span><div className="context-badges">{(result?.contexts ?? contexts).map(token => <span className="context-badge" key={token}>{displayContext(token)}</span>)}</div></div>}
            {graphExpanded && selectedCandidate && <div className="expanded-evidence"><strong>{displaySymptom(selectedCandidate.symptom)}</strong><span>Score {percent(selectedCandidate.inferenceScore)} · {selectedCandidate.bestEvidence.antecedents.map(token => isContextToken(token) ? displayContext(token) : displaySymptom(token)).join(' + ')} → {displaySymptom(selectedCandidate.symptom)}</span><span>Direct confidence {percent(selectedCandidate.bestEvidence.rule.confidence, 1)} · {formatNumber(selectedCandidate.bestEvidence.rule.occurrences)} / {formatNumber(selectedCandidate.bestEvidence.rule.antecedent_occurrences)} records</span></div>}
          </section>
          {dirty && <div className="stale-results" role="status"><span>Your observations or settings have changed.</span><button className="text-button" onClick={run} disabled={!observed.length || busy || rules.loading}>Analyze again <RotateCcw size={13} /></button></div>}
          {result && <InferenceResults result={result} selected={selected} onSelect={selectSymptom} visibleDepth={visibleDepth} />}
          <details className="secondary-analysis"><summary>Explore all symptom paths</summary>{result?.paths && <SymptomPaths key={JSON.stringify([result.observed, result.options])} result={result.paths} observed={result.observed} />}</details>
          {(selectedCandidate || selectedObserved) && <NodeDetails candidate={selectedCandidate} observed={selectedObserved} frequency={selectedObserved ? rules.data?.symptom_frequency[selectedObserved] : undefined} onSelect={selectSymptom} onClose={() => setSelected(null)} />}
          {result && <p className="run-metadata"><Check size={13} />{formatNumber(result.evaluatedAntecedents)} antecedents checked · {Math.max(1, Math.round(result.durationMs))} ms · local inference</p>}
          {inference.error && <div className="connection-banner" role="alert"><CircleHelp size={18} /><p>{inference.error}</p></div>}
          {result?.truncated && <div className="connection-banner" role="status"><CircleHelp size={18} /><div><strong>Exploration limit reached</strong><p>These are partial results. Reduce the number of symptoms, depth, or candidates per depth and try again.</p></div></div>}
          </div><aside className="diagnostic-workspace" ref={diagnosisPane} tabIndex={0} aria-labelledby="diagnostic-workspace-title" aria-busy={analytics.running}>
            <div className="diagnostic-sticky"><div className="diagnostic-heading"><span className="eyebrow">DIAGNOSTIC INSIGHTS</span><h2 id="diagnostic-workspace-title">Model-ranked diagnostic candidates</h2><p>Based on your original symptoms and latent combinations.</p></div>
            <div className="analysis-progress" role="status" aria-live="polite">
              {analytics.running ? <LoaderCircle size={17} className="spin" /> : analytics.phase === 'complete' ? <Check size={17} /> : <Activity size={17} />}
              <span>{analytics.phase === 'latent' ? 'Finding latent symptoms and combinations...' : analytics.phase === 'diagnosis' ? 'Ranking diagnostic candidates...' : analytics.phase === 'complete' ? 'Analysis complete' : analytics.phase === 'cancelled' ? 'Analysis cancelled. Ready when you are.' : analytics.phase === 'error' ? 'Analysis needs attention' : 'Ready to analyze'}</span>
            </div>
            </div>
            {analytics.error && <div className="rag-notice" role="alert">{analytics.error}<p>Use Analyze to start a new run.</p></div>}
            {analytics.truncated && <p className="rag-notice">The latent search reached its exploration limit. Diagnostic candidates use the original symptoms and available combinations.</p>}
            {dirty && <p className="rag-notice">Inputs changed. These results belong to the previous analysis.</p>}
            {analytics.response && analytics.request ? <DiagnosisResults response={analytics.response} request={analytics.request} /> : <div className="diagnostic-placeholder"><Network size={34} strokeWidth={1} /><h3>{analytics.running ? 'Connecting the clinical picture' : 'One analysis. A clearer picture.'}</h3><p>{analytics.running ? 'The graph appears first. Diagnostic candidates will appear here as soon as the service responds.' : 'Add the symptoms you observe. One click finds latent associations, builds symptom combinations, and requests diagnostic candidates.'}</p><div className="analysis-steps"><span>01 / Symptoms</span><span>02 / Associations</span><span>03 / Candidates</span></div></div>}
            {!analytics.response && <p className="diagnosis-review">Decision-support output | Requires clinician review</p>}
          </aside></div>
        </div>
      </div>
      <div className="comparison-workspace" hidden={activeTab !== 'comparison'} id="comparison-panel" role="tabpanel" aria-labelledby="comparison-tab">
        {rules.error && <div className="connection-banner" role="alert"><div><strong>{rules.data ? 'Using the previous dataset' : 'Comparison needs a dataset'}</strong><p>{rules.error}</p></div><button className="secondary-button" disabled={rules.loading} onClick={rules.retry}>Retry</button></div>}
        {rules.loading && <p className="comparison-empty" role="status">Loading symptom catalog?</p>}
        {comparisonVisited && visibleData && symptomTrie && <SymptomComparison key={comparisonSession} data={visibleData} trie={symptomTrie} observed={observed} />}
      </div>
      <div className="validation-workspace" hidden={activeTab !== 'validation'} id="validation-panel" role="tabpanel" aria-labelledby="validation-tab">
        {validationVisited && <Suspense fallback={<p className="comparison-empty" role="status">Loading Validation Lab...</p>}><ValidationLab data={rules.data} options={options} latentLimit={Number.isInteger(Number(latentK)) && Number(latentK) >= 1 && Number(latentK) <= 100 ? Number(latentK) : 10} /></Suspense>}
      </div>
      <div className={'composer-dock' + (inputsCollapsed ? ' inputs-collapsed' : '')} hidden={activeTab !== 'clinical'}><div className="composer-wrapper">
        <div className="composer-collapse-bar">
          <span>{inputsCollapsed ? `${observed.length} symptom${observed.length === 1 ? '' : 's'} selected${busy ? ' ? Analysis running' : ''}` : 'Patient inputs'}</span>
          <button type="button" className="composer-collapse-toggle" aria-expanded={!inputsCollapsed} aria-controls="patient-input-panel" onClick={() => {
            if (settings.current) settings.current.open = false;
            setInputsCollapsed(value => !value);
          }}>{inputsCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{inputsCollapsed ? 'Expand inputs' : 'Collapse inputs'}</button>
        </div>
        <div id="patient-input-panel" hidden={inputsCollapsed}>
        <div className="composer compact-composer">
          <div className="composer-fields"><div className="composer-symptoms">
          <div className="composer-input-heading"><span>Symptoms</span><span>{gender ? displaySymptom(gender) + ' · ' + Object.keys(visibleData?.symptom_frequency ?? {}).length + ' available' : observed.length ? observed.length + ' selected · all symptoms' : 'All symptoms'}</span></div>
          {rules.loading ? <div className="composer-loading"><LoaderCircle className="spin" size={18} /><span>Loading available symptoms…</span></div> : <SymptomMultiSelect trie={symptomTrie} frequency={visibleData?.symptom_frequency ?? EMPTY_FREQUENCY} selected={observed} onChange={changeObserved} disabled={!rules.data || busy} />}
          </div>
          {rules.data?.context_frequency && <PatientContext frequency={rules.data.context_frequency} contexts={contexts} onChange={changeContexts} disabled={rules.loading || busy} combined={options.associationMode !== 'pairwise'} />}
          </div>
          {gender && rules.data?.[gender === 'male' ? 'male_symptoms' : 'female_symptoms'] === undefined && <p className="gender-filter-notice" role="status">The API has no {gender} symptom list; showing all symptoms.</p>}
          {unavailableGenderSymptoms > 0 && <p className="gender-filter-notice" role="status">{unavailableGenderSymptoms} names in the {gender} list have no symptom-frequency data and are unavailable for exploration.</p>}
          {removedSymptoms > 0 && <p className="gender-filter-notice" role="status">Removed {removedSymptoms} selected {removedSymptoms === 1 ? 'symptom' : 'symptoms'} outside the new gender list.</p>}

          <div className="composer-actions">
            <div className="mode-toggle" role="group" aria-label="Association mode">
              <button type="button" disabled={!rules.data || busy} aria-pressed={options.associationMode === 'pairwise'} title="P(B | A): find B in records containing A" onClick={() => { analytics.reset(); setOptions({ ...options, associationMode: 'pairwise' }); }}>Pairwise <span>P(B | A)</span></button>
              <button type="button" disabled={!rules.data || busy} aria-pressed={options.associationMode !== 'pairwise'} title="Require all antecedent symptoms together; include selected patient context" onClick={() => { analytics.reset(); setOptions({ ...options, associationMode: 'combined' }); }}>Combined <span>P(B | A, C...)</span></button>
            </div>
            <label className="toolbar-number" title="Minimum path score. This is an inference threshold, not a diagnosis probability.">Min. score<input aria-label="Minimum path score percent" type="number" min="0" max="100" step="0.1" value={Number((options.minScore * 100).toFixed(1))} disabled={!rules.data || busy} onChange={event => { const score = event.target.valueAsNumber; if (Number.isFinite(score) && score >= 0 && score <= 100) { analytics.reset(); setOptions({ ...options, minScore: score / 100 }); } }} /><span>%</span></label>
            <label className="toolbar-number" title="Maximum latent additions; the original symptoms are always included separately">Latent K<input aria-label="Latent combinations" type="number" min="1" max="100" step="1" value={latentK} disabled={busy} onChange={event => { analytics.reset(); setLatentK(event.target.value); }} /></label>
            <label className="toolbar-number" title="Diagnoses returned per symptom combination">Diagnosis K<input aria-label="Diagnoses per combination" type="number" min="1" step="1" value={diagnosisK} disabled={busy} onChange={event => { analytics.reset(); setDiagnosisK(event.target.value); }} /></label>
            <details className="settings-menu" ref={settings} onKeyDown={event => { if (event.key === 'Escape' && settings.current) settings.current.open = false; }}><summary title="Depth and graph limits"><SlidersHorizontal size={15} />More<ChevronDown size={12} /></summary><div className="settings-popover"><InferenceControls advancedOnly options={options} onChange={next => { analytics.reset(); setOptions(next); }} disabled={!rules.data || busy} /></div></details>
            {observed.length > 0 && <button className="text-button clear-observed" disabled={busy} onClick={() => changeObserved([])}>Clear</button>}
            {busy ? <button className="analyze-button" onClick={() => { inference.clear(); analytics.cancel(); }}><Square size={14} fill="currentColor" />Stop analysis</button> : <button className="analyze-button" disabled={!observed.length || !inference.ready || !analytics.ready || !rules.data || rules.loading || !validLimits} onClick={run}><ArrowUp size={18} />Analyze</button>}
          </div>
          {!validLimits && <p className="gender-filter-notice" role="alert">Choose 1-100 latent combinations and a positive whole number of diagnoses.</p>}
        </div><p className="composer-notice">Analyze runs local inference, then sends symptoms and context to the diagnosis service. Requires clinician review.</p>
        </div>
      </div></div>
    </main>
    <Methodology open={methodology} onClose={() => setMethodology(false)} />
    {ragOpen && rules.data && <RagCombinations data={rules.data} observed={observed} contexts={contexts} options={options} onClose={() => setRagOpen(false)} />}
  </div>;
}
