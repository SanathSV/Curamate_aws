import type { DiagnosisRequest, DiagnosisResponse } from '../types/diagnosis';
import { canonicalKey } from '../inference/canonicalize';

export const DIAGNOSIS_API_URL = import.meta.env.VITE_DIAGNOSIS_API_URL?.trim() ?? '';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed diagnosis response.');
  return value as Record<string, unknown>;
}
function number(value: unknown, label: string, max = Infinity, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) throw new Error('Malformed diagnosis response: invalid ' + label + '.');
  return value;
}
export function parseDiagnosisResponse(input: unknown, request: DiagnosisRequest): DiagnosisResponse {
  let root = object(input);
  if (root.results === undefined && root.body !== undefined) {
    try { root = object(typeof root.body === 'string' ? JSON.parse(root.body) : root.body); }
    catch { throw new Error('Malformed diagnosis response body.'); }
  }
  if (!Array.isArray(root.results)) throw new Error('Malformed diagnosis response: results must be an array.');
  const seen = new Set<number>();
  const results = root.results.map(value => {
    const row = object(value);
    const index = number(row.combination_index, 'combination index', request.symptom_combinations.length - 1, true);
    if (seen.has(index)) throw new Error('Malformed diagnosis response: duplicate combination.');
    seen.add(index);
    if (!Array.isArray(row.symptoms) || !row.symptoms.every(item => typeof item === 'string' && item.trim()) || canonicalKey(row.symptoms) !== canonicalKey(request.symptom_combinations[index])) throw new Error('The diagnosis response does not match the submitted symptom combinations.');
    if (!Array.isArray(row.diagnoses)) throw new Error('Malformed diagnosis response: diagnoses must be an array.');
    const ranks = new Set<number>();
    const diagnoses = row.diagnoses.map(value => {
      const candidate = object(value);
      const rank = number(candidate.rank, 'rank', Infinity, true);
      if (rank < 1 || ranks.has(rank)) throw new Error('Malformed diagnosis response: invalid or duplicate rank.');
      ranks.add(rank);
      if (typeof candidate.diagnosis !== 'string' || !candidate.diagnosis.trim()) throw new Error('Malformed diagnosis response: invalid diagnosis name.');
      return { rank, diagnosis: candidate.diagnosis.trim(), probability: number(candidate.probability, 'probability', 1), percentage: number(candidate.percentage, 'percentage', 100) };
    }).sort((a, b) => a.rank - b.rank);
    return { combination_index: index, symptoms: [...row.symptoms] as string[], diagnoses };
  }).sort((a, b) => a.combination_index - b.combination_index);
  let metadata: DiagnosisResponse['metadata'];
  if (root.metadata !== undefined) {
    const raw = object(root.metadata);
    metadata = {
      diagnosis_top_k: number(raw.diagnosis_top_k, 'diagnosis_top_k', Infinity, true),
      combinations_received: number(raw.combinations_received, 'combinations_received', Infinity, true),
      combinations_scored: number(raw.combinations_scored, 'combinations_scored', Infinity, true),
    };
  }
  return { results, ...(metadata ? { metadata } : {}) };
}

export async function fetchDiagnoses(request: DiagnosisRequest, signal?: AbortSignal): Promise<DiagnosisResponse> {
  if (!DIAGNOSIS_API_URL) throw new Error('The diagnosis API has not been configured.');
  let url: URL;
  try { url = new URL(DIAGNOSIS_API_URL); }
  catch { throw new Error('The diagnosis API URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The diagnosis API URL must use HTTP or HTTPS.');
  const timeout = AbortSignal.timeout(60000);
  let response: Response;
  try {
    response = await fetch(url.href, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'omit', cache: 'no-store',
      body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('The diagnosis service timed out. Please try again.');
    throw new Error('Unable to reach the diagnosis service. Check your connection or the service CORS configuration.');
  }
  if (!response.ok) throw new Error(`The diagnosis service returned HTTP ${response.status}. Please try again.`);
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('The diagnosis service did not return valid JSON.'); }
  return parseDiagnosisResponse(payload, request);
}
