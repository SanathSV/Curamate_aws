import { afterEach, expect, it, vi } from 'vitest';
import { contextDataset, rule } from '../test/fixtures';
import { DEFAULT_OPTIONS } from '../types/inference';
import type { WorkerRequest, WorkerResponse } from './protocol';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('passes separate observations and context through the worker while retaining symptom-only paths', async () => {
  const port = {
    onmessage: undefined as ((event: { data: WorkerRequest }) => Promise<void>) | undefined,
    postMessage: vi.fn<(message: WorkerResponse) => void>(),
  };
  vi.stubGlobal('self', port);
  await import('./inference.worker');
  const data = contextDataset([
    [['cough'], [rule('fever', .8)]],
    [['cough', 'gender:male', 'history:asthma'], [rule('wheeze', .9)]],
  ]);
  await port.onmessage!({ data: { type: 'initialize', data } });
  await port.onmessage!({ data: { type: 'infer', id: 1, observations: ['cough'], contexts: ['gender:male', 'history:asthma'], options: { ...DEFAULT_OPTIONS, associationMode: 'combined' } } });
  const reply = port.postMessage.mock.calls.map(([message]) => message).find(message => message.type === 'result');
  expect(reply?.type).toBe('result');
  if (reply?.type !== 'result') throw new Error('Missing worker result');
  expect(reply.result.observed).toEqual(['cough']);
  expect(reply.result.contexts).toEqual(['gender:male', 'history:asthma']);
  expect(reply.result.candidates.map(candidate => candidate.symptom).sort()).toEqual(['fever', 'wheeze']);
  expect(reply.result.paths?.paths.map(path => path.symptoms)).toEqual([['cough', 'fever']]);
});
