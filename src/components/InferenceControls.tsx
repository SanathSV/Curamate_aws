import { RotateCcw } from 'lucide-react';
import { DEFAULT_OPTIONS } from '../types/inference';
import type { InferenceOptions } from '../types/inference';
import { percent } from '../utils/format';
interface Props { options: InferenceOptions; onChange: (options: InferenceOptions) => void; disabled: boolean }
export function InferenceControls({ options, onChange, disabled }: Props) {
  return <section className="control-section" aria-labelledby="inference-controls-title">
    <div className="section-heading"><h2 id="inference-controls-title">Inference settings</h2><button className="icon-button" title="Restore defaults" aria-label="Restore default settings" disabled={disabled} onClick={() => onChange({ ...DEFAULT_OPTIONS })}><RotateCcw size={15} /></button></div>
    <div className="range-label"><label htmlFor="inference-threshold">Minimum score</label><output htmlFor="inference-threshold">{percent(options.minScore)}</output></div>
    <input id="inference-threshold" className="score-slider" type="range" min="0" max="100" step="1" value={Math.round(options.minScore * 100)} disabled={disabled} style={{ '--range-progress': percent(options.minScore) } as React.CSSProperties} onChange={event => onChange({ ...options, minScore: Number(event.target.value) / 100 })} aria-describedby="score-help" />
    <p id="score-help" className="field-hint">Only candidates at or above this score propagate.</p>
    <div className="number-control"><label htmlFor="max-depth">Maximum depth</label><select id="max-depth" value={options.maxDepth} disabled={disabled} onChange={event => onChange({ ...options, maxDepth: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    <div className="number-control"><label htmlFor="top-k">Candidates per depth</label><select id="top-k" value={options.topK} disabled={disabled} onChange={event => onChange({ ...options, topK: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></div>
  </section>;
}
