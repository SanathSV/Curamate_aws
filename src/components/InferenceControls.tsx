import { RotateCcw } from 'lucide-react';
import { DEFAULT_OPTIONS } from '../types/inference';
import type { InferenceOptions } from '../types/inference';
import { percent } from '../utils/format';
interface Props { options: InferenceOptions; onChange: (options: InferenceOptions) => void; disabled: boolean }
export function InferenceControls({ options, onChange, disabled }: Props) {
  return <section className="control-section" aria-labelledby="inference-controls-title">
    <div className="section-heading"><h2 id="inference-controls-title">Inference settings</h2><button className="icon-button" title="Restore defaults" aria-label="Restore default settings" disabled={disabled} onClick={() => onChange({ ...DEFAULT_OPTIONS })}><RotateCcw size={15} /></button></div>
    <div className="rule-mode-control"><label htmlFor="association-mode">Rule type</label><select id="association-mode" value={options.associationMode ?? 'combined'} disabled={disabled} onChange={event => onChange({ ...options, associationMode: event.target.value as 'pairwise' | 'combined' })}><option value="pairwise">Single symptom · P(B | A)</option><option value="combined">Combined symptoms</option></select><p className="field-hint">{options.associationMode === 'pairwise' ? 'Use all records containing A, regardless of other symptoms, to find B.' : 'Require every symptom in a rule’s antecedent together.'}</p></div>
    <div className="range-label"><label htmlFor="inference-threshold">Minimum path score</label><label className="threshold-value"><span className="sr-only">Minimum path score percent</span><input type="number" min="0" max="100" step="0.1" value={Number((options.minScore * 100).toFixed(1))} disabled={disabled} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 0 && value <= 100) onChange({ ...options, minScore: value / 100 }); }} />%</label></div>
    <input id="inference-threshold" className="score-slider" type="range" min="0" max="100" step="0.1" value={Number((options.minScore * 100).toFixed(1))} disabled={disabled} style={{ '--range-progress': percent(options.minScore, 1) } as React.CSSProperties} onChange={event => onChange({ ...options, minScore: Number(event.target.value) / 100 })} aria-describedby="score-help" />
    <p id="score-help" className="field-hint">Each listed path must meet this threshold on its own. Multi-step path score = product of link confidences. Run discovery to apply.</p>
    <div className="number-control"><label htmlFor="max-depth">Maximum depth</label><select id="max-depth" value={options.maxDepth} disabled={disabled} onChange={event => onChange({ ...options, maxDepth: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    <div className="number-control"><label htmlFor="top-k">Graph candidates per depth</label><select id="top-k" value={options.topK} disabled={disabled} onChange={event => onChange({ ...options, topK: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    <p className="field-hint">The path list explores every branch independently of this graph limit.</p>
  </section>;
}
