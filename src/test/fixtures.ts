import type { Rule, RulesOutput } from '../types/rules';
import { canonicalKey, normalizeSymptom } from '../inference/canonicalize';
export function rule(then: string, confidence: number, overrides: Partial<Rule> = {}): Rule {
  return { then: normalizeSymptom(then), confidence, support: .1, lift: 1.5, occurrences: 100,
    antecedent_occurrences: 125, consequent_occurrences: 150, ...overrides };
}
export function dataset(entries: [string[], Rule[]][]): RulesOutput {
  const names = new Set(entries.flatMap(([before, rules]) => [...before.map(normalizeSymptom), ...rules.map(item => item.then)]));
  return {
    metadata: { transactions: 1000, unique_symptoms: names.size, antecedent_keys: entries.length,
      rules_saved: entries.reduce((count, [, rules]) => count + rules.length, 0), configuration: { max_antecedent_size: 3 } },
    symptom_frequency: Object.fromEntries([...names].map(name => [name, { count: 500, probability: .5 }])),
    rules: Object.fromEntries(entries.map(([before, rules]) => [canonicalKey(before), rules])),
  };
}
