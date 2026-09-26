import type { SymptomFrequency } from '../types/rules';
import { Trie } from './Trie';
const cache = new WeakMap<Record<string, SymptomFrequency>, Trie>();
export function createSymptomTrie(frequency: Record<string, SymptomFrequency>): Trie {
  const existing = cache.get(frequency);
  if (existing) return existing;
  const trie = new Trie();
  Object.entries(frequency).forEach(([symptom, { count }]) => trie.insert(symptom, count));
  trie.finalize();
  cache.set(frequency, trie);
  return trie;
}
