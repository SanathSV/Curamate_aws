import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, ListPlus, LoaderCircle, X } from 'lucide-react';
import type { RulesOutput } from '../../types/rules';
import type { InferenceOptions } from '../../types/inference';
import { useInference } from '../../hooks/useInference';
import { buildRagCombinations } from '../../inference/ragCombinations';
import { canonicalKey, displaySymptom } from '../../inference/canonicalize';
import { displayContext } from '../../inference/context';
import { percent } from '../../utils/format';

interface Props { data: RulesOutput; observed: string[]; contexts: string[]; options: InferenceOptions; onClose: () => void }
export function RagCombinations({ data, observed, contexts, options, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const autoStarted = useRef(false);
  const inference = useInference(data, true);
  const [topK, setTopK] = useState('10');
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const k = Number(topK);
  const validK = Number.isInteger(k) && k >= 1 && k <= 100;
  const result = inference.result;
  const current = !!result && canonicalKey(result.observed) === canonicalKey(observed) && canonicalKey(result.contexts) === canonicalKey(contexts) && JSON.stringify(result.options) === JSON.stringify(options);
  const output = useMemo(() => result && current && validK ? buildRagCombinations(result, k) : null, [result, current, validK, k]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!inference.ready || !observed.length || autoStarted.current) return;
    autoStarted.current = true;
    inference.run(observed, options, contexts);
  }, [inference.ready, inference.run, observed, options, contexts]);
  useEffect(() => { setCopied(null); setCopyError(false); }, [output]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setCopyError(false); }
    catch { setCopyError(true); }
  }
  function download() {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'curamate-rag-combinations.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const hasQueries = !!output?.combinations.length;
  return <dialog ref={dialog} className="methodology-dialog rag-dialog" onCancel={onClose} onClose={onClose} aria-labelledby="rag-title">
    <div className="dialog-heading"><ListPlus size={21} /><button className="icon-button" aria-label="Close top K combinations" onClick={onClose}><X size={19} /></button></div>
    <h2 id="rag-title">Top K symptom combinations</h2>
    <p>Each query keeps every observed symptom and adds one suggested symptom. Ranked by inference score, not joint probability.</p>
    <div className="rag-observations"><span>Observed symptoms</span><strong>{observed.length ? observed.map(displaySymptom).join(' + ') : 'Select symptoms in the composer first.'}</strong>{contexts.length > 0 && <small>Context: {contexts.map(displayContext).join(' · ')} · exported separately</small>}</div>
    <div className="rag-controls"><label htmlFor="rag-top-k">Top K <input id="rag-top-k" type="number" min="1" max="100" step="1" value={topK} onChange={event => setTopK(event.target.value)} aria-invalid={!validK} /></label>
      <span>Score ≥ {percent(options.minScore, 1)} · depth {options.maxDepth}</span>
      <button className="primary-button" disabled={!observed.length || !inference.ready || inference.running || !validK} onClick={() => inference.run(observed, options, contexts)}>{inference.running ? <LoaderCircle size={15} className="spin" /> : <ListPlus size={15} />}{inference.running ? 'Generating…' : current ? 'Regenerate' : 'Generate combinations'}</button>
      {inference.running && <button className="text-button" onClick={inference.clear}>Cancel</button>}
    </div>
    {!validK && <p className="rag-notice" role="alert">Enter a whole number from 1 to 100.</p>}
    {!inference.ready && !inference.error && <p className="rag-notice" role="status">Preparing local inference…</p>}
    {inference.error && <p className="rag-notice" role="alert">{inference.error}</p>}
    {result && !current && <p className="rag-notice">Inputs changed. Generate again before exporting.</p>}
    {output && !inference.running && <>
      <div className="rag-export"><span>{output.combinations.length} of {output.availableCombinations} qualifying combinations</span><button className="secondary-button" disabled={!hasQueries} onClick={() => copy(output.combinations.map(row => row.query).join('\n'), 'all')}>{copied === 'all' ? <Check size={14} /> : <Copy size={14} />}{copied === 'all' ? 'Copied' : 'Copy queries'}</button><button className="secondary-button" onClick={download}><Download size={14} />JSON</button></div>
      {output.truncated && <p className="rag-notice" role="status">Partial search: the exploration safety limit was reached. These are the best combinations found, not a guaranteed global top K. Lower depth or use fewer observations and run again.</p>}
      {!hasQueries ? <p className="rag-notice">No additional symptoms meet the current threshold and depth. Adjust discovery settings and try again.</p> : <ol className="rag-list">{output.combinations.map(row => <li key={row.key}>
        <div className="rag-query"><span>{row.symptoms.slice(0, -1).map(displaySymptom).join(' + ')} <b>+ {displaySymptom(row.addedSymptom)}</b></span><strong>{percent(row.score, 2)}</strong></div>
        <div className="rag-row-footer"><small>Added {displaySymptom(row.addedSymptom)} · depth {row.depth}</small><button className="text-button" aria-label={'Copy combination ' + row.rank} onClick={() => copy(row.query, row.key)}>{copied === row.key ? <Check size={13} /> : <Copy size={13} />}{copied === row.key ? 'Copied' : 'Copy query'}</button></div>
      </li>)}</ol>}
    </>}
    {copyError && <p className="rag-notice" role="alert">Clipboard access was unavailable. Download the JSON or select and copy a row.</p>}
    <p className="rag-footnote">Uses the cached dataset and gender filter. Graph candidate limits do not apply. Queries are prepared locally; nothing is sent to a RAG service.</p>
  </dialog>;
}
