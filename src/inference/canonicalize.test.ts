import { describe, expect, it } from 'vitest';
import { canonicalKey, normalizeSymptom } from './canonicalize';
import { combinations } from './combinations';
describe('canonical symptom keys', () => {
  it('normalizes the required example', () => expect(canonicalKey(['Fever', ' fatigue '])).toBe('fatigue|fever'));
  it('is order independent', () => expect(canonicalKey(['A', 'B'])).toBe(canonicalKey(['B', 'A'])));
  it('collapses spaces, deduplicates, and ignores blank entries', () => {
    expect(normalizeSymptom('  Shortness   Of Breath  ')).toBe('shortness of breath');
    expect(canonicalKey([' Fever ', 'FEVER', '', '   ', 'fatigue'])).toBe('fatigue|fever');
  });
});
describe('frontier combinations', () => {
  it('generates exactly the seven relevant keys', () => {
    expect([...combinations(['A', 'C', 'F'], 3)].sort()).toEqual(['a', 'a|c', 'a|c|f', 'a|f', 'c', 'c|f', 'f']);
  });
  it('only generates new combinations containing a frontier member', () => {
    expect([...combinations(['a', 'b', 'c', 'f'], 2, new Set(['b']))].sort()).toEqual(['a|b', 'b', 'b|c', 'b|f']);
  });
  it('does not repeat combinations for multiple new symptoms', () => {
    const keys = [...combinations(['a', 'b', 'c', 'd'], 3, new Set(['b', 'd']))];
    expect(keys.length).toBe(new Set(keys).size);
    expect(keys).not.toContain('a|c');
    expect(keys).toContain('b|c|d');
  });
});
