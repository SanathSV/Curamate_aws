import { describe, expect, it, vi } from 'vitest';
import { InMemoryRuleSource } from '../api/rulesApi';
import { contextDataset, dataset, rule } from '../test/fixtures';
import { DEFAULT_OPTIONS as UI_DEFAULT_OPTIONS } from '../types/inference';
import { infer } from './engine';
const DEFAULT_OPTIONS = { ...UI_DEFAULT_OPTIONS, associationMode: 'combined' as const };

describe('fixed patient context', () => {
  it.each(['gender:male', 'history:asthma'])('looks up a symptom conditioned on %s only when selected', async context => {
    const source = new InMemoryRuleSource(contextDataset([[['cough', context], [rule('wheeze', .9)]]]));
    expect((await infer(source, ['cough'], DEFAULT_OPTIONS)).candidates).toEqual([]);
    const result = await infer(source, ['cough'], DEFAULT_OPTIONS, undefined, [context]);
    expect(result.observed).toEqual(['cough']);
    expect(result.contexts).toEqual([context]);
    expect(result.candidates.map(candidate => candidate.symptom)).toEqual(['wheeze']);
    expect(result.candidates[0].bestEvidence.parentScore).toBe(1);
  });
  it('looks up the requested symptom and context subsets with canonical sorting', async () => {
    const input = contextDataset([[['cough', 'fever', 'gender:male', 'history:asthma'], [rule('wheeze', .2, { occurrences: 90, antecedent_occurrences: 100 })]]]);
    input.metadata.configuration.max_antecedent_size = 2;
    const source = new InMemoryRuleSource(input);
    const lookup = vi.spyOn(source, 'getRules');
    const result = await infer(source, ['fever', 'cough'], { ...DEFAULT_OPTIONS, maxDepth: 1 }, undefined, ['history:asthma', 'Gender:Male']);
    const keys = lookup.mock.calls.flatMap(([batch]) => batch);
    expect(keys).toEqual(expect.arrayContaining(['cough', 'fever', 'cough|fever', 'cough|gender:male', 'fever|history:asthma', 'cough|fever|gender:male', 'cough|fever|history:asthma', 'cough|fever|gender:male|history:asthma']));
    expect(result.candidates[0].inferenceScore).toBe(.9);
    expect(result.candidates[0].bestEvidence.antecedents).toEqual(['cough', 'fever', 'gender:male', 'history:asthma']);
    expect(keys).not.toContain('gender:male');
    expect(keys).toHaveLength(new Set(keys).size);
  });
  it('keeps contexts at score 1 across recursive propagation and never infers them', async () => {
    const input = contextDataset([
      [['a', 'gender:male'], [rule('b', .9), rule('history:asthma', 1)]],
      [['b', 'history:asthma'], [rule('c', .8), rule('gender:male', 1)]],
    ]);
    const result = await infer(new InMemoryRuleSource(input), ['a'], DEFAULT_OPTIONS, undefined, ['gender:male', 'history:asthma']);
    expect(result.candidates.map(candidate => candidate.symptom)).toEqual(['b', 'c']);
    expect(result.candidates[1].inferenceScore).toBeCloseTo(.72);
    expect(result.candidates[1].bestEvidence.parentScore).toBe(.9);
    expect(result.candidates[1].bestEvidence.lineage).toEqual(['a', 'b', 'c']);
    expect(result.contexts).toEqual(['gender:male', 'history:asthma']);
  });
  it('preserves pairwise behavior even when context is selected', async () => {
    const source = new InMemoryRuleSource(contextDataset([[['a'], [rule('b', .8)]], [['a', 'gender:male'], [rule('c', .99)]]]));
    const lookup = vi.spyOn(source, 'getRules');
    const result = await infer(source, ['a'], UI_DEFAULT_OPTIONS, undefined, ['gender:male']);
    expect(result.candidates.map(candidate => candidate.symptom)).toEqual(['b']);
    expect(lookup.mock.calls.flatMap(([keys]) => keys).every(key => !key.includes('gender:'))).toBe(true);
  });
  it('bounds context subsets independently of symptom size', async () => {
    const input = contextDataset([[['a', 'gender:male'], [rule('b', .8)]], [['a', 'gender:male', 'history:asthma'], [rule('c', .99)]]]);
    input.metadata.configuration.max_context_features = 1;
    const result = await infer(new InMemoryRuleSource(input), ['a'], DEFAULT_OPTIONS, undefined, ['gender:male', 'history:asthma']);
    expect(result.candidates.map(candidate => candidate.symptom)).toEqual(['b']);
  });
  it('rejects context masquerading as symptoms, unknown context, and conflicting gender selections', async () => {
    const input = contextDataset([[['a', 'gender:male', 'gender:female'], [rule('b', .8)]]]);
    const source = new InMemoryRuleSource(input);
    await expect(infer(source, ['gender:male'], DEFAULT_OPTIONS)).rejects.toThrow('symptoms');
    await expect(infer(source, ['a'], DEFAULT_OPTIONS, undefined, ['history:unknown'])).rejects.toThrow('context catalog');
    await expect(infer(source, ['a'], DEFAULT_OPTIONS, undefined, ['gender:male', 'gender:female'])).rejects.toThrow('one gender');
    expect((await infer(source, [], DEFAULT_OPTIONS, undefined, ['gender:male'])).candidates).toEqual([]);
  });
});

