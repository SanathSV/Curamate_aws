import type { RuleSource } from '../api/rulesApi';
import type { Rule } from '../types/rules';
import { canonicalKey } from './canonicalize';
import { conditionalConfidence } from './scoring';

export interface SymptomPath {
  symptoms: string[];
  steps: { from: string; to: string; confidence: number; occurrences: number; antecedentOccurrences: number }[];
  score: number;
  depth: number;
}
export interface PathOptions { minScore: number; maxDepth: number; maxPaths?: number; maxEvaluations?: number }
export interface PathSearchResult {
  paths: SymptomPath[];
  minScore: number;
  maxDepth: number;
  evaluatedEdges: number;
  truncated: boolean;
  limitReason: 'paths' | 'evaluations' | null;
}

/** Enumerate distinct ordered, cycle-free pairwise paths from every selected symptom.
 * Each path is independent: no top-K pruning or merging at shared endpoints.
 * Scores multiply empirical edge confidences; multi-hop scores are heuristics.
 * Completeness is relative to the supplied rules, threshold, and maximum depth.
 */
export async function findSymptomPaths(
  source: RuleSource, symptoms: string[], options: PathOptions, signal?: AbortSignal,
): Promise<PathSearchResult> {
  const { minScore, maxDepth, maxPaths = 50000, maxEvaluations = 250000 } = options;
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1 ||
    !Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 6 ||
    !Number.isSafeInteger(maxPaths) || maxPaths < 1 || maxPaths > 50000 ||
    !Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > 250000) {
    throw new Error('Invalid path search settings.');
  }
  signal?.throwIfAborted();
  const key = canonicalKey(symptoms);
  const roots = key ? key.split('|') : [];
  if (roots.some(symptom => !source.hasSymptom(symptom))) throw new Error('Select symptoms from the dataset catalog.');
  const result: PathSearchResult = { paths: [], minScore, maxDepth, evaluatedEdges: 0, truncated: false, limitReason: null };
  const cache = new Map<string, readonly Rule[]>();
  async function rulesFor(symptom: string) {
    if (!cache.has(symptom)) {
      const rules = await source.getRules([symptom], signal);
      signal?.throwIfAborted();
      const unique = new Map<string, Rule>();
      for (const rule of rules.get(symptom) ?? []) {
        const confidence = conditionalConfidence(rule.occurrences, rule.antecedent_occurrences);
        if (!unique.has(rule.then) || confidence > unique.get(rule.then)!.confidence) {
          unique.set(rule.then, { ...rule, confidence });
        }
      }
      cache.set(symptom, [...unique.values()].sort((a, b) => a.then.localeCompare(b.then)));
    }
    return cache.get(symptom)!;
  }
  function stop(reason: 'paths' | 'evaluations') {
    result.truncated = true;
    result.limitReason = reason;
  }
  async function visit(path: SymptomPath): Promise<void> {
    if (path.depth === maxDepth || result.truncated) return;
    const from = path.symptoms[path.symptoms.length - 1];
    for (const rule of await rulesFor(from)) {
      signal?.throwIfAborted();
      if (result.evaluatedEdges === maxEvaluations) { stop('evaluations'); return; }
      result.evaluatedEdges++;
      if (result.evaluatedEdges % 256 === 0) {
        // Allow the worker to receive cancellation while traversing a dense network.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        signal?.throwIfAborted();
      }
      if (path.symptoms.includes(rule.then)) continue;
      const confidence = rule.confidence;
      const score = path.score * confidence;
      if (confidence === 0 || score + Number.EPSILON < minScore) continue;
      if (result.paths.length === maxPaths) { stop('paths'); return; }
      const next: SymptomPath = {
        symptoms: [...path.symptoms, rule.then],
        steps: [...path.steps, { from, to: rule.then, confidence, occurrences: rule.occurrences, antecedentOccurrences: rule.antecedent_occurrences }],
        score, depth: path.depth + 1,
      };
      result.paths.push(next);
      await visit(next);
      if (result.truncated) return;
    }
  }
  for (const root of roots) {
    await visit({ symptoms: [root], steps: [], score: 1, depth: 0 });
    if (result.truncated) break;
  }
  signal?.throwIfAborted();
  result.paths.sort((a, b) => b.score - a.score || a.depth - b.depth || JSON.stringify(a.symptoms).localeCompare(JSON.stringify(b.symptoms)));
  return result;
}
