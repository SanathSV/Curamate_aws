import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDiagnosisRequest } from '../inference/diagnosisRequest';
import { parseDiagnosisResponse } from './diagnosisApi';

const request = buildDiagnosisRequest(['A', 'B', 'C'], 'female', ['HIV'], 3, [['A', 'B', 'C', 'D']]);
const response = () => ({ results: [{ combination_index: 0, symptoms: ['A', 'B', 'C'], diagnoses: [{ rank: 1, diagnosis: 'diagnosis_x', probability: .52, percentage: 52 }] }], metadata: { diagnosis_top_k: 3, combinations_received: 2, combinations_scored: 1 } });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('diagnosis response validation', () => {
  it('accepts direct or gateway-wrapped responses and partial combination results', () => {
    expect(parseDiagnosisResponse(response(), request)).toEqual(response());
    expect(parseDiagnosisResponse({ body: JSON.stringify(response()) }, request)).toEqual(response());
    expect(parseDiagnosisResponse({ results: [] }, request).results).toEqual([]);
  });
  it('rejects invalid or duplicate indices and mismatched symptom combinations', () => {
    const invalid = response(); invalid.results[0].combination_index = 2;
    expect(() => parseDiagnosisResponse(invalid, request)).toThrow('index');
    const duplicate = response(); duplicate.results.push(duplicate.results[0]);
    expect(() => parseDiagnosisResponse(duplicate, request)).toThrow('duplicate combination');
    const mismatch = response(); mismatch.results[0].symptoms = ['other'];
    expect(() => parseDiagnosisResponse(mismatch, request)).toThrow('does not match');
  });
  it('rejects malformed diagnostic values', () => {
    for (const probability of [-.1, 1.1, NaN]) {
      const invalid = response(); invalid.results[0].diagnoses[0].probability = probability;
      expect(() => parseDiagnosisResponse(invalid, request)).toThrow('probability');
    }
    const invalid = response(); invalid.results[0].diagnoses[0].percentage = 101;
    expect(() => parseDiagnosisResponse(invalid, request)).toThrow('percentage');
    expect(() => parseDiagnosisResponse({ results: {} }, request)).toThrow('array');
  });
});

describe('frontend diagnosis API submission', () => {
  async function setup(handler: typeof fetch) {
    vi.stubEnv('VITE_DIAGNOSIS_API_URL', 'https://diagnosis.example.test/diagnosis');
    const mock = vi.fn(handler); vi.stubGlobal('fetch', mock);
    return { api: await import('./diagnosisApi'), mock };
  }
  it('makes a single POST with exactly the required named fields and no local inference scores', async () => {
    const { api, mock } = await setup(async () => new Response(JSON.stringify(response())));
    expect(mock).not.toHaveBeenCalled();
    expect(await api.fetchDiagnoses(request)).toEqual(response());
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe('https://diagnosis.example.test/diagnosis');
    expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'omit' });
    expect(JSON.parse(options!.body as string)).toEqual(request);
  });
  it('does not send anything until an endpoint is configured', async () => {
    vi.stubEnv('VITE_DIAGNOSIS_API_URL', ''); const mock = vi.fn(); vi.stubGlobal('fetch', mock);
    const api = await import('./diagnosisApi');
    await expect(api.fetchDiagnoses(request)).rejects.toThrow('not been configured');
    expect(mock).not.toHaveBeenCalled();
  });
  it('reports HTTP, invalid JSON, and network failures without automatic retries', async () => {
    const { api, mock } = await setup(async () => new Response('', { status: 503 }));
    await expect(api.fetchDiagnoses(request)).rejects.toThrow('503');
    mock.mockResolvedValueOnce(new Response('not JSON'));
    await expect(api.fetchDiagnoses(request)).rejects.toThrow('valid JSON');
    mock.mockRejectedValueOnce(new TypeError('Network error'));
    await expect(api.fetchDiagnoses(request)).rejects.toThrow('Unable to reach');
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it('passes cancellation through to the request', async () => {
    const controller = new AbortController(); controller.abort();
    const { api, mock } = await setup(async (_url, options) => { options?.signal?.throwIfAborted(); return new Response('{}'); });
    await expect(api.fetchDiagnoses(request, controller.signal)).rejects.toThrow();
    expect(mock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