describe('latent symptom inference', () => {
  it('discovers B from the joint A|C antecedent', async () => {
    const source = new InMemoryRuleSource(dataset([[['a', 'c'], [rule('b', .9)]]]));
    const result = await infer(source, ['A', ' C '], DEFAULT_OPTIONS);
    expect(result.candidates[0]).toMatchObject({ symptom: 'b', depth: 1, inferenceScore: .9 });
    expect(result.candidates[0].bestEvidence.antecedents).toEqual(['a', 'c']);
    expect((await infer(source, ['a'], DEFAULT_OPTIONS)).candidates).toEqual([]);
  });
  it('propagates B at depth 1 and D at depth 2 with .9 × .8 = .72', async () => {
    const source = new InMemoryRuleSource(dataset([[['a', 'c'], [rule('b', .9)]], [['b', 'f'], [rule('d', .8)]]]));
    const result = await infer(source, ['a', 'c', 'f'], DEFAULT_OPTIONS);
    expect(result.candidates.map(candidate => [candidate.symptom, candidate.depth])).toEqual([['b', 1], ['d', 2]]);
    expect(result.candidates[1].inferenceScore).toBeCloseTo(.72);
    expect(result.candidates[1].bestEvidence.rule.confidence).toBe(.8);
  });
  it('uses the minimum parent score for a multi-parent rule', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9), rule('c', .8)]], [['b', 'c'], [rule('d', .95)]]]));
    const result = await infer(source, ['a'], DEFAULT_OPTIONS);
    expect(result.candidates.find(candidate => candidate.symptom === 'd')?.inferenceScore).toBeCloseTo(.76);
  });
  it('terminates cycles and never re-infers an observation', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]], [['b'], [rule('a', .95)]]]));
    const result = await infer(source, ['a'], { ...DEFAULT_OPTIONS, maxDepth: 6 });
    expect(result.candidates.map(candidate => candidate.symptom)).toEqual(['b']);
    expect(result.depthsExplored).toBe(2);
  });
  it('preserves all evidence, including a weaker path, without multiplying it', async () => {
    const source = new InMemoryRuleSource(dataset([[['a', 'c'], [rule('x', .82)]], [['a', 'f'], [rule('x', .76)]], [['f'], [rule('x', .6)]]]));
    const result = await infer(source, ['a', 'c', 'f'], DEFAULT_OPTIONS);
    expect(result.candidates[0].inferenceScore).toBe(.82);
    expect(result.candidates[0].evidence).toHaveLength(3);
  });
  it('does not propagate candidates below threshold', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .69)]], [['b'], [rule('c', 1)]]]));
    const lookup = vi.spyOn(source, 'getRules');
    expect((await infer(source, ['a'], DEFAULT_OPTIONS)).candidates).toEqual([]);
    expect(lookup.mock.calls.flatMap(([keys]) => keys)).not.toContain('b');
  });
  it('accepts the inclusive threshold boundary', async () => {
    const result = await infer(new InMemoryRuleSource(dataset([[['a'], [rule('b', .7)]]])), ['a'], DEFAULT_OPTIONS);
    expect(result.candidates).toHaveLength(1);
  });
  it('respects maximum depth', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]], [['b'], [rule('c', .9)]]]));
    expect((await infer(source, ['a'], { ...DEFAULT_OPTIONS, maxDepth: 1 })).candidates.map(item => item.symptom)).toEqual(['b']);
  });
  it('limits new candidates and does not recycle the pruned backlog as a new depth', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9), rule('c', .85), rule('d', .8)]]]));
    const result = await infer(source, ['a'], { ...DEFAULT_OPTIONS, topK: 1 });
    expect(result.candidates.map(item => item.symptom)).toEqual(['b']);
  });
  it('breaks score ties by lift, support, then occurrences', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [
      rule('b', .9, { lift: 2, support: .1, occurrences: 90 }),
      rule('c', .9, { lift: 3, support: .1, occurrences: 100 }),
      rule('d', .9, { lift: 3, support: .2, occurrences: 100 }),
      rule('e', .9, { lift: 3, support: .2, occurrences: 200 }),
    ]]]));
    const result = await infer(source, ['a'], { ...DEFAULT_OPTIONS, maxDepth: 1 });
    expect(result.candidates.map(item => item.symptom)).toEqual(['e', 'd', 'c', 'b']);
  });
  it('updates stronger paths and re-scores affected descendants without re-fetching keys', async () => {
    const source = new InMemoryRuleSource(dataset([
      [['a'], [rule('b', .72), rule('c', .95)]],
      [['c'], [rule('b', .95)]],
      [['b', 'f'], [rule('d', .9)]],
    ]));
    const lookup = vi.spyOn(source, 'getRules');
    const result = await infer(source, ['a', 'f'], DEFAULT_OPTIONS);
    expect(result.candidates.find(item => item.symptom === 'b')?.inferenceScore).toBeCloseTo(.9025);
    expect(result.candidates.find(item => item.symptom === 'b')?.evidence).toHaveLength(2);
    expect(result.candidates.find(item => item.symptom === 'd')?.inferenceScore).toBeCloseTo(.81225);
    const queried = lookup.mock.calls.flatMap(([keys]) => keys);
    expect(queried.length).toBe(new Set(queried).size);
  });
  it('rejects out-of-catalog observations and invalid controls', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]]]));
    await expect(infer(source, ['unknown'], DEFAULT_OPTIONS)).rejects.toThrow('catalog');
    await expect(infer(source, ['a'], { ...DEFAULT_OPTIONS, minScore: NaN })).rejects.toThrow('settings');
  });
  it('handles no observations and cancellation', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]]]));
    expect((await infer(source, [], DEFAULT_OPTIONS)).candidates).toEqual([]);
    const controller = new AbortController(); controller.abort();
    await expect(infer(source, ['a'], DEFAULT_OPTIONS, controller.signal)).rejects.toThrow();
  });
});

