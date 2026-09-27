import type { RulesOutput } from '../types/rules';
import { normalizeSymptom } from './canonicalize';
import { isContextToken } from './context';

export type SymptomGender = 'male' | 'female';
const cache = new WeakMap<RulesOutput, Map<SymptomGender, RulesOutput>>();

export function selectedGender(contexts: string[]): SymptomGender | undefined {
  const token = contexts.map(normalizeSymptom).find(value => value === 'gender:male' || value === 'gender:female');
  return token?.slice('gender:'.length) as SymptomGender | undefined;
}

/** Catalog restriction only: recorded counts and probability mathematics stay intact. */
export function filterDatasetByGender(data: RulesOutput, gender?: SymptomGender): RulesOutput {
  if (!gender) return data;
  const names = data[gender === 'male' ? 'male_symptoms' : 'female_symptoms'];
  // Legacy datasets remain usable; the interface explains an absent list.
  if (names === undefined) return data;
  const existing = cache.get(data)?.get(gender);
  if (existing) return existing;
  const allowed = new Set(names);
  const symptom_frequency = Object.fromEntries(Object.entries(data.symptom_frequency).filter(([name]) => allowed.has(name)));
  const rules: RulesOutput['rules'] = Object.create(null);
  for (const [key, entries] of Object.entries(data.rules)) {
    if (!key.split('|').every(token => isContextToken(token) || allowed.has(token))) continue;
    const filtered = entries.filter(rule => allowed.has(rule.then));
    if (filtered.length) rules[key] = filtered;
  }
  const result: RulesOutput = { ...data, symptom_frequency, rules };
  const variants = cache.get(data) ?? new Map<SymptomGender, RulesOutput>();
  variants.set(gender, result);
  cache.set(data, variants);
  return result;
}
