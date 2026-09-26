import { describe, expect, it } from 'vitest';
import type { RulesOutput } from '../types/rules';
import { rule } from '../test/fixtures';
import { compareSymptoms } from './compareSymptoms';

function data(): RulesOutput {
  return {
    metadata: { transactions: 100, unique_symptoms: 4, antecedent_keys: 3, rules_saved: 5, configuration: { max_antecedent_size: 2 } },
    symptom_frequency: { a: { count: 40, probability: .4 }, b: { count: 30, probability: .3 }, x: { count: 20, probability: .2 }, y: { count: 10, probability: .1 } },
    rules: {
      a: [rule('x', .99, { occurrences: 12, antecedent_occurrences: 40 })],
      b: [rule('x', .9, { occurrences: 15, antecedent_occurrences: 30 })],
      'a|b': [rule('x', .1, { occurrences: 8, antecedent_occurrences: 10 }), rule('y', .9, { occurrences: 0, antecedent_occurrences: 10 })],
    },
  };
}

describe('joint symptom comparisons', () => {
  it('requires all starting symptoms by default and uses exact joint counts', () => {
    const result = compareSymptoms(data(), [' B ', 'A', 'a'], ['x']);
    expect(result.columns).toEqual([{ key: 'a|b', symptoms: ['a', 'b'] }]);
    expect(result.rows[0].cells[0]).toMatchObject({ status: 'available', probability: .8, occurrences: 8, antecedentOccurrences: 10 });
    expect(result.rows[0].baseline).toBe(.2);
    expect(result.rows[0].cells[0].difference).toBeCloseTo(.6);
  });
  it('uses pairwise counts when only one starting symptom is selected', () => {
    expect(compareSymptoms(data(), ['a'], ['x']).rows[0].cells[0].probability).toBe(.3);
  });
  it('does not approximate a missing joint rule from individual rules', () => {
    const dataset = data(); delete dataset.rules['a|b'];
    expect(compareSymptoms(dataset, ['a', 'b'], ['x']).rows[0].cells[0]).toMatchObject({ status: 'missing', probability: null });
  });
  it('distinguishes a measured zero probability from absent data', () => {
    const result = compareSymptoms(data(), ['a', 'b']);
    expect(result.rows.find(row => row.symptom === 'y')?.cells[0]).toMatchObject({ status: 'available', probability: 0, occurrences: 0, antecedentOccurrences: 10 });
    expect(compareSymptoms(data(), ['a'], ['y']).rows[0].cells[0].status).toBe('missing');
  });
  it('includes all other targets by default and normalizes explicitly selected targets', () => {
    expect(compareSymptoms(data(), ['a', 'b']).rows.map(row => row.symptom)).toEqual(['x', 'y']);
    expect(compareSymptoms(data(), ['a'], ['X', ' x ', 'a']).rows.map(row => row.symptom)).toEqual(['x']);
    expect(compareSymptoms(data(), []).columns).toEqual([]);
  });
  it('returns undefined conditional probabilities for zero denominator', () => {
    const dataset = data(); dataset.symptom_frequency.a.count = 0; dataset.rules.a = [];
    expect(compareSymptoms(dataset, ['a'], ['x']).rows[0].cells[0]).toMatchObject({ status: 'no-records', probability: null });
    dataset.rules['a|b'] = [rule('x', 0, { occurrences: 0, antecedent_occurrences: 0 })];
    expect(compareSymptoms(dataset, ['a', 'b'], ['x']).rows[0].cells[0].status).toBe('no-records');
  });
  it('marks contradictory duplicate rule counts as unavailable instead of choosing the larger probability', () => {
    const dataset = data(); dataset.rules['a|b'].push(rule('x', .9, { occurrences: 9, antecedent_occurrences: 10 }));
    expect(compareSymptoms(dataset, ['a', 'b'], ['x']).rows[0].cells[0]).toMatchObject({ status: 'inconsistent', probability: null });
  });
  it('rejects mismatched denominators and impossible joint or target counts', () => {
    for (const counts of [{ occurrences: 11, antecedent_occurrences: 10 }, { occurrences: -1, antecedent_occurrences: 10 }, { occurrences: 2, antecedent_occurrences: 35 }]) {
      const dataset = data(); dataset.rules['a|b'] = [rule('x', .9, counts)];
      expect(compareSymptoms(dataset, ['a', 'b'], ['x']).rows[0].cells[0].status).toBe('inconsistent');
    }
    const dataset = data(); dataset.rules.a[0].antecedent_occurrences = 50;
    expect(compareSymptoms(dataset, ['a'], ['x']).rows[0].cells[0].status).toBe('inconsistent');
    dataset.rules['a|b'][1].antecedent_occurrences = 11;
    expect(compareSymptoms(dataset, ['a', 'b'], ['x']).rows[0].cells[0].status).toBe('inconsistent');
  });
  it('handles an empty dataset total and rejects unknown catalog names', () => {
    const dataset = data(); dataset.metadata.transactions = 0;
    expect(compareSymptoms(dataset, ['a'], ['x']).rows[0]).toMatchObject({ baseline: null, cells: [{ status: 'inconsistent', probability: null }] });
    expect(() => compareSymptoms(data(), ['missing'])).toThrow('catalog');
    expect(() => compareSymptoms(data(), ['a'], ['missing'])).toThrow('catalog');
  });
});
