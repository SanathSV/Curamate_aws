import { useMemo } from 'react';
import type { DiagnosisRequest, DiagnosisResponse } from '../../types/diagnosis';
import { overallDiagnosticCandidates } from '../../inference/diagnosisRequest';
import { displaySymptom } from '../../inference/canonicalize';

const percentage = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) + '%';
export function DiagnosisResults({ response, request }: { response: DiagnosisResponse; request: DiagnosisRequest }) {
  const overall = useMemo(() => overallDiagnosticCandidates(response), [response]);
  const returned = new Map(response.results.map(result => [result.combination_index, result]));
  return <div className="diagnosis-results">
    <p className="diagnosis-review">Decision-support output · Requires clinician review</p>
    <section className="diagnosis-overall" aria-labelledby="overall-diagnoses-title">
      <h3 id="overall-diagnoses-title">Overall Best Candidates</h3>
      <p className="field-hint">Each candidate appears once, using its highest API-provided probability across the combinations.</p>
      {!overall.length ? <p className="diagnosis-empty">No diagnostic candidates were returned.</p> : <ol className="diagnosis-list">{overall.map(item => <li key={item.diagnosis.toLowerCase()}>
        <div><strong>{item.diagnosis}</strong><b>{percentage(item.percentage)}</b></div>
        <small>Based on symptom combination {item.source_combination_index + 1}: {item.source_symptoms.map(displaySymptom).join(', ')}</small>
      </li>)}</ol>}
    </section>
    {request.symptom_combinations.map((symptoms, index) => {
      const result = returned.get(index);
      return <section className="diagnosis-combination" key={index} aria-labelledby={'diagnosis-combination-' + index}>
        <h3 id={'diagnosis-combination-' + index}>Combination {index + 1}{index === 0 && <span>Original symptoms</span>}</h3>
        <p className="diagnosis-symptoms">Symptoms: {symptoms.map(displaySymptom).join(', ')}</p>
        <h4>Model-ranked diagnostic candidates</h4>
        {!result ? <p className="diagnosis-empty">The service did not return a result for this combination.</p> : !result.diagnoses.length ? <p className="diagnosis-empty">No diagnostic candidates were returned for this combination.</p> : <ol className="diagnosis-list">{result.diagnoses.map(item => <li key={item.rank} value={item.rank}><div><strong>{item.diagnosis}</strong><b>{percentage(item.percentage)}</b></div></li>)}</ol>}
      </section>;
    })}
  </div>;
}
