import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiagnosisRequest, DiagnosisResponse } from '../types/diagnosis';
import { fetchDiagnoses } from '../api/diagnosisApi';

export function useDiagnosis(request: DiagnosisRequest | null) {
  const key = request ? JSON.stringify(request) : '';
  const latestKey = useRef(key); latestKey.current = key;
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ key: string; response: DiagnosisResponse } | null>(null);
  useEffect(() => {
    active.current?.abort(); generation.current++;
    setRunning(false); setError(null); setSaved(null);
    return () => { active.current?.abort(); generation.current++; };
  }, [key]);
  const submit = useCallback(async () => {
    if (!request || active.current && !active.current.signal.aborted) return;
    const controller = new AbortController(); active.current = controller;
    const id = ++generation.current;
    setRunning(true); setError(null); setSaved(null);
    try {
      const response = await fetchDiagnoses(request, controller.signal);
      if (!controller.signal.aborted && id === generation.current && latestKey.current === key) setSaved({ key, response });
    } catch (reason) {
      if (!controller.signal.aborted && id === generation.current && latestKey.current === key) setError(reason instanceof Error ? reason.message : 'Unable to load diagnostic candidates.');
    } finally {
      if (id === generation.current) { setRunning(false); active.current = null; }
    }
  }, [key, request]);
  const cancel = useCallback(() => { active.current?.abort(); active.current = null; generation.current++; setRunning(false); }, []);
  return { response: saved?.key === key ? saved.response : null, running, error, submit, cancel };
}
