import { canonicalKey, normalizeSymptom } from '../inference/canonicalize';
import type { Rule, RulesMetadata, RulesOutput, SymptomFrequency } from '../types/rules';

export const API_URL = import.meta.env.VITE_RULES_API_URL;
export class ConfigurationError extends Error {}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed dataset: ' + path + ' must be an object.');
  return value as Record<string, unknown>;
}
function number(value: unknown, path: string, integer = false, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) {
    throw new Error('Malformed dataset: invalid ' + path + '.');
  }
  return value;
}
function name(value: unknown, path: string): string {
  if (typeof value !== 'string' || !normalizeSymptom(value) || value.includes('|')) throw new Error('Malformed dataset: invalid symptom at ' + path + '.');
  return normalizeSymptom(value);
}

/** Runtime validation and canonicalization occur once, before the dataset enters the application. */
export function parseRulesOutput(input: unknown): RulesOutput {
  const data = object(input, 'root');
  const meta = object(data.metadata, 'metadata');
  const config = object(meta.configuration, 'configuration');
  const metadata: RulesMetadata = {
    transactions: number(meta.transactions, 'transactions', true),
    unique_symptoms: number(meta.unique_symptoms, 'unique_symptoms', true),
    antecedent_keys: number(meta.antecedent_keys, 'antecedent_keys', true),
    rules_saved: number(meta.rules_saved, 'rules_saved', true),
    configuration: { max_antecedent_size: number(config.max_antecedent_size, 'max_antecedent_size', true) },
  };
  if (!metadata.transactions || !metadata.configuration.max_antecedent_size) throw new Error('Malformed dataset: transaction count and maximum antecedent size must be positive.');
  for (const key of ['source_bucket', 'source_file'] as const) {
    if (meta[key] !== undefined) {
      if (typeof meta[key] !== 'string') throw new Error('Malformed dataset: invalid ' + key + '.');
      metadata[key] = meta[key];
    }
  }
  for (const key of ['rules_generated', 'minimum_occurrence_count'] as const) {
    if (meta[key] !== undefined) metadata[key] = number(meta[key], key, true);
  }
  for (const key of ['min_support', 'min_confidence', 'min_lift', 'min_occurrences', 'top_k_per_antecedent'] as const) {
    if (config[key] !== undefined) metadata.configuration[key] = number(config[key], key,
      key === 'min_occurrences' || key === 'top_k_per_antecedent',
      key === 'min_support' || key === 'min_confidence' ? 1 : Infinity);
  }
  const frequency: Record<string, SymptomFrequency> = Object.create(null) as Record<string, SymptomFrequency>;
  for (const [raw, value] of Object.entries(object(data.symptom_frequency, 'symptom_frequency'))) {
    const symptom = name(raw, 'symptom_frequency');
    if (Object.hasOwn(frequency, symptom)) throw new Error('Malformed dataset: duplicate normalized symptom ' + symptom + '.');
    const item = object(value, symptom);
    frequency[symptom] = { count: number(item.count, 'symptom count', true), probability: number(item.probability, 'symptom probability', false, 1) };
  }
  if (!Object.keys(frequency).length) throw new Error('The dataset contains no symptoms.');
  const rules: Record<string, Rule[]> = Object.create(null) as Record<string, Rule[]>;
  for (const [raw, value] of Object.entries(object(data.rules, 'rules'))) {
    const parts = raw.split('|').map(part => name(part, 'antecedent'));
    const key = canonicalKey(parts);
    if (key.split('|').length > metadata.configuration.max_antecedent_size) throw new Error('Malformed dataset: a rule exceeds the maximum antecedent size.');
    if (parts.some(part => !Object.hasOwn(frequency, part))) throw new Error('Malformed dataset: a rule antecedent is missing from the symptom catalog.');
    if (!Array.isArray(value)) throw new Error('Malformed dataset: rules for ' + key + ' must be an array.');
    const entries = value.map((item: unknown): Rule => {
      const rule = object(item, 'rule');
      const consequent = name(rule.then, 'rule.then');
      if (!Object.hasOwn(frequency, consequent)) throw new Error('Malformed dataset: ' + consequent + ' is missing from the symptom catalog.');
      return {
        then: consequent, confidence: number(rule.confidence, 'confidence', false, 1),
        support: number(rule.support, 'support', false, 1), lift: number(rule.lift, 'lift'),
        occurrences: number(rule.occurrences, 'occurrences', true),
        antecedent_occurrences: number(rule.antecedent_occurrences, 'antecedent_occurrences', true),
        consequent_occurrences: number(rule.consequent_occurrences, 'consequent_occurrences', true),
      };
    });
    rules[key] = [...(rules[key] ?? []), ...entries];
  }
  return { metadata, symptom_frequency: frequency, rules };
}

let cachedRequest: Promise<RulesOutput> | undefined;
let failed = false;

/** One shared request per page load, including React StrictMode's development remount. */
export function fetchRules(): Promise<RulesOutput> {
  if (cachedRequest) return cachedRequest;
  cachedRequest = (async () => {
    if (!API_URL?.trim()) throw new ConfigurationError('The rules API has not been configured.');
    const url = new URL(API_URL, window.location.origin);
    if (!['https:', 'http:'].includes(url.protocol)) throw new ConfigurationError('The rules API URL must use HTTP or HTTPS.');
    const response = await fetch(url.href, {
      method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('The rules service returned HTTP ' + response.status + '. Please retry.');
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new Error('The rules service did not return valid JSON.'); }
    return parseRulesOutput(data);
  })().catch((error: unknown) => {
    failed = true;
    if (error instanceof TypeError) throw new Error('Unable to reach the rules service. Check your connection and the API CORS configuration, then retry.');
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('The rules service took too long to respond. Please retry.');
    throw error;
  });
  return cachedRequest;
}

/** An explicit retry is the only way to issue another request after failure. */
export function retryRules(): Promise<RulesOutput> {
  if (failed) { cachedRequest = undefined; failed = false; }
  return fetchRules();
}

/** The engine depends on a provider contract, so a future batched API can replace this adapter. */
export interface RuleSource {
  getMetadata(): RulesMetadata;
  hasSymptom(symptom: string): boolean;
  getRules(keys: readonly string[], signal?: AbortSignal): Promise<ReadonlyMap<string, readonly Rule[]>>;
}
export class InMemoryRuleSource implements RuleSource {
  constructor(private readonly data: RulesOutput) {}
  getMetadata() { return this.data.metadata; }
  hasSymptom(symptom: string) { return Object.hasOwn(this.data.symptom_frequency, symptom); }
  async getRules(keys: readonly string[], signal?: AbortSignal): Promise<ReadonlyMap<string, readonly Rule[]>> {
    signal?.throwIfAborted();
    return new Map(keys.map(raw => {
      const key = canonicalKey(raw.split('|'));
      return [key, Object.hasOwn(this.data.rules, key) ? this.data.rules[key] : []];
    }));
  }
}
