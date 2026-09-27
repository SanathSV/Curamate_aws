import { useEffect, useRef, useState } from 'react';
import { useInference } from './useInference';
import { buildRagCombinations } from '../inference/ragCombinations';
import { buildDiagnosisRequest } from '../inference/diagnosisRequest';
import { fetchDiagnoses } from '../api/diagnosisApi';
import type { RulesOutput } from '../types/rules';
import type { InferenceOptions } from '../types/inference';
import type { DiagnosisRequest, DiagnosisResponse } from '../types/diagnosis';

type Snapshot = { observed: string[]; contexts: string[]; latentK: number; diagnosisK: number };
/** One explicit run: local combinations, then one API POST. Never retries automatically. */
export function useAnalytics(data: RulesOutput | null) {
  const inference = useInference(data, true);
  const [phase, setPhase] = useState<'idle' | 'latent' | 'diagnosis' | 'complete' | 'error' | 'cancelled'>('idle');
  const [request, setRequest] = useState<DiagnosisRequest | null>(null);
  const [response, setResponse] = useState<DiagnosisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Snapshot | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    pending.current = null; active.current?.abort(); generation.current++;
    setPhase('idle'); setRequest(null); setResponse(null); setError(null);
    return () => { pending.current = null; active.current?.abort(); generation.current++; };
  }, [data]);
  useEffect(() => {
    if (inference.error && pending.current) {
      pending.current = null; setError(inference.error); setPhase('error');
    }
  }, [inference.error]);
  useEffect(() => {
    const result = inference.result;
    const snapshot = pending.current;
    if (!result || !snapshot || inference.running) return;
    pending.current = null;
    const id = generation.current;
    const controller = new AbortController(); active.current = controller;
    async function submit() {
      try {
        const output = buildRagCombinations(result!, snapshot!.latentK);
        const value = (token: string) => data?.context_frequency?.[token]?.value ?? token.slice(token.indexOf(':') + 1);
        const gender = snapshot!.contexts.find(token => token.startsWith('gender:'));
        const body = buildDiagnosisRequest(snapshot!.observed, gender ? value(gender) : null,
          snapshot!.contexts.filter(token => token.startsWith('history:')).map(value), snapshot!.diagnosisK,
          output.combinations.map(row => row.symptoms));
        setRequest(body); setPhase('diagnosis');
        const response = await fetchDiagnoses(body, controller.signal);
        if (id === generation.current && !controller.signal.aborted) { setResponse(response); setPhase('complete'); }
      } catch (reason) {
        if (id === generation.current && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Unable to complete analysis.'); setPhase('error');
        }
      }
    }
    void submit();
  }, [inference.result, inference.running, data]);
  function reset() {
    pending.current = null; active.current?.abort(); generation.current++;
    inference.clear(); setRequest(null); setResponse(null); setError(null); setPhase('idle');
  }
  function start(observed: string[], contexts: string[], options: InferenceOptions, latentK: number, diagnosisK: number) {
    if (!inference.ready || !observed.length) return;
    reset();
    pending.current = { observed: [...observed], contexts: [...contexts], latentK, diagnosisK };
    setPhase('latent'); inference.run(observed, options, contexts);
  }
  function cancel() { reset(); setPhase('cancelled'); }
  return { start, cancel, reset, ready: inference.ready, phase, request, response,
    error: error ?? inference.error, running: phase === 'latent' || phase === 'diagnosis', truncated: inference.result?.truncated };
}
