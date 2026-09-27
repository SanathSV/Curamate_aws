/// <reference lib="webworker" />
import { InMemoryRuleSource } from '../api/rulesApi';
import { infer } from './engine';
import { findSymptomPaths } from './paths';
import { filterDatasetByGender, selectedGender } from './genderFilter';
import type { RulesOutput } from '../types/rules';
import type { WorkerRequest, WorkerResponse } from './protocol';
const worker = self as unknown as DedicatedWorkerGlobalScope;
let dataset: RulesOutput | undefined;
let active: AbortController | undefined;
const send = (message: WorkerResponse) => worker.postMessage(message);
worker.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'cancel') { active?.abort(); return; }
  if (data.type === 'initialize') { dataset = data.data; send({ type: 'ready' }); return; }
  active?.abort();
  const controller = new AbortController();
  active = controller;
  try {
    if (!dataset) throw new Error('The dataset is still loading.');
    const source = new InMemoryRuleSource(filterDatasetByGender(dataset, selectedGender(data.contexts)));
    const started = performance.now();
    const result = await infer(source, data.observations, data.options, controller.signal, data.contexts, data.collectAllCandidates);
    if (!data.collectAllCandidates) result.paths = await findSymptomPaths(source, data.observations, data.options, controller.signal);
    result.durationMs = performance.now() - started;
    if (!controller.signal.aborted) send({ type: 'result', id: data.id, result });
  } catch (error) {
    if (!controller.signal.aborted) send({ type: 'error', id: data.id, message: error instanceof Error ? error.message : 'Unable to complete inference.' });
  }
};
