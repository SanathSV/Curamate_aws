import { describe, expect, it } from 'vitest';
import { contextDataset, rule } from '../test/fixtures';
import { createSymptomTrie } from '../trie/symptomTrie';
import { InMemoryRuleSource } from '../api/rulesApi';
import { DEFAULT_OPTIONS } from '../types/inference';
import { infer } from './engine';
import { findSymptomPaths } from './paths';
import { compareSymptoms } from './compareSymptoms';
import { filterDatasetByGender, selectedGender } from './genderFilter';

function fixture() {
  const data = contextDataset([
    [['shared'], [rule('male only', .9), rule('female only', .95)]],
    [['male only'], [rule('both', .8)]],
    [['female only'], [rule('both', 1)]],
    [['shared', 'gender:male'], [rule('male only', .95), rule('female only', .99)]],
    [['shared', 'gender:female'], [rule('female only', .95)]],
    [['shared', 'female only'], [rule('both', 1)]],
  ]);
  data.male_symptoms = ['shared', 'male only', 'both'];
  data.female_symptoms = ['shared', 'female only', 'both'];
  return data;
}

describe('API gender symptom lists', () => {
  it('intersects broader backend lists with the catalog without inventing symptom counts', () => {
    const data = fixture();
    data.male_symptoms!.push('weak muscles');
    data.female_symptoms!.push('nose running');
    expect(Object.keys(filterDatasetByGender(data, 'male').symptom_frequency).sort()).toEqual(['both', 'male only', 'shared']);
    expect(createSymptomTrie(filterDatasetByGender(data, 'male').symptom_frequency).search('weak')).toEqual([]);
    expect(Object.keys(filterDatasetByGender(data, 'female').symptom_frequency).sort()).toEqual(['both', 'female only', 'shared']);
  });
  it('shows every symptom with no gender and restores the untouched original dataset', () => {
    const data = fixture();
    expect(filterDatasetByGender(data)).toBe(data);
    filterDatasetByGender(data, 'male');
    expect(Object.keys(filterDatasetByGender(data).symptom_frequency).sort()).toEqual(['both', 'female only', 'male only', 'shared']);
  });
  it.each(['male', 'female'] as const)('uses exactly the %s list, including shared symptoms', gender => {
    const data = fixture();
    const filtered = filterDatasetByGender(data, gender);
    expect(Object.keys(filtered.symptom_frequency).sort()).toEqual([...data[gender === 'male' ? 'male_symptoms' : 'female_symptoms']!].sort());
    expect(createSymptomTrie(filtered.symptom_frequency).search('', 100)).toEqual(expect.arrayContaining(['shared', 'both', gender + ' only']));
    expect(createSymptomTrie(filtered.symptom_frequency).search(gender === 'male' ? 'female' : 'male')).toEqual([]);
    expect(filtered.metadata).toBe(data.metadata);
    expect(filtered.context_frequency).toBe(data.context_frequency);
    expect(filtered.rules.shared[0].antecedent_occurrences).toBe(data.rules.shared[0].antecedent_occurrences);
    expect(filterDatasetByGender(data, gender)).toBe(filtered);
  });
  it('removes excluded antecedents and consequents while retaining context tokens', () => {
    const filtered = filterDatasetByGender(fixture(), 'male');
    expect(filtered.rules['female only']).toBeUndefined();
    expect(filtered.rules['female only|shared']).toBeUndefined();
    expect(filtered.rules['gender:male|shared'].map(rule => rule.then)).toEqual(['male only']);
  });
  it('distinguishes an empty list from an absent list and never substitutes the opposite list', () => {
    const data = fixture(); data.male_symptoms = [];
    expect(Object.keys(filterDatasetByGender(data, 'male').symptom_frequency)).toEqual([]);
    expect(Object.keys(filterDatasetByGender(data, 'male').rules)).toEqual([]);
    delete data.male_symptoms;
    expect(filterDatasetByGender(data, 'male')).toBe(data);
  });
  it('filters inference, all path intermediates, and comparisons without changing path mathematics', async () => {
    const filtered = filterDatasetByGender(fixture(), 'male');
    const source = new InMemoryRuleSource(filtered);
    const inferred = await infer(source, ['shared'], DEFAULT_OPTIONS, undefined, ['gender:male']);
    expect(inferred.candidates.map(candidate => candidate.symptom)).toEqual(['male only', 'both']);
    expect(inferred.candidates[1].inferenceScore).toBeCloseTo(.72);
    const paths = await findSymptomPaths(source, ['shared'], DEFAULT_OPTIONS);
    expect(paths.paths.map(path => path.symptoms)).toEqual([['shared', 'male only'], ['shared', 'male only', 'both']]);
    expect(compareSymptoms(filtered, ['shared']).rows.map(row => row.symptom).sort()).toEqual(['both', 'male only']);
    await expect(infer(source, ['female only'], DEFAULT_OPTIONS)).rejects.toThrow('catalog');
  });
  it('normalizes recognized gender selections, with none or other values showing all symptoms', () => {
    expect(selectedGender([' Gender:MALE ', 'history:asthma'])).toBe('male');
    expect(selectedGender(['gender:female'])).toBe('female');
    expect(selectedGender(['history:asthma'])).toBeUndefined();
    expect(selectedGender(['gender:other'])).toBeUndefined();
  });
});
