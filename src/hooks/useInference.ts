import { useCallback, useEffect, useRef, useState } from 'react';
import type { RulesOutput } from '../types/rules';
import type { WorkerRequest, WorkerResponse } from '../inference/protocol';
import type { InferenceOptions, InferenceResult } from '../types/inference';
export function useInference(data: RulesOutput | null, collectAllCandidates = false) {
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentId = useRef(0);
  const worker = useRef<Worker | null>(null);
  useEffect(() => {
    currentId.current++;
    setResult(null); setRunning(false); setReady(false);
    if (!data) return;
    setReady(false); setError(null);
    let instance: Worker;
    try { instance = new Worker(new URL('../inference/inference.worker.ts', import.meta.url), { type: 'module' }); }
    catch { setError('Unable to start the inference worker. Use a current browser with Web Workers enabled.'); return; }
    worker.current = instance;
    instance.onmessage = ({ data: message }: MessageEvent<WorkerResponse>) => {
      if (message.type === 'ready') setReady(true);
      if (message.type === 'result' && message.id === currentId.current) {
        setResult(message.result); setRunning(false); setError(null);
      }
      if (message.type === 'error' && (message.id === undefined || message.id === currentId.current)) {
        setError(message.message); setRunning(false);
      }
    };
    instance.onerror = () => { setError('The inference worker stopped. Reload the page to continue.'); setRunning(false); setReady(false); };
    instance.postMessage({ type: 'initialize', data } satisfies WorkerRequest);
    return () => { instance.terminate(); worker.current = null; };
  }, [data]);
  const run = useCallback((observations: string[], options: InferenceOptions, contexts: string[] = []) => {
    if (!worker.current || !ready) return;
    setRunning(true); setError(null);
    worker.current.postMessage({ type: 'infer', id: ++currentId.current, observations, contexts, options, collectAllCandidates } satisfies WorkerRequest);
  }, [ready, collectAllCandidates]);
  const clear = useCallback(() => {
    currentId.current++;
    worker.current?.postMessage({ type: 'cancel' } satisfies WorkerRequest);
    setResult(null); setRunning(false); setError(null);
  }, []);
  return { result, running, ready, error, run, clear };
}
