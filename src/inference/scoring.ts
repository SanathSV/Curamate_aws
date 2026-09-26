import type { Candidate, EvidencePath } from '../types/inference';
/** Empirical P(B | A), using all A records supplied by the backend. */
export function conditionalConfidence(jointOccurrences: number, antecedentOccurrences: number): number {
  if (!Number.isSafeInteger(jointOccurrences) || !Number.isSafeInteger(antecedentOccurrences) ||
    jointOccurrences < 0 || antecedentOccurrences < 0 || jointOccurrences > antecedentOccurrences) {
    throw new Error('The dataset contains inconsistent pairwise occurrence counts.');
  }
  return antecedentOccurrences === 0 ? 0 : jointOccurrences / antecedentOccurrences;
}
export function propagatedScore(confidence: number, parentScores: number[]): number {
  return confidence * Math.min(...parentScores);
}
export function compareEvidence(a: EvidencePath, b: EvidencePath): number {
  return b.inferenceScore - a.inferenceScore || b.rule.lift - a.rule.lift ||
    b.rule.support - a.rule.support || b.rule.occurrences - a.rule.occurrences || a.id.localeCompare(b.id);
}
export function compareCandidates(a: Candidate, b: Candidate): number {
  return compareEvidence(a.bestEvidence, b.bestEvidence) || a.symptom.localeCompare(b.symptom);
}
