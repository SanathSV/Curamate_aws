import type { Rule, RulesOutput } from '../types/rules';
import { canonicalKey } from './canonicalize';

export type ComparisonMode = 'separate' | 'together';
export interface ComparisonCell {
  status: 'available' | 'missing' | 'no-records' | 'inconsistent';
  probability: number | null;
  occurrences: number | null;
  antecedentOccurrences: number | null;
  difference: number | null;
}
export interface SymptomComparison {
  columns: { key: string; symptoms: string[] }[];
  rows: { symptom: string; baseline: number | null; baselineCount: number; cells: ComparisonCell[] }[];
  transactions: number;
  mode: ComparisonMode;
}

/** Compare empirical P(target | source) or P(target | all sources) using exact rule counts.
 * Missing joint rules cannot be reconstructed by multiplying pairwise probabilities.
 */
export function compareSymptoms(data: RulesOutput, starting: string[], targets: string[] = [], mode: ComparisonMode = 'together'): SymptomComparison {
  if (mode !== 'separate' && mode !== 'together') throw new Error('Invalid comparison mode.');
  const normalize = (values: string[]) => { const key = canonicalKey(values); return key ? key.split('|') : []; };
  const sources = normalize(starting);
  const requested = normalize(targets);
  if ([...sources, ...requested].some(name => !Object.hasOwn(data.symptom_frequency, name))) throw new Error('Select symptoms from the dataset catalog.');
  const columns = sources.length === 0 ? [] : mode === 'separate'
    ? sources.map(symptom => ({ key: symptom, symptoms: [symptom] }))
    : [{ key: canonicalKey(sources), symptoms: sources }];
  const transactions = data.metadata.transactions;
  const validCount = (count: number) => Number.isSafeInteger(count) && count >= 0 && count <= transactions;
  const validTotal = Number.isSafeInteger(transactions) && transactions > 0;
  const indexes = columns.map(column => {
    const rules = Object.hasOwn(data.rules, column.key) ? data.rules[column.key] : [];
    const byTarget = new Map<string, Rule[]>();
    for (const rule of rules) byTarget.set(rule.then, [...(byTarget.get(rule.then) ?? []), rule]);
    const denominators = new Set(rules.map(rule => rule.antecedent_occurrences));
    const count = column.symptoms.length === 1 ? data.symptom_frequency[column.symptoms[0]].count : rules[0]?.antecedent_occurrences;
    const inconsistent = denominators.size > 1 || (count !== undefined && (!validCount(count) || [...denominators].some(value => value !== count))) ||
      (count !== undefined && column.symptoms.some(name => count > data.symptom_frequency[name].count));
    return { byTarget, count, inconsistent };
  });
  const rows = (requested.length ? requested : Object.keys(data.symptom_frequency).sort()).filter(name => !sources.includes(name)).map(symptom => {
    const baselineCount = data.symptom_frequency[symptom].count;
    const baseline = validTotal && validCount(baselineCount) ? baselineCount / transactions : null;
    const cells = indexes.map(({ byTarget, count, inconsistent }): ComparisonCell => {
      const unavailable = (status: ComparisonCell['status']): ComparisonCell => ({ status, probability: null, occurrences: null, antecedentOccurrences: count ?? null, difference: null });
      if (!validTotal || baseline === null || inconsistent) return unavailable('inconsistent');
      const matches = byTarget.get(symptom) ?? [];
      const rule = matches[0];
      if (rule && (matches.some(other => other.occurrences !== rule.occurrences) || !validCount(rule.occurrences) ||
        rule.occurrences > rule.antecedent_occurrences || rule.occurrences > baselineCount)) return unavailable('inconsistent');
      if (count === 0) return unavailable('no-records');
      if (!rule) return unavailable('missing');
      const probability = rule.occurrences / rule.antecedent_occurrences;
      return { status: 'available', probability, occurrences: rule.occurrences, antecedentOccurrences: rule.antecedent_occurrences, difference: probability - baseline };
    });
    return { symptom, baseline, baselineCount, cells };
  });
  return { columns, rows, transactions, mode };
}
