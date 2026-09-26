import { describe, expect, it } from 'vitest';
import { Trie } from './Trie';
import { createSymptomTrie } from './symptomTrie';
import { contextDataset, rule } from '../test/fixtures';
import { parseRulesOutput } from '../api/rulesApi';
describe('Trie prefix lookup', () => {
  it('indexes only symptoms when patient context is present', () => {
    const data = parseRulesOutput(contextDataset([[['cough', 'gender:male', 'history:asthma'], [rule('wheeze', .9)]]]));
    const index = createSymptomTrie(data.symptom_frequency);
    expect(index.search('', 100)).toEqual(['cough', 'wheeze']);
    expect(index.search('gender')).toEqual([]);
    expect(index.search('history')).toEqual([]);
  });
  function trie() {
    const result = new Trie();
    result.insert(' Fatigue ', 120000);
    result.insert('fat intolerance', 900);
    result.insert('fatigue', 120000);
    result.insert('Fever', 80000);
    result.finalize();
    return result;
  }
  it('finds fatigue and ranks by frequency', () => expect(trie().search('fat')).toEqual(['fatigue', 'fat intolerance']));
  it('normalizes searches', () => expect(trie().search(' FAT ')).toEqual(['fatigue', 'fat intolerance']));
  it('excludes selected symptoms and respects the limit', () => expect(trie().search('', 1, new Set(['fatigue']))).toEqual(['fever']));
  it('handles no matches and zero limits', () => { expect(trie().search('xyz')).toEqual([]); expect(trie().search('', 0)).toEqual([]); });
  it('reuses the same index for a dataset', () => {
    const frequency = { fatigue: { count: 500, probability: .5 } };
    expect(createSymptomTrie(frequency)).toBe(createSymptomTrie(frequency));
  });
});
