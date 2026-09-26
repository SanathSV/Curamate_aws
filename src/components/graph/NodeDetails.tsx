import { ArrowDown, ArrowUpRight, CircleHelp, GitBranch, MousePointer2, ScanLine, X } from 'lucide-react';
import type { Candidate } from '../../types/inference';
import type { SymptomFrequency } from '../../types/rules';
import { displaySymptom } from '../../inference/canonicalize';
import { formatNumber, percent } from '../../utils/format';

interface Props {
  candidate?: Candidate;
  observed?: string;
  frequency?: SymptomFrequency;
  onSelect: (symptom: string) => void;
  onClose: () => void;
}
function Metric({ label, value, help }: { label: string; value: string; help: string }) {
  return <div className="metric"><dt><span>{label}</span><span className="tooltip-anchor" tabIndex={0} aria-label={label + ': ' + help}><CircleHelp size={12} /><span className="tooltip" role="tooltip">{help}</span></span></dt><dd>{value}</dd></div>;
}
export function NodeDetails({ candidate, observed, frequency, onSelect, onClose }: Props) {
  return <aside className="details-panel panel" aria-labelledby="details-title">
    <div className="panel-heading"><h2 id="details-title"><ScanLine size={17} />Evidence</h2><button className="icon-button" aria-label="Close evidence details" onClick={onClose}><X size={16} /></button></div>
    {!candidate && !observed ? <div className="details-empty"><div className="empty-detail-icon"><MousePointer2 size={24} strokeWidth={1.5} /></div>
      <h3>Follow the evidence</h3><p>Select a symptom in the network to see how it was reached.</p><div className="empty-detail-note"><GitBranch size={15} />Every inference, explained.</div>
    </div> : observed ? <div className="detail-content">
      <span className="eyebrow">OBSERVED SYMPTOM</span><h3 className="candidate-title">{displaySymptom(observed)}</h3>
      <span className="depth-badge depth-0">Depth 0 · Observed</span>
      <div className="observed-description">Selected as a starting observation. Its inference score is set to 100% for propagation; this is not an estimated probability.</div>
      {frequency && <dl className="metrics-grid"><Metric label="Dataset occurrences" value={formatNumber(frequency.count)} help="Number of transactions in the dataset that contain this symptom." /></dl>}
    </div> : candidate ? <div className="detail-content">
      <span className="eyebrow">CANDIDATE LATENT SYMPTOM</span>
      <h3 className="candidate-title">{displaySymptom(candidate.symptom)}</h3>
      <span className={'depth-badge depth-' + Math.min(candidate.depth, 3)}>Depth {candidate.depth}<span>·</span>{candidate.bestEvidence.depth === 1 ? 'Direct association' : 'Propagated association'}</span>
      <div className="candidate-score"><div><span>Best inference score</span><strong>{percent(candidate.inferenceScore)}<ArrowUpRight size={20} /></strong></div>
        <div className="score-track"><span style={{ width: percent(candidate.inferenceScore) }} /></div>
        <p>Association-derived inference score</p>
      </div>
      <div className="evidence-section-title"><h4>Strongest evidence</h4><GitBranch size={14} /></div>
      <div className="evidence-path">
        <div className="antecedents">{candidate.bestEvidence.antecedents.map((symptom, index) => <span key={symptom}>
          {index > 0 && <b className="join-sign">+</b>}<button onClick={() => onSelect(symptom)}>{displaySymptom(symptom)}</button>
        </span>)}</div>
        <div className="evidence-arrow"><ArrowDown size={16} /><span>{percent(candidate.bestEvidence.rule.confidence)} confidence</span></div>
        <strong>{displaySymptom(candidate.symptom)}</strong>
      </div>
      <dl className="metrics-grid">
        <Metric label="Direct confidence" value={percent(candidate.bestEvidence.rule.confidence)} help="For this individual rule, the fraction of antecedent transactions also containing the consequent. It is not a propagated probability." />
        <Metric label="Support" value={percent(candidate.bestEvidence.rule.support, 1)} help="Fraction of all dataset transactions containing the antecedents and consequent together." />
        <Metric label="Lift" value={candidate.bestEvidence.rule.lift.toFixed(2) + '×'} help="Rule confidence divided by the consequent's dataset frequency. Values above 1 indicate positive association." />
        <Metric label="Occurrences" value={formatNumber(candidate.bestEvidence.rule.occurrences)} help="Number of dataset transactions containing both the antecedents and the consequent." />
      </dl>
      {candidate.bestEvidence.depth > 1 && <div className="score-formula"><span>How the score is calculated</span><strong>{percent(candidate.bestEvidence.rule.confidence)} × {percent(candidate.bestEvidence.parentScore, 1)} = {percent(candidate.inferenceScore, 1)}</strong><p>Rule confidence × lowest parent score</p></div>}
      <div className="additional-paths"><div className="evidence-section-title"><h4>Additional evidence</h4><span className="count-badge">{candidate.evidence.length - 1}</span></div>
        {candidate.evidence.length === 1 ? <p className="muted small">No additional paths in this exploration.</p> : candidate.evidence.slice(1).map(path => <details key={path.id} className="additional-path">
          <summary><span>{path.antecedents.map(displaySymptom).join(' + ')}<small>→ {displaySymptom(path.consequent)}</small></span><strong>{percent(path.inferenceScore)}</strong></summary>
          <p>Direct confidence {percent(path.rule.confidence)} · Support {percent(path.rule.support, 1)} · Lift {path.rule.lift.toFixed(2)}× · {formatNumber(path.rule.occurrences)} occurrences</p>
        </details>)}
      </div>
      <p className="evidence-note">The strongest path determines the score. Evidence paths are not assumed to be independent.</p>
    </div> : null}
  </aside>;
}
