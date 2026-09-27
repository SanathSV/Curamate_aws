import type { DiagnosisRequest, DiagnosisResponse, OverallDiagnosticCandidate } from '../types/diagnosis';
import { canonicalKey } from './canonicalize';
import { isContextToken } from './context';

/** Only named symptoms/context cross the API boundary; inference scores are not sent. */
export function buildDiagnosisRequest(currentSymptoms: string[], gender: string | null, history: string[], diagnosisTopK: number, generatedCombinations: string[][]): DiagnosisRequest {
  const validSymptoms = (items: string[]) => items.every(item => typeof item === 'string' && item.trim().length > 0 && !item.includes('|') && !isContextToken(item));
  if (!currentSymptoms.length || !validSymptoms(currentSymptoms)) throw new Error('Select at least one valid current symptom.');
  if (!Number.isSafeInteger(diagnosisTopK) || diagnosisTopK < 1) throw new Error('Diagnoses per combination must be a positive whole number.');
  if (gender !== null && (typeof gender !== 'string' || !gender.trim() || gender.includes(':'))) throw new Error('Invalid gender value.');
  if (!history.every(value => typeof value === 'string' && value.trim() && !isContextToken(value))) throw new Error('Invalid history values.');
  const observedKeys = new Set(currentSymptoms.map(symptom => canonicalKey([symptom])));
  const combinations = [[...currentSymptoms]];
  const seen = new Set([canonicalKey(currentSymptoms)]);
  for (const generated of generatedCombinations) {
    if (!validSymptoms(generated)) throw new Error('Invalid generated symptom combination.');
    const generatedKeys = new Set(generated.map(symptom => canonicalKey([symptom])));
    if ([...observedKeys].some(key => !generatedKeys.has(key))) throw new Error('A generated combination is missing an original symptom.');
    const additions = generated.filter(symptom => !observedKeys.has(canonicalKey([symptom])));
    const combination = [...currentSymptoms, ...new Map(additions.map(symptom => [canonicalKey([symptom]), symptom])).values()];
    const key = canonicalKey(combination);
    if (seen.has(key)) continue;
    seen.add(key); combinations.push(combination);
  }
  return { current_symptoms: [...currentSymptoms], gender, history: [...history], diagnosis_top_k: diagnosisTopK, symptom_combinations: combinations };
}

/** Rank API-supplied scores only. No diagnostic scores are calculated here. */
export function overallDiagnosticCandidates(response: DiagnosisResponse): OverallDiagnosticCandidate[] {
  const sorted = response.results.flatMap(result => result.diagnoses.map(diagnosis => ({ ...diagnosis, source_combination_index: result.combination_index, source_symptoms: [...result.symptoms] })))
    .sort((a, b) => b.probability - a.probability || a.source_combination_index - b.source_combination_index || a.rank - b.rank || a.diagnosis.localeCompare(b.diagnosis));
  const seen = new Set<string>();
  return sorted.filter(item => {
    const key = item.diagnosis.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
