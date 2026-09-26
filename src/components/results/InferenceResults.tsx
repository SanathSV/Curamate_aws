import { ArrowUpRight, ChevronRight, Layers3 } from 'lucide-react';
import type { InferenceResult } from '../../types/inference';
import { displaySymptom } from '../../inference/canonicalize';
import { percent } from '../../utils/format';
interface Props { result: InferenceResult | null; selected: string | null; onSelect: (symptom: string) => void; visibleDepth: number }
export function InferenceResults({ result, selected, onSelect, visibleDepth }: Props) {
  return <section className="results-section" aria-labelledby="results-heading">
    <div className="results-heading"><div><Layers3 size={17} /><h2 id="results-heading">Exploration by depth</h2>
      {result && <span className="count-badge">{result.candidates.length} candidates</span>}</div>
      <span>Click a candidate to inspect its evidence <ArrowUpRight size={13} /></span>
    </div>
    {!result ? <div className="results-placeholder">Your candidate symptoms will appear here, organized by inference depth.</div>
      : !result.candidates.length ? <div className="no-inference"><h3>No additional associations exceeded the selected inference threshold.</h3><p>Try different observed symptoms or adjust the score threshold. This is not a clinical conclusion.</p></div>
        : <div className="depth-results">{Array.from({ length: result.options.maxDepth }, (_, index) => index + 1).map(depth => {
          const candidates = result.candidates.filter(candidate => candidate.depth === depth);
          return <div className={'depth-column ' + (depth > visibleDepth ? 'depth-hidden' : '')} key={depth}>
            <div className="depth-column-heading"><span className={'layer-marker marker-' + Math.min(depth, 3)} /><h3>Depth {depth}</h3><span>{candidates.length} {candidates.length === 1 ? 'candidate' : 'candidates'}</span></div>
            {candidates.length ? candidates.map(candidate => <button key={candidate.symptom} className={'result-row ' + (selected === candidate.symptom ? 'selected' : '')} onClick={() => onSelect(candidate.symptom)}>
              <span>{displaySymptom(candidate.symptom)}</span><strong>{percent(candidate.inferenceScore)}</strong><ChevronRight size={13} />
            </button>) : <p className="depth-empty">No candidates at this depth.</p>}
          </div>;
        })}</div>}
  </section>;
}