describe('pairwise conditional associations', () => {
  it('computes P(B | A) from counts and does not condition on additional selected symptoms', async () => {
    const source = new InMemoryRuleSource(dataset([
      [['a'], [rule('b', .7, { occurrences: 72, antecedent_occurrences: 100 })]],
      [['a', 'c'], [rule('x', .99)]],
    ]));
    const lookup = vi.spyOn(source, 'getRules');
    const result = await infer(source, ['a', 'c'], UI_DEFAULT_OPTIONS);
    expect(result.candidates.map(candidate => candidate.symptom)).toEqual(['b']);
    expect(result.candidates[0].inferenceScore).toBe(.72);
    expect(lookup.mock.calls.flatMap(([keys]) => keys).every(key => !key.includes('|'))).toBe(true);
  });
  it('propagates pairwise evidence as a score, not a new conditional probability', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]], [['b'], [rule('d', .8)]]]));
    const result = await infer(source, ['a'], UI_DEFAULT_OPTIONS);
    expect(result.candidates.map(item => [item.symptom, item.depth])).toEqual([['b', 1], ['d', 2]]);
    expect(result.candidates[1].inferenceScore).toBeCloseTo(.72);
    expect(result.candidates[1].bestEvidence.rule.confidence).toBe(.8);
  });
  it('never infers a zero-occurrence pair even at a zero threshold', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', 0)]]]));
    expect((await infer(source, ['a'], { ...UI_DEFAULT_OPTIONS, minScore: 0 })).candidates).toEqual([]);
  });
  it('rejects contradictory pair counts rather than presenting a probability over 100%', async () => {
    const source = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9, { occurrences: 11, antecedent_occurrences: 10 })]]]));
    await expect(infer(source, ['a'], UI_DEFAULT_OPTIONS)).rejects.toThrow('occurrence counts');
  });
});
