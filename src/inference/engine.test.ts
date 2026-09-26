import { describe, expect, it, vi } from 'vitest';
import { InMemoryRuleSource } from '../api/rulesApi';
import { dataset, rule } from '../test/fixtures';
import { DEFAULT_OPTIONS } from '../types/inference';
import { infer } from './engine';

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
