import type { InferenceResult } from '../types/inference';
import { canonicalKey } from './canonicalize';
import { isContextToken } from './context';
import { compareCandidates } from './scoring';

/** Query suggestions, not joint probabilities: keep every observation and add one candidate. */
export function buildRagCombinations(result: InferenceResult, topK: number) {
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new Error('Choose a top K between 1 and 100.');
  const key = canonicalKey(result.observed.filter(symptom => !isContextToken(symptom)));
  const observed = key ? key.split('|') : [];
  const used = new Set(observed);
  const candidates = [...result.candidates].sort(compareCandidates).filter(candidate => {
    if (!observed.length || isContextToken(candidate.symptom) || used.has(candidate.symptom) || candidate.inferenceScore + Number.EPSILON < result.options.minScore) return false;
    used.add(candidate.symptom);
    return true;
  });
  return {
    schemaVersion: 1,
    observed,
    contexts: [...result.contexts],
    requestedK: topK,
    availableCombinations: candidates.length,
    truncated: result.truncated,
    settings: { minScore: result.options.minScore, maxDepth: result.options.maxDepth, associationMode: result.options.associationMode ?? 'combined' },
    ranking: 'Candidate inference score; not the probability of the complete symptom combination. Graph candidate limits do not apply.',
    combinations: candidates.slice(0, topK).map((candidate, index) => {
      const symptoms = [...observed, candidate.symptom];
      const evidence = candidate.bestEvidence;
      return {
        rank: index + 1, symptoms, addedSymptom: candidate.symptom,
        query: symptoms.join(', '), key: canonicalKey(symptoms),
        score: candidate.inferenceScore, depth: evidence.depth,
        evidence: { antecedents: evidence.antecedents, consequent: candidate.symptom, confidence: evidence.rule.confidence,
          occurrences: evidence.rule.occurrences, antecedentOccurrences: evidence.rule.antecedent_occurrences },
      };
    }),
  };
}
