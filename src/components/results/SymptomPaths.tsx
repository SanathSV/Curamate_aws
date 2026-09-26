import { useState } from 'react';
import { Download, ListTree } from 'lucide-react';
import type { PathSearchResult } from '../../inference/paths';
import { displaySymptom } from '../../inference/canonicalize';
import { formatNumber, percent } from '../../utils/format';

const PAGE_SIZE = 50;
export function SymptomPaths({ result, observed }: { result: PathSearchResult; observed: string[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(result.paths.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * PAGE_SIZE;
  function download() {
    const payload = { observed, mode: 'pairwise', scoreDefinition: 'Product of edge confidences; multi-hop scores are heuristic, not joint probabilities.', ...result };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'curamate-symptom-paths.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="paths-section" aria-labelledby="paths-title">
    <div className="paths-heading"><h2 id="paths-title"><ListTree size={18} />{result.truncated ? 'Partial symptom paths' : 'All symptom paths'}</h2><button className="secondary-button" onClick={download}><Download size={14} />Download JSON</button></div>
    <p className="paths-description">{formatNumber(result.paths.length)} individual paths · score ≥ {percent(result.minScore, 1)} · up to {result.maxDepth} links. Starts from each selected symptom separately; follows single-symptom rules. Graph candidate limits and filters do not hide paths here.</p>
    <p className="paths-description">Each link shows P(next | previous). Path score multiplies the links; multi-step scores are heuristic, not joint probabilities. Only rules present in the loaded dataset can be listed.</p>
    {result.truncated && <p className="paths-limit" role="status">Partial list: the {result.limitReason === 'paths' ? '50,000-path' : '250,000-edge evaluation'} safety limit was reached. Other qualifying paths may be missing. Raise the threshold or reduce the depth, then run again.</p>}
    {result.paths.length === 0 ? <p className="paths-empty">{result.truncated ? 'No qualifying paths were found before the safety limit.' : 'No paths meet this threshold within the selected depth.'}</p> : <>
      <ol className="path-list" start={start + 1}>{result.paths.slice(start, start + PAGE_SIZE).map(path => <li key={JSON.stringify(path.symptoms)}>
        <div className="path-row"><span className="path-sequence">{path.symptoms.map(displaySymptom).join(' → ')}</span><strong>{percent(path.score, 2)}<small>path score</small></strong></div>
        <div className="path-steps">{path.steps.map((step, index) => <span key={index}>{displaySymptom(step.from)} → {displaySymptom(step.to)}: <b>{percent(step.confidence, 2)}</b> ({formatNumber(step.occurrences)}/{formatNumber(step.antecedentOccurrences)})</span>)}</div>
      </li>)}</ol>
      <nav className="paths-pagination" aria-label="Symptom path pages"><span>{formatNumber(start + 1)}–{formatNumber(Math.min(start + PAGE_SIZE, result.paths.length))} of {formatNumber(result.paths.length)}</span><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span aria-live="polite">Page {currentPage + 1} / {pages}</span><button className="secondary-button" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>
    </>}
  </section>;
}
