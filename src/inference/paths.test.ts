import { describe, expect, it, vi } from 'vitest';
import { InMemoryRuleSource } from '../api/rulesApi';
import { dataset, rule } from '../test/fixtures';
import { findSymptomPaths } from './paths';

const options = { minScore: .7, maxDepth: 3 };
const source = () => new InMemoryRuleSource(dataset([
  [['a'], [rule('b', .9), rule('c', .8)]],
  [['b'], [rule('d', .9)]],
  [['c'], [rule('d', .9)]],
  [['d'], [rule('e', 1)]],
]));

describe('all single-symptom paths', () => {
  it('retains distinct routes and propagates the weaker qualifying route independently', async () => {
    const data = source();
    const lookup = vi.spyOn(data, 'getRules');
    const result = await findSymptomPaths(data, ['a'], options);
    expect(result.paths.map(path => path.symptoms.join('>')).sort()).toEqual([
      'a>b', 'a>b>d', 'a>b>d>e', 'a>c', 'a>c>d', 'a>c>d>e',
    ]);
    expect(result.paths.find(path => path.symptoms.join('>') === 'a>c>d>e')?.score).toBeCloseTo(.72);
    expect(lookup.mock.calls.filter(([keys]) => keys.includes('d'))).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });
  it('filters each full path at the inclusive threshold, not just each edge', async () => {
    const data = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]], [['b'], [rule('c', .8)]]]));
    expect((await findSymptomPaths(data, ['a'], { ...options, minScore: .72 })).paths).toHaveLength(2);
    expect((await findSymptomPaths(data, ['a'], { ...options, minScore: .73 })).paths.map(path => path.symptoms)).toEqual([['a', 'b']]);
  });
  it('uses counts, includes every direct branch, and ignores joint antecedents', async () => {
    const branches = Array.from({ length: 20 }, (_, index) => rule('b' + index, .1, { occurrences: 8, antecedent_occurrences: 10 }));
    const data = new InMemoryRuleSource(dataset([[['a'], branches], [['a', 'c'], [rule('joint', 1)]]]));
    const result = await findSymptomPaths(data, ['A', ' a ', 'c'], { ...options, maxDepth: 1 });
    expect(result.paths).toHaveLength(20);
    expect(result.paths.every(path => path.score === .8 && path.depth === 1)).toBe(true);
    expect(result.paths[0].steps[0]).toMatchObject({ confidence: .8, occurrences: 8, antecedentOccurrences: 10 });
  });
  it('starts from each observation and excludes repeated symptoms within each path', async () => {
    const data = new InMemoryRuleSource(dataset([[['a'], [rule('a', 1), rule('b', 1)]], [['b'], [rule('a', 1)]]]));
    const result = await findSymptomPaths(data, ['b', 'a', 'a'], { ...options, maxDepth: 6 });
    expect(result.paths.map(path => path.symptoms)).toEqual([['a', 'b'], ['b', 'a']]);
  });
  it('enumerates every ordered combination in a complete small network', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const data = new InMemoryRuleSource(dataset(names.map(name => [[name], names.map(next => rule(next, 1))])));
    const result = await findSymptomPaths(data, ['a', 'b'], options);
    // Two roots, then 4, 4*3, and 4*3*2 possible cycle-free branches.
    expect(result.paths).toHaveLength(2 * (4 + 12 + 24));
    expect(new Set(result.paths.map(path => JSON.stringify(path.symptoms))).size).toBe(80);
    expect(result.truncated).toBe(false);
  });
  it('returns no paths for empty observations, dead ends, or zero occurrences', async () => {
    const data = new InMemoryRuleSource(dataset([[['a'], [rule('b', 0)]]]));
    expect((await findSymptomPaths(data, [], options)).paths).toEqual([]);
    expect((await findSymptomPaths(data, ['b'], options)).paths).toEqual([]);
    expect((await findSymptomPaths(data, ['a'], { ...options, minScore: 0 })).paths).toEqual([]);
  });
  it('deduplicates identical symptom sequences, retaining the strongest duplicate rule', async () => {
    const data = new InMemoryRuleSource(dataset([[['a'], [rule('b', .7), rule('b', .9), rule('b', .9)]]]));
    const result = await findSymptomPaths(data, ['a'], options);
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].score).toBe(.9);
  });
  it('marks actual result and work cutoffs as partial', async () => {
    expect(await findSymptomPaths(source(), ['a'], { ...options, maxPaths: 2 })).toMatchObject({ truncated: true, limitReason: 'paths', paths: [{}, {}] });
    expect(await findSymptomPaths(source(), ['a'], { ...options, maxEvaluations: 1 })).toMatchObject({ truncated: true, limitReason: 'evaluations', evaluatedEdges: 1 });
  });
  it('does not mark an exactly complete limit as partial', async () => {
    const data = new InMemoryRuleSource(dataset([[['a'], [rule('b', 1)]]]));
    expect(await findSymptomPaths(data, ['a'], { ...options, maxPaths: 1, maxEvaluations: 1 })).toMatchObject({ truncated: false, limitReason: null });
  });
  it('rejects unknown symptoms, invalid settings and inconsistent counts', async () => {
    await expect(findSymptomPaths(source(), ['unknown'], options)).rejects.toThrow('catalog');
    for (const invalid of [{ minScore: NaN }, { minScore: 1.1 }, { maxDepth: 0 }, { maxDepth: 7 }, { maxPaths: 0 }, { maxEvaluations: Infinity }]) {
      await expect(findSymptomPaths(source(), ['a'], { ...options, ...invalid })).rejects.toThrow('settings');
    }
    const data = new InMemoryRuleSource(dataset([[['a'], [rule('b', .9, { occurrences: 2, antecedent_occurrences: 1 })]]]));
    await expect(findSymptomPaths(data, ['a'], options)).rejects.toThrow('inconsistent');
  });
  it('honors cancellation before starting and while traversing', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(findSymptomPaths(source(), ['a'], options, controller.signal)).rejects.toThrow();
    const running = new AbortController();
    const names = Array.from({ length: 10 }, (_, index) => 's' + index);
    const dense = new InMemoryRuleSource(dataset(names.map(name => [[name], names.map(next => rule(next, 1))])));
    const pending = findSymptomPaths(dense, ['s0'], { minScore: 0, maxDepth: 6 }, running.signal);
    setTimeout(() => running.abort(), 0);
    await expect(pending).rejects.toThrow();
  });
});
