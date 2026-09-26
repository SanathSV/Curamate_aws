import { useEffect, useRef } from 'react';
import { ArrowRight, BookOpen, X } from 'lucide-react';
export function Methodology({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal(); else dialog.current?.close();
  }, [open]);
  return <dialog ref={dialog} className="methodology-dialog" onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }} aria-labelledby="methodology-title">
    <div className="dialog-heading"><BookOpen size={21} /><button className="icon-button" aria-label="Close methodology" onClick={onClose}><X size={19} /></button></div>
    <span className="eyebrow">UNDERSTANDING THE MODEL</span><h2 id="methodology-title">Associations, with a clear trail.</h2>
    <p>In single-symptom mode, CuraMate calculates P(B | A) from the API’s counts: records containing both A and B divided by all records containing A. Other symptoms in those records do not change that calculation.</p>
    <ol className="methodology-steps">
      <li><span>01</span><div><h3>Start with observations</h3><p>Selected symptoms begin at depth 0 with a propagation score of 1.</p></div></li>
      <li><span>02</span><div><h3>Follow association rules</h3><p>Each arrow shows the direct confidence of a single-symptom rule. In combined-symptom mode, a diamond joins all required antecedents.</p></div></li>
      <li><span>03</span><div><h3>Carry the evidence forward</h3><p>Inference score = rule confidence × the lowest antecedent score. A 90% parent and an 80% rule yield a 72% score.</p></div></li>
      <li><span>04</span><div><h3>Keep the strongest path</h3><p>Multiple paths are retained. Their maximum score is used; correlated evidence is never multiplied together.</p></div></li>
    </ol>
    <div className="methodology-notice"><strong>Inference score is not clinical probability.</strong><p>Propagated association scores are a ranking heuristic, not a validated estimate of a patient’s condition. This tool does not diagnose.</p></div>
    <button className="primary-button" onClick={onClose}>Back to exploration<ArrowRight size={16} /></button>
  </dialog>;
}
