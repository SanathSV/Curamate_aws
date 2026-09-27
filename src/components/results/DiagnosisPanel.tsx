import { useMemo, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { ContextFrequency } from '../../types/rules';
import type { buildRagCombinations } from '../../inference/ragCombinations';
import { buildDiagnosisRequest } from '../../inference/diagnosisRequest';
import { useDiagnosis } from '../../hooks/useDiagnosis';
import { DIAGNOSIS_API_URL } from '../../api/diagnosisApi';
import { DiagnosisResults } from './DiagnosisResults';

interface Props {
  observed: string[];
  contexts: string[];
  contextFrequency?: Record<string, ContextFrequency>;
  combinations: ReturnType<typeof buildRagCombinations> | null;
}
export function DiagnosisPanel({ observed, contexts, contextFrequency, combinations }: Props) {
  const [diagnosisK, setDiagnosisK] = useState('3');
  const k = Number(diagnosisK);
  const validK = Number.isSafeInteger(k) && k > 0;
  const prepared = useMemo(() => {
    if (!combinations || !validK) return { request: null, error: null };
    const value = (token: string) => contextFrequency?.[token]?.value ?? token.slice(token.indexOf(':') + 1);
    const gender = contexts.find(token => token.startsWith('gender:'));
    try {
      return { request: buildDiagnosisRequest(observed, gender ? value(gender) : null, contexts.filter(token => token.startsWith('history:')).map(value), k, combinations.combinations.map(row => row.symptoms)), error: null };
    } catch (reason) { return { request: null, error: reason instanceof Error ? reason.message : 'Unable to prepare the diagnosis request.' }; }
  }, [observed, contexts, contextFrequency, combinations, validK, k]);
  const diagnosis = useDiagnosis(prepared.request);
  function downloadRequest() {
    if (!prepared.request) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(prepared.request, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'curamate-diagnosis-request.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="diagnosis-panel" aria-labelledby="diagnosis-title">
    <h3 id="diagnosis-title">Model-ranked diagnostic candidates</h3>
    <p className="field-hint">Request diagnostic candidates for the original symptoms and each suggested combination. This limit controls diagnoses per combination, independently of the number of latent additions above.</p>
    <div className="diagnosis-controls"><label htmlFor="diagnosis-top-k">Diagnoses per combination<input id="diagnosis-top-k" type="number" min="1" step="1" value={diagnosisK} onChange={event => setDiagnosisK(event.target.value)} aria-invalid={!validK} /></label>
      <button className="primary-button" disabled={!prepared.request || !DIAGNOSIS_API_URL || diagnosis.running} onClick={diagnosis.submit}>{diagnosis.running && <LoaderCircle size={15} className="spin" />}{diagnosis.running ? 'Requesting candidates…' : 'Request diagnostic candidates'}</button>
      {diagnosis.running && <button className="text-button" onClick={diagnosis.cancel}>Cancel</button>}
      <button className="secondary-button" disabled={!prepared.request} onClick={downloadRequest}><Download size={14} />Request JSON</button>
    </div>
    {!validK && <p className="rag-notice" role="alert">Enter a positive whole number of diagnoses per combination.</p>}
    {!DIAGNOSIS_API_URL && <p className="rag-notice">The diagnosis service is not connected yet. You can still download the prepared request.</p>}
    {!combinations && <p className="field-hint">Generate symptom combinations above to prepare the request.</p>}
    {prepared.error && <p className="rag-notice" role="alert">{prepared.error}</p>}
    {prepared.request && <p className="field-hint">{prepared.request.symptom_combinations.length} {prepared.request.symptom_combinations.length === 1 ? 'combination' : 'combinations'} to submit, including the original symptoms. Up to {k} diagnostic candidates requested for each.</p>}
    {combinations?.truncated && <p className="rag-notice">Latent exploration was partial. The request contains the original symptoms and the available generated combinations.</p>}
    {diagnosis.running && <p className="field-hint" role="status">Waiting for the diagnosis service…</p>}
    {diagnosis.error && <p className="rag-notice" role="alert">{diagnosis.error}</p>}
    {diagnosis.response && prepared.request && <DiagnosisResults response={diagnosis.response} request={prepared.request} />}
    {!diagnosis.response && <p className="diagnosis-review">Decision-support output · Requires clinician review</p>}
  </section>;
}
