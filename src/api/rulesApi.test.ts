import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextDataset, dataset, rule } from '../test/fixtures';
import { parseRulesOutput } from './rulesApi';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
describe('dataset validation', () => {
  it('normalizes and deduplicates male/female symptom lists without removing overlap', () => {
    const input = dataset([[['a'], [rule('b', .8), rule('c', .7)]]]);
    input.male_symptoms = [' A ', 'b', 'B']; input.female_symptoms = ['a', 'C'];
    const parsed = parseRulesOutput(input);
    expect(parsed.male_symptoms).toEqual(['a', 'b']);
    expect(parsed.female_symptoms).toEqual(['a', 'c']);
    expect(Object.keys(parsed.symptom_frequency)).toHaveLength(3);
  });
  it('allows absent or explicitly empty gender symptom lists', () => {
    const input = dataset([[['a'], [rule('b', .8)]]]);
    expect(parseRulesOutput(input).male_symptoms).toBeUndefined();
    expect(parseRulesOutput({ ...input, male_symptoms: [], female_symptoms: [] }).male_symptoms).toEqual([]);
  });
  it.each([null, {}, 'a', [12], ['gender:male']].map(value => ({ value })))('rejects malformed gender symptom lists: $value', ({ value }) => {
    const input = dataset([[['a'], [rule('b', .8)]]]);
    expect(() => parseRulesOutput({ ...input, male_symptoms: value })).toThrow('male_symptoms');
    expect(() => parseRulesOutput({ ...input, female_symptoms: value })).toThrow('female_symptoms');
  });
  it('accepts broader gender lists and preserves the supplied context entry structure', () => {
    const input = contextDataset([[['fatigue', 'gender:male', 'history:asthma'], [rule('cough', .9)]]]);
    input.male_symptoms = ['fatigue', 'cough', 'weak muscles'];
    input.female_symptoms = ['fatigue', 'cough', 'nose running'];
    input.metadata.unique_context_features = 2;
    input.context_frequency = {
      'gender:male': { type: 'gender', value: 'male', count: 315, probability: .315 },
      'history:asthma': { type: 'history', value: 'asthma', count: 87, probability: .087 },
    };
    const parsed = parseRulesOutput(input);
    expect(parsed.male_symptoms).toContain('weak muscles');
    expect(parsed.female_symptoms).toContain('nose running');
    expect(Object.keys(parsed.symptom_frequency).sort()).toEqual(['cough', 'fatigue']);
    expect(parsed.metadata.unique_context_features).toBe(2);
    expect(parsed.context_frequency).toEqual(input.context_frequency);
  });
  it('rejects context type/value metadata that disagrees with its token', () => {
    const input = contextDataset([[['a', 'gender:male'], [rule('b', .8)]]]);
    input.context_frequency!['gender:male'] = { type: 'history', value: 'male', count: 1, probability: .001 };
    expect(() => parseRulesOutput(input)).toThrow('context type');
    input.context_frequency!['gender:male'] = { type: 'gender', value: 'female', count: 1, probability: .001 };
    expect(() => parseRulesOutput(input)).toThrow('context value');
  });
  it('preserves legacy symptom-only datasets without context metadata', () => {
    const parsed = parseRulesOutput(dataset([[['a'], [rule('b', .8)]]]));
    expect(parsed.context_frequency).toBeUndefined();
    expect(parsed.metadata.configuration.max_context_features).toBeUndefined();
    expect(parsed.rules.a[0].then).toBe('b');
  });
  it('accepts mixed antecedents with independent symptom and context size limits', () => {
    const input = contextDataset([[['cough', 'fever', 'gender:male', 'history:asthma'], [rule('wheeze', .9)]]]);
    input.metadata.configuration.max_antecedent_size = 2;
    input.rules[' Fever | gender:MALE | Cough | HISTORY:ASTHMA '] = input.rules['cough|fever|gender:male|history:asthma'];
    delete input.rules['cough|fever|gender:male|history:asthma'];
    const parsed = parseRulesOutput(input);
    expect(parsed.rules['cough|fever|gender:male|history:asthma'][0].then).toBe('wheeze');
    expect(parsed.context_frequency?.['gender:male'].count).toBe(500);
    expect(Object.keys(parsed.symptom_frequency)).toEqual(['cough', 'fever', 'wheeze']);
    expect(parsed.metadata.configuration.max_context_features).toBe(2);
  });
  it.each(['gender:female', 'history:unknown'])('rejects unknown context antecedents: %s', token => {
    const input = contextDataset([[['a', 'gender:male', 'history:asthma'], [rule('b', .8)]]]);
    input.rules = { ['a|' + token]: [rule('b', .8)] };
    expect(() => parseRulesOutput(input)).toThrow('unknown context token');
  });
  it('rejects unknown ordinary antecedents and context consequents', () => {
    const input = contextDataset([[['a', 'gender:male'], [rule('b', .8)]]]);
    input.rules = { 'unknown|gender:male': [rule('b', .8)] };
    expect(() => parseRulesOutput(input)).toThrow('symptom catalog');
    input.rules = { a: [rule('gender:male', .8)] };
    expect(() => parseRulesOutput(input)).toThrow('symptom catalog');
  });
  it('rejects context in the symptom catalog and malformed context catalogs', () => {
    expect(() => parseRulesOutput(dataset([[['a', 'gender:male'], [rule('b', .8)]]]))).toThrow('context tokens');
    for (const token of ['age:20', 'gender:', 'history: ']) {
      const input = dataset([[['a'], [rule('b', .8)]]]);
      input.context_frequency = { [token]: { count: 5, probability: .005 } };
      expect(() => parseRulesOutput(input)).toThrow('context token');
    }
    const input = dataset([[['a'], [rule('b', .8)]]]);
    expect(() => parseRulesOutput({ ...input, context_frequency: [] })).toThrow('context_frequency');
    expect(() => parseRulesOutput({ ...input, context_frequency: { 'gender:male': { count: 1, probability: 2 } } })).toThrow('context probability');
  });
  it('enforces max_context_features separately and rejects invalid metadata', () => {
    const input = contextDataset([[['a', 'gender:male', 'history:asthma'], [rule('b', .8)]]]);
    input.metadata.configuration.max_context_features = 1;
    expect(() => parseRulesOutput(input)).toThrow('max_context_features');
    input.metadata.configuration.max_context_features = -1;
    expect(() => parseRulesOutput(input)).toThrow('max_context_features');
    input.metadata.configuration.max_context_features = 2;
    input.metadata.configuration.max_antecedent_size = 1;
    expect(parseRulesOutput(input).rules['a|gender:male|history:asthma']).toHaveLength(1);
    input.rules = { 'a|b|gender:male': [rule('b', .8)] };
    expect(() => parseRulesOutput(input)).toThrow('maximum antecedent size');
  });
  it('allows absent context limits and rejects duplicated context catalog tokens', () => {
    const input = contextDataset([[['a', 'gender:male'], [rule('b', .8)]]]);
    delete input.metadata.configuration.max_context_features;
    expect(parseRulesOutput(input).rules['a|gender:male']).toHaveLength(1);
    input.context_frequency![' Gender:MALE '] = { count: 500, probability: .5 };
    expect(() => parseRulesOutput(input)).toThrow('duplicate normalized context');
  });
  it.each([undefined, null, '', '  '])('accepts absent or empty top_k_per_antecedent metadata: %s', topK => {
    const input = dataset([[['a'], [rule('b', .8)]]]);
    const withOptionalMetadata = { ...input, metadata: { ...input.metadata, configuration: { ...input.metadata.configuration, top_k_per_antecedent: topK } } };
    expect(parseRulesOutput(withOptionalMetadata).metadata.configuration.top_k_per_antecedent).toBeUndefined();
  });
  it('accepts numeric strings in optional metadata and wrapped API responses', () => {
    const input = dataset([[['a'], [rule('b', .8)]]]);
    const payload = { ...input, metadata: { ...input.metadata, configuration: { ...input.metadata.configuration, top_k_per_antecedent: '20' } } };
    expect(parseRulesOutput({ statusCode: 200, body: JSON.stringify(payload) }).metadata.configuration.top_k_per_antecedent).toBe(20);
  });
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
  it('explicitly reloads a successful dataset and shares simultaneous reloads', async () => {
    let resolveReload: (value: Response) => void = () => {};
    const initial = dataset([[['a'], [rule('b', .9)]]]);
    const updated = dataset([[['a'], [rule('c', .8)]]]);
    let calls = 0;
    const { api, fetch } = await setup(() => ++calls === 1
      ? Promise.resolve(new Response(JSON.stringify(initial)))
      : new Promise<Response>(resolve => { resolveReload = resolve; }));
    const first = await api.fetchRules();
    const reload = api.reloadRules();
    expect(api.reloadRules()).toBe(reload);
    expect(api.fetchRules()).toBe(reload);
    resolveReload(new Response(JSON.stringify(updated)));
    const fresh = await reload;
    expect(fresh).not.toBe(first);
    expect(fresh.rules.a[0].then).toBe('c');
    expect(await api.fetchRules()).toBe(fresh);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
