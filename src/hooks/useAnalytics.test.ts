// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalytics } from './useAnalytics';
import { fetchDiagnoses } from '../api/diagnosisApi';
import { contextDataset, rule } from '../test/fixtures';
import { InMemoryRuleSource } from '../api/rulesApi';
import { infer } from '../inference/engine';
import { DEFAULT_OPTIONS } from '../types/inference';
import type { WorkerRequest, WorkerResponse } from '../inference/protocol';
import type { DiagnosisResponse } from '../types/diagnosis';
vi.mock('../api/diagnosisApi', () => ({ fetchDiagnoses: vi.fn() }));
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
  postMessage = vi.fn<(message: WorkerRequest) => void>();
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  emit(data: WorkerResponse) { this.onmessage?.({ data }); }
}
const data = contextDataset([[['a'], [rule('b', .9), rule('c', .8)]], [['a', 'gender:male', 'history:asthma'], [rule('b', .9)]]]);
const response: DiagnosisResponse = { results: [] };
async function setup() {
  const hook = renderHook(() => useAnalytics(data), { wrapper: ({ children }) => createElement(StrictMode, null, children) });
  const worker = TestWorker.instances.at(-1)!;
  act(() => worker.emit({ type: 'ready' }));
  async function complete(empty = false) {
    const message = worker.postMessage.mock.calls.map(([message]) => message).filter(message => message.type === 'infer').at(-1)!;
    if (message.type !== 'infer') throw Error('No inference request');
    const result = await infer(new InMemoryRuleSource(data), message.observations, message.options, undefined, message.contexts, true);
    if (empty) result.candidates = [];
    act(() => worker.emit({ type: 'result', id: message.id, result }));
  }
  return { ...hook, worker, complete };
}
beforeEach(() => { TestWorker.instances = []; vi.stubGlobal('Worker', TestWorker); vi.mocked(fetchDiagnoses).mockReset().mockResolvedValue(response); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('one-click analytics', () => {
  it('sends exactly one diagnosis request after local inference, with independent limits and original symptoms', async () => {
    const { result, complete, rerender } = await setup();
    expect(fetchDiagnoses).not.toHaveBeenCalled();
    act(() => result.current.start(['a'], ['gender:male', 'history:asthma'], DEFAULT_OPTIONS, 1, 4));
    expect(result.current.phase).toBe('latent');
    expect(fetchDiagnoses).not.toHaveBeenCalled();
    await complete();
    await waitFor(() => expect(result.current.phase).toBe('complete'));
    expect(fetchDiagnoses).toHaveBeenCalledExactlyOnceWith({ current_symptoms: ['a'], gender: 'male', history: ['asthma'], diagnosis_top_k: 4, symptom_combinations: [['a'], ['a', 'b']] }, expect.any(AbortSignal));
    rerender();
    expect(fetchDiagnoses).toHaveBeenCalledTimes(1);
  });
  it('submits only the original combination when there are no latent candidates', async () => {
    const { result, complete } = await setup();
    act(() => result.current.start(['a'], [], DEFAULT_OPTIONS, 10, 3));
    await complete(true);
    await waitFor(() => expect(result.current.phase).toBe('complete'));
    expect(result.current.request?.symptom_combinations).toEqual([['a']]);
  });
  it('cancels local inference without making a diagnosis request', async () => {
    const { result, complete } = await setup();
    act(() => result.current.start(['a'], [], DEFAULT_OPTIONS, 10, 3));
    act(() => result.current.cancel());
    await complete();
    expect(fetchDiagnoses).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('cancelled');
  });
  it('aborts an in-flight POST and ignores its late response', async () => {
    let resolve!: (response: DiagnosisResponse) => void;
    vi.mocked(fetchDiagnoses).mockReturnValue(new Promise(done => { resolve = done; }));
    const { result, complete } = await setup();
    act(() => result.current.start(['a'], [], DEFAULT_OPTIONS, 10, 3));
    await complete();
    expect(result.current.phase).toBe('diagnosis');
    const signal = vi.mocked(fetchDiagnoses).mock.calls[0][1]!;
    act(() => result.current.cancel());
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(response));
    expect(result.current.response).toBeNull();
    expect(result.current.phase).toBe('cancelled');
  });
  it('reports service failures without retrying and allows a fresh explicit run', async () => {
    vi.mocked(fetchDiagnoses).mockRejectedValueOnce(new Error('Service unavailable'));
    const { result, complete } = await setup();
    act(() => result.current.start(['a'], [], DEFAULT_OPTIONS, 10, 3));
    await complete();
    await waitFor(() => expect(result.current.error).toBe('Service unavailable'));
    expect(fetchDiagnoses).toHaveBeenCalledTimes(1);
    act(() => result.current.start(['a'], [], DEFAULT_OPTIONS, 1, 2));
    expect(result.current.error).toBeNull();
    await complete();
    await waitFor(() => expect(result.current.phase).toBe('complete'));
    expect(fetchDiagnoses).toHaveBeenCalledTimes(2);
  });
});
