export function normalizeSymptom(symptom: string): string {
  return symptom.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function canonicalKey(symptoms: string[]): string {
  return [...new Set(symptoms.map(normalizeSymptom).filter(Boolean))].sort().join('|');
}
export function displaySymptom(symptom: string): string {
  const value = normalizeSymptom(symptom);
  return value.charAt(0).toUpperCase() + value.slice(1);
}
