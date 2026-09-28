import { useState } from 'react';
import { GitBranch, Stethoscope } from 'lucide-react';
import './research-flow.css';

const stages = [
  { title: 'Patient records', subtitle: 'Synthetic clinical dataset', detail: 'Structured synthetic records provide the symptoms, context, and diagnosis labels used to build the research models.', tag: 'DATA', x: 55, y: 70 },
  { title: 'Feature extraction', subtitle: 'Shared canonical vocabulary', detail: 'Convert records into consistent symptom and context features. The same vocabulary connects training data and clinical entry.', tag: 'FEATURES', x: 370, y: 70 },
  { title: 'Apriori rules', subtitle: 'Frequent symptom associations', detail: 'Mine frequent symptom combinations and association rules. These relationships suggest latent symptoms; they do not confirm patient findings.', tag: 'ASSOCIATIONS', x: 685, y: 70 },
  { title: 'Bayesian tables', subtitle: 'NumPy probability matrices', detail: 'Build probability tables from the extracted features to support model-based diagnostic candidate ranking.', tag: 'PROBABILITY', x: 1000, y: 70 },
  { title: 'JEV symptom mapping', subtitle: 'Natural language → symptom', detail: 'Map one description to a known symptom, e.g. “My nose keeps dripping” → runny nose. This stage does not diagnose. Manual canonical selection is also supported.', tag: 'UNDERSTAND', x: 30, y: 340 },
  { title: 'Latent expansion', subtitle: 'Observed + inferred symptoms', detail: 'Apply Apriori associations to explore expanded symptom sets. Keep observed symptoms separate from inferred, unconfirmed additions.', tag: 'EXPAND', x: 285, y: 340 },
  { title: 'Bayesian Top-K', subtitle: 'Rank diagnostic candidates', detail: 'Use symptom evidence to produce a probabilistically ranked shortlist, such as common cold, influenza, or allergic rhinitis. Examples are illustrative.', tag: 'RANK', x: 540, y: 340 },
  { title: 'JEV re-ranking', subtitle: 'Select within Top-K only', detail: 'The research design combines the original query, observed and latent symptoms, and Bayesian candidates. JEV re-ranks only within the supplied Top-K options.', tag: 'REFINE', x: 795, y: 340 },
  { title: 'Diagnostic candidate', subtitle: 'Requires clinician review', detail: 'Combine language understanding, association discovery, and probabilistic ranking into an inspectable decision-support candidate. This does not replace clinical judgment.', tag: 'REVIEW', x: 1050, y: 340 },
];

export function ResearchFlow() {
  const [active, setActive] = useState(4);
  return <article className="research-flow">
    <header className="research-flow-heading"><div><span className="research-eyebrow"><GitBranch size={14} /> CURAMATE / RESEARCH ARCHITECTURE</span><h2>Follow the evidence</h2><p>One connected pipeline. From synthetic records to clinical decision support.</p></div><span className="research-flow-badge">9 stages · 3 complementary methods</span></header>
    <div className="research-canvas">
      <svg className="research-graph" viewBox="0 0 1310 535" aria-label="CuraMate research pipeline: offline model preparation and online symptom reasoning">
        <defs>
          <marker id="research-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>
          <pattern id="research-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="var(--border)" opacity=".5" /></pattern>
        </defs>
        <rect width="1310" height="535" fill="url(#research-dots)" />
        <rect className="research-lane" x="12" y="12" width="1286" height="196" rx="15" />
        <rect className="research-lane" x="12" y="278" width="1286" height="238" rx="15" />
        <text className="research-lane-label" x="32" y="40">01 / BUILD THE KNOWLEDGE FOUNDATION</text>
        <text className="research-lane-caption" x="1274" y="40" textAnchor="end">Offline preparation</text>
        <text className="research-lane-label" x="32" y="307">02 / REASON FROM THE SYMPTOM</text>
        <text className="research-lane-caption" x="1274" y="307" textAnchor="end">Clinical entry → candidate ranking</text>
        <g className="research-edges" fill="none" markerEnd="url(#research-arrow)">
          <path d="M275 125 H360" /><path d="M590 110 H675" />
          <path d="M480 166 V190 H1110 V177" />
          <path d="M250 390 H275" /><path d="M505 390 H530" /><path d="M760 390 H785" /><path d="M1015 390 H1040" />
        </g>
        <g className="research-artifact-edges" fill="none" markerEnd="url(#research-arrow)">
          <path d="M795 166 V232 H395 V330" />
          <path d="M1110 166 V259 H650 V330" />
        </g>
        <g className="research-edge-label"><rect x="493" y="218" width="155" height="26" rx="6" /><text x="570" y="235" textAnchor="middle">Association rule library</text><rect x="797" y="245" width="165" height="26" rx="6" /><text x="880" y="262" textAnchor="middle">Probability tables</text></g>
        {stages.map((stage, index) => <g key={stage.title} className={'research-node' + (active === index ? ' is-active' : '')} transform={`translate(${stage.x} ${stage.y})`} role="button" tabIndex={0} aria-label={`${index + 1}. ${stage.title}`} aria-pressed={active === index} onClick={() => setActive(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(index); } }}>
          <title>{stage.detail}</title><rect width="220" height="96" rx="12" />
          <text className="research-node-tag" x="15" y="24">{stage.tag}</text><text className="research-node-number" x="203" y="24" textAnchor="end">{String(index + 1).padStart(2, '0')}</text>
          <text className="research-node-title" x="15" y="51">{stage.title}</text><text className="research-node-subtitle" x="15" y="74">{stage.subtitle}</text>
        </g>)}
        <text className="research-graph-note" x="32" y="479">Entry: one natural-language symptom or a manually selected canonical symptom.</text>
        <text className="research-graph-note" x="32" y="499">JEV understands · Apriori discovers associations · Bayesian inference ranks · JEV refines the shortlist</text>
      </svg>
    </div>
    <section className="research-inspector" aria-label="Selected pipeline stage"><div><span className="research-eyebrow">STAGE {String(active + 1).padStart(2, '0')} / SELECT A NODE TO EXPLORE</span><h3>{stages[active].title}</h3></div><p aria-live="polite" aria-atomic="true">{stages[active].detail}</p></section>
    <footer className="research-flow-footer"><span>Research architecture showcase · Illustrative examples · No live model execution</span><span><Stethoscope size={14} /> Requires clinician review</span></footer>
  </article>;
}
