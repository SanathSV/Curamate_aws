import { describe, expect, it } from 'vitest';
import { contextDataset, dataset, rule } from '../../test/fixtures';
import { InMemoryRuleSource } from '../../api/rulesApi';
import { infer } from '../../inference/engine';
import { DEFAULT_OPTIONS } from '../../types/inference';
import { buildGraph } from './buildGraph';
describe('hypergraph construction', () => {
  it.each([['a'], ['a', 'c']])('shows context-conditioned evidence without context symptom circles for %s', async (...observations: string[]) => {
    const input = contextDataset([[[...observations, 'gender:male', 'history:asthma'], [rule('b', .9)]]]);
    const result = await infer(new InMemoryRuleSource(input), observations, { ...DEFAULT_OPTIONS, associationMode: 'combined' }, undefined, ['gender:male', 'history:asthma']);
    const elements = buildGraph(result.observed, result.candidates, 3, 0);
    const nodes = elements.filter(element => element.data.kind === 'symptom');
    expect(nodes.map(node => node.data.symptom).sort()).toEqual([...observations, 'b'].sort());
    expect(elements.some(element => String(element.data.label).includes('Gender: Male'))).toBe(true);
    const ids = new Set(elements.filter(element => !element.data.source).map(element => element.data.id));
    elements.filter(element => element.data.source).forEach(edge => {
      expect(ids.has(edge.data.source)).toBe(true);
      expect(ids.has(edge.data.target)).toBe(true);
    });
  });
  it('joins all antecedents at one rule diamond instead of independent symptom edges', async () => {
    const result = await infer(new InMemoryRuleSource(dataset([[['a', 'c'], [rule('b', .9)]]])), ['a', 'c'], { ...DEFAULT_OPTIONS, associationMode: 'combined' });
    const elements = buildGraph(result.observed, result.candidates, 3, 0);
    const rules = elements.filter(element => element.data.kind === 'rule');
    expect(rules).toHaveLength(1);
    const incoming = elements.filter(element => element.data.target === rules[0].data.id);
    expect(incoming.map(element => element.data.source).sort()).toEqual(['symptom:a', 'symptom:c']);
    expect(elements.find(element => element.data.source === rules[0].data.id)?.data.target).toBe('symptom:b');
    expect(elements.some(element => element.data.source === 'symptom:a' && element.data.target === 'symptom:b')).toBe(false);
  });
  it('filters depths and scores without adding the global rule network', async () => {
    const result = await infer(new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]], [['b'], [rule('c', .8)]], [['x'], [rule('y', .99)]]])), ['a'], DEFAULT_OPTIONS);
    expect(buildGraph(result.observed, result.candidates, 0, 0)).toHaveLength(1);
    const filtered = buildGraph(result.observed, result.candidates, 3, .85);
    expect(filtered.filter(element => element.data.kind === 'symptom').map(element => element.data.symptom)).toEqual(['a', 'b']);
    expect(filtered.some(element => element.data.symptom === 'x')).toBe(false);
  });
  it('renders pairwise rules as labeled node-to-node links without unnecessary diamonds', async () => {
    const result = await infer(new InMemoryRuleSource(dataset([[['a'], [rule('b', .9)]]])), ['a'], DEFAULT_OPTIONS);
    const elements = buildGraph(result.observed, result.candidates, 3, 0);
    expect(elements.filter(element => element.data.kind === 'rule')).toHaveLength(0);
    const link = elements.find(element => element.data.source === 'symptom:a' && element.data.target === 'symptom:b');
    expect(link?.data.label).toBe('90%');
    expect(link?.data.symptom).toBe('b');
  });
});
