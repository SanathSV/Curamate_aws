import type { RuleSource } from '../api/rulesApi';
import type { Rule } from '../types/rules';
import { canonicalKey } from './canonicalize';
import { antecedentCombinations } from './combinations';
import { isContextToken } from './context';
import { compareCandidates, compareEvidence, conditionalConfidence, propagatedScore } from './scoring';
import type { Candidate, EvidencePath, InferenceOptions, InferenceResult } from '../types/inference';

type Known = { score: number; pathDepth: number; lineage: string[] };
const MAX_COMBINATIONS = 250000;
const BATCH_SIZE = 256;

export async function infer(source: RuleSource, symptoms: string[], options: InferenceOptions, signal?: AbortSignal, contexts: string[] = []): Promise<InferenceResult> {
  const started = performance.now();
  if (!Number.isFinite(options.minScore) || options.minScore < 0 || options.minScore > 1 ||
    !Number.isInteger(options.maxDepth) || options.maxDepth < 1 || options.maxDepth > 6 ||
    !Number.isInteger(options.topK) || options.topK < 1 || options.topK > 12 ||
    (options.associationMode !== undefined && !['pairwise', 'combined'].includes(options.associationMode))) throw new Error('Invalid inference settings.');
  const metadata = source.getMetadata();
  // Single-symptom keys measure B given A, without additionally conditioning on C, D, or E.
  const maxAntecedentSize = options.associationMode === 'pairwise' ? 1 : metadata.configuration.max_antecedent_size;
  const key = canonicalKey(symptoms);
  const observed = key ? key.split('|') : [];
  if (observed.some(symptom => isContextToken(symptom) || !source.hasSymptom(symptom))) throw new Error('Select symptoms from the dataset catalog.');
  const contextKey = canonicalKey(contexts);
  const selectedContexts = contextKey ? contextKey.split('|') : [];
  if (selectedContexts.some(token => !isContextToken(token) || !source.hasContext(token))) throw new Error('Select patient context from the context catalog.');
  if (selectedContexts.filter(token => token.startsWith('gender:')).length > 1) throw new Error('Select at most one gender context.');
  const activeContexts = options.associationMode === 'pairwise' ? [] : selectedContexts;
  const observedSet = new Set(observed);
  const known = new Map<string, Known>(observed.map(symptom => [symptom, { score: 1, pathDepth: 0, lineage: [symptom] }]));
  activeContexts.forEach(token => known.set(token, { score: 1, pathDepth: 0, lineage: [] }));
  const accepted = new Map<string, Candidate>();
  const evidencePool = new Map<string, Map<string, EvidencePath>>();
  const evaluatedAntecedents = new Set<string>();
  const ruleCache = new Map<string, readonly Rule[]>();
  const signatures = new Map<string, string>();
  let frontier = new Set(observed);
  let visited = 0;
  let truncated = false;
  let depthsExplored = 0;

  for (let round = 1; round <= options.maxDepth && frontier.size > 0; round++) {
    signal?.throwIfAborted();
    depthsExplored = round;
    const touched = new Set<string>();
    const evaluate = async (batch: string[]) => {
      const missing = batch.filter(antecedent => !ruleCache.has(antecedent));
      if (missing.length) {
        const retrieved = await source.getRules(missing, signal);
        missing.forEach(antecedent => ruleCache.set(antecedent, retrieved.get(antecedent) ?? []));
      }
      for (const antecedentKey of batch) {
        const antecedents = antecedentKey.split('|');
        const parents = antecedents.map(symptom => known.get(symptom)!);
        const pathDepth = 1 + Math.max(...parents.map(parent => parent.pathDepth));
        if (pathDepth > options.maxDepth) continue;
        const lineage = [...new Set(parents.flatMap(parent => parent.lineage))].sort();
        const signature = JSON.stringify(parents);
        if (signatures.get(antecedentKey) === signature) continue;
        signatures.set(antecedentKey, signature);
        evaluatedAntecedents.add(antecedentKey);
        (ruleCache.get(antecedentKey) ?? []).forEach((storedRule, index) => {
          if (isContextToken(storedRule.then) || !source.hasSymptom(storedRule.then)) return;
          const rule = options.associationMode === 'pairwise' || antecedents.some(isContextToken)
            ? { ...storedRule, confidence: conditionalConfidence(storedRule.occurrences, storedRule.antecedent_occurrences) }
            : storedRule;
          if (rule.confidence === 0 || rule.occurrences === 0) return;
          if (observedSet.has(rule.then) || lineage.includes(rule.then)) return;
          touched.add(rule.then);
          const path: EvidencePath = {
            id: antecedentKey + '=>' + rule.then + ':' + index,
            antecedents, consequent: rule.then, rule,
            parentScore: Math.min(...parents.map(parent => parent.score)),
            inferenceScore: propagatedScore(rule.confidence, parents.map(parent => parent.score)),
            depth: pathDepth, lineage: [...lineage, rule.then],
          };
          const evidence = evidencePool.get(rule.then) ?? new Map<string, EvidencePath>();
          const previous = evidence.get(path.id);
          if (!previous || compareEvidence(path, previous) < 0 ||
            (path.inferenceScore === previous.inferenceScore && path.depth < previous.depth)) evidence.set(path.id, path);
          evidencePool.set(rule.then, evidence);
        });
      }
    };
    let batch: string[] = [];
    for (const antecedent of antecedentCombinations([...known.keys()].filter(token => !isContextToken(token)), maxAntecedentSize, frontier,
      activeContexts, metadata.configuration.max_context_features ?? activeContexts.length)) {
      if (++visited > MAX_COMBINATIONS) { truncated = true; break; }
      batch.push(antecedent);
      if (batch.length === BATCH_SIZE) {
        await evaluate(batch);
        // Let the worker handle cancellation between batches.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        batch = [];
      }
    }
    if (batch.length) await evaluate(batch);
    const changed = new Set<string>();
    const newCandidates: Candidate[] = [];
    evidencePool.forEach((paths, symptom) => {
      const evidence = [...paths.values()].sort(compareEvidence);
      const bestEvidence = evidence[0];
      if (!bestEvidence || bestEvidence.inferenceScore + Number.EPSILON < options.minScore) return;
      const previous = accepted.get(symptom);
      const candidate: Candidate = {
        symptom, depth: previous?.depth ?? round,
        inferenceScore: bestEvidence.inferenceScore, bestEvidence, evidence,
      };
      if (previous) {
        const old = known.get(symptom)!;
        if (candidate.inferenceScore > old.score || bestEvidence.depth < old.pathDepth) changed.add(symptom);
        accepted.set(symptom, candidate);
        known.set(symptom, { score: candidate.inferenceScore, pathDepth: bestEvidence.depth, lineage: bestEvidence.lineage });
      } else if (touched.has(symptom)) newCandidates.push(candidate);
    });
    const additions = newCandidates.sort(compareCandidates).slice(0, options.topK);
    additions.forEach(candidate => {
      accepted.set(candidate.symptom, candidate);
      known.set(candidate.symptom, { score: candidate.inferenceScore, pathDepth: candidate.bestEvidence.depth, lineage: candidate.bestEvidence.lineage });
      changed.add(candidate.symptom);
    });
    frontier = changed;
    if (truncated) break;
  }
  return {
    observed, contexts: selectedContexts, candidates: [...accepted.values()].sort((a, b) => a.depth - b.depth || compareCandidates(a, b)),
    evaluatedAntecedents: evaluatedAntecedents.size, durationMs: performance.now() - started,
    depthsExplored, truncated, options: { ...options },
  };
}
