/// <reference lib="webworker" />
import { InMemoryRuleSource } from '../api/rulesApi';
import { infer } from './engine';
import { findSymptomPaths } from './paths';
import type { WorkerRequest, WorkerResponse } from './protocol';
const worker = self as unknown as DedicatedWorkerGlobalScope;
let source: InMemoryRuleSource | undefined;
let active: AbortController | undefined;
const send = (message: WorkerResponse) => worker.postMessage(message);
worker.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'cancel') { active?.abort(); return; }
  if (data.type === 'initialize') { source = new InMemoryRuleSource(data.data); send({ type: 'ready' }); return; }
  active?.abort();
  const controller = new AbortController();
  active = controller;
  try {
    if (!source) throw new Error('The dataset is still loading.');
    const started = performance.now();
    const result = await infer(source, data.observed, data.options, controller.signal);
    result.paths = await findSymptomPaths(source, data.observed, data.options, controller.signal);
    result.durationMs = performance.now() - started;
    if (!controller.signal.aborted) send({ type: 'result', id: data.id, result });
  } catch (error) {
    if (!controller.signal.aborted) send({ type: 'error', id: data.id, message: error instanceof Error ? error.message : 'Unable to complete inference.' });
  }
};
