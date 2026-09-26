import { displaySymptom, normalizeSymptom } from './canonicalize';

/** Reserved antecedent-only namespaces; context is never a symptom. */
export function isContextToken(token: string): boolean {
  return /^(gender|history):/.test(normalizeSymptom(token));
}
export function displayContext(token: string): string {
  const normalized = normalizeSymptom(token);
  const separator = normalized.indexOf(':');
  return displaySymptom(normalized.slice(0, separator)) + ': ' + displaySymptom(normalized.slice(separator + 1));
}
