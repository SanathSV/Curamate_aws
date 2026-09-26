import type { Rule, RulesOutput } from '../types/rules';
import { canonicalKey, normalizeSymptom } from '../inference/canonicalize';
import { isContextToken } from '../inference/context';
export function rule(then: string, confidence: number, overrides: Partial<Rule> = {}): Rule {
  return { then: normalizeSymptom(then), confidence, support: .1, lift: 1.5, occurrences: Math.round(confidence * 1000),
    antecedent_occurrences: 1000, consequent_occurrences: 1000, ...overrides };
}

export function contextDataset(entries: [string[], Rule[]][]): RulesOutput {
  const result = dataset(entries);
  result.context_frequency = {};
  for (const token of Object.keys(result.symptom_frequency)) {
    if (!isContextToken(token)) continue;
    result.context_frequency[token] = result.symptom_frequency[token];
    delete result.symptom_frequency[token];
  }
  result.metadata.unique_symptoms = Object.keys(result.symptom_frequency).length;
  result.metadata.configuration.max_context_features = 2;
  return result;
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
