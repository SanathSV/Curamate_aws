import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataset, rule } from '../test/fixtures';
import { parseRulesOutput } from './rulesApi';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
describe('dataset validation', () => {
  it('accepts the reduced metadata shape and canonicalizes API keys', () => {
    const input = dataset([[['fatigue', 'fever'], [rule('cough', .91)]]]);
    input.rules[' Fever | FATIGUE '] = input.rules['fatigue|fever'];
    delete input.rules['fatigue|fever'];
    expect(parseRulesOutput(input).rules['fatigue|fever'][0].confidence).toBe(.91);
  });
  it('rejects malformed objects and non-finite metrics', () => {
    expect(() => parseRulesOutput({})).toThrow('Malformed');
    const input = dataset([[['a'], [rule('b', NaN)]]]);
    expect(() => parseRulesOutput(input)).toThrow('confidence');
  });
  it('rejects missing catalog symptoms and invalid rule arrays', () => {
    const input = dataset([[['a'], [rule('b', .8)]]]);
    delete input.symptom_frequency.b;
    expect(() => parseRulesOutput(input)).toThrow('catalog');
    expect(() => parseRulesOutput({ ...input, rules: { a: null } })).toThrow('array');
  });
});
describe('one API request per page load', () => {
  async function setup(response: () => Promise<Response>) {
    vi.stubEnv('VITE_RULES_API_URL', 'https://rules.example.test/api/rules');
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
    const fetch = vi.fn(response); vi.stubGlobal('fetch', fetch);
    const api = await import('./rulesApi');
    return { api, fetch };
  }
  it('shares in-flight and completed requests including strict-mode-style duplicate callers', async () => {
    const data = dataset([[['a'], [rule('b', .9)]]]);
    const { api, fetch } = await setup(async () => new Response(JSON.stringify(data)));
    const first = api.fetchRules(); const second = api.fetchRules();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    await api.fetchRules(); await api.retryRules();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not automatically refetch a failed request; explicitly retrying recovers', async () => {
    let calls = 0;
    const data = dataset([[['a'], [rule('b', .9)]]]);
    const { api, fetch } = await setup(async () => ++calls === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify(data)));
    await expect(api.fetchRules()).rejects.toThrow('503');
    await expect(api.fetchRules()).rejects.toThrow('503');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await api.retryRules()).metadata.transactions).toBe(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reports malformed JSON without falling back to bundled data', async () => {
    const { api } = await setup(async () => new Response('<html>Error</html>'));
    await expect(api.fetchRules()).rejects.toThrow('valid JSON');
  });
  it('handles missing configuration without a request', async () => {
    vi.stubEnv('VITE_RULES_API_URL', '');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const api = await import('./rulesApi');
    await expect(api.fetchRules()).rejects.toThrow('not been configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});
