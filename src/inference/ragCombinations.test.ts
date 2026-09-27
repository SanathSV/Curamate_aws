import { describe, expect, it } from 'vitest';
import { InMemoryRuleSource } from '../api/rulesApi';
import { contextDataset, rule } from '../test/fixtures';
import { DEFAULT_OPTIONS } from '../types/inference';
import { infer } from './engine';
import { buildRagCombinations } from './ragCombinations';

async function result() {
  const source = new InMemoryRuleSource(contextDataset([
    [['a', 'b', 'c', 'gender:male'], [rule('d', .8), rule('e', .9), rule('f', .75)]],
    [['e'], [rule('g', .9)]],
  ]));
  return infer(source, ['c', 'a', 'b'], { ...DEFAULT_OPTIONS, associationMode: 'combined', topK: 1 }, undefined, ['gender:male'], true);
}

describe('RAG symptom combinations', () => {
  it('keeps all observations, adds one symptom per query, and ranks across depths', async () => {
    const output = buildRagCombinations(await result(), 3);
    expect(output.combinations.map(row => row.symptoms)).toEqual([['a', 'b', 'c', 'e'], ['a', 'b', 'c', 'g'], ['a', 'b', 'c', 'd']]);
    expect(output.combinations.map(row => row.query)).toEqual(['a, b, c, e', 'a, b, c, g', 'a, b, c, d']);
    expect(output.contexts).toEqual(['gender:male']);
    expect(output.availableCombinations).toBe(4);
    expect(output.combinations[0].evidence.antecedents).toContain('gender:male');
  });
  it('uses a separate K without the graph candidate-per-depth limit', async () => {
    const source = new InMemoryRuleSource(contextDataset([[['a'], [rule('b', .9), rule('c', .8), rule('d', .75)]]]));
    const options = { ...DEFAULT_OPTIONS, topK: 1 };
    expect((await infer(source, ['a'], options)).candidates).toHaveLength(1);
    const all = await infer(source, ['a'], options, undefined, [], true);
    expect(buildRagCombinations(all, 2).combinations).toHaveLength(2);
    expect(buildRagCombinations(all, 100).combinations).toHaveLength(3);
  });
  it('deduplicates additions and never treats context or observed symptoms as suggestions', async () => {
    const original = await result();
    const candidate = original.candidates[0];
    original.candidates.push(candidate, { ...candidate, symptom: 'a' }, { ...candidate, symptom: 'history:asthma' });
    expect(buildRagCombinations(original, 100).combinations).toHaveLength(4);
  });
  it('preserves truncation and validates K while allowing no available combinations', async () => {
    const original = await result(); original.truncated = true;
    expect(buildRagCombinations(original, 10).truncated).toBe(true);
    expect(buildRagCombinations({ ...original, candidates: [] }, 10).combinations).toEqual([]);
    for (const k of [0, 101, 1.5, NaN]) expect(() => buildRagCombinations(original, k)).toThrow('top K');
  });
});
