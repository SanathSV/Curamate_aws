import { InMemoryRuleSource } from '../api/rulesApi';
import { infer } from '../inference/engine';
import { buildRagCombinations } from '../inference/ragCombinations';
import { normalizeSymptom } from '../inference/canonicalize';
import { filterDatasetByGender } from '../inference/genderFilter';
import type { RulesOutput } from '../types/rules';
import type { InferenceOptions } from '../types/inference';
import type { LatentInput, LatentOutput } from './types';

/** Input is explicitly projected before crossing the worker boundary: labels never arrive here. */
export async function generateLatent(data: RulesOutput, input: LatentInput, options: InferenceOptions, limit: number, signal?: AbortSignal): Promise<LatentOutput> {
  const gender = normalizeSymptom(input.gender);
  const filtered = filterDatasetByGender(data, gender === 'male' || gender === 'female' ? gender : undefined);
  const source = new InMemoryRuleSource(filtered);
  const symptoms = [...new Set(input.symptoms.map(normalizeSymptom))];
  const contexts = [...new Set([`gender:${gender}`, ...input.history.map(value => `history:${normalizeSymptom(value)}`)])];
  const unknownSymptoms = symptoms.filter(name => !source.hasSymptom(name));
  const unknownContexts = contexts.filter(name => !source.hasContext(name));
  const observed = symptoms.filter(name => source.hasSymptom(name));
  // Unknown features stay in the evaluation payload, but cannot seed catalog-based inference.
  if (!observed.length) return { index: input.index, latent: [], unknownSymptoms, unknownContexts, truncated: false };
  const result = await infer(source, observed, options, signal, contexts.filter(name => source.hasContext(name)), true);
  const combinations = buildRagCombinations(result, limit);
  return { index: input.index, latent: combinations.combinations.map(row => row.addedSymptom).filter(name => !symptoms.includes(name)), unknownSymptoms, unknownContexts, truncated: result.truncated };
}
