import { normalizeSymptom } from '../inference/canonicalize';
type Entry = { symptom: string; count: number };
type TrieNode = { children: Map<string, TrieNode>; matches: Entry[] };
const node = (): TrieNode => ({ children: new Map(), matches: [] });
export class Trie {
  private root = node();
  private entries = new Set<string>();
  insert(symptom: string, count = 0): void {
    const value = normalizeSymptom(symptom);
    if (!value || this.entries.has(value)) return;
    this.entries.add(value);
    const entry = { symptom: value, count };
    let current = this.root;
    current.matches.push(entry);
    for (const char of value) {
      if (!current.children.has(char)) current.children.set(char, node());
      current = current.children.get(char)!;
      current.matches.push(entry);
    }
  }
  /** Call once after bulk insertion, never during a render or search. */
  finalize(): void {
    const visit = (current: TrieNode) => {
      current.matches.sort((a, b) => b.count - a.count || a.symptom.localeCompare(b.symptom));
      current.children.forEach(visit);
    };
    visit(this.root);
  }
  search(prefix: string, limit = 8, excluded: ReadonlySet<string> = new Set()): string[] {
    if (limit <= 0) return [];
    let current = this.root;
    for (const char of normalizeSymptom(prefix)) {
      const next = current.children.get(char);
      if (!next) return [];
      current = next;
    }
    const result: string[] = [];
    for (const match of current.matches) {
      if (!excluded.has(match.symptom)) result.push(match.symptom);
      if (result.length >= limit) break;
    }
    return result;
  }
}
