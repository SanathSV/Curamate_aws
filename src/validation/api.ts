import { parseEvaluationError } from './errors';
import type { EvaluationRequest, EvaluationResponse, EvaluationSummary, PassMetrics, RecordPass, Outcome } from './types';
export const EVALUATION_URL = import.meta.env.VITE_LAMBDA4_EVALUATION_URL?.trim() ?? '';
const fail = (message: string): never => { throw new Error('Invalid evaluation response: ' + message); };
function obj(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object.'); return value as Record<string, unknown>; }
function count(value: unknown, name: string, max = Number.MAX_SAFE_INTEGER): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return fail(name + ' must be a valid count.'); return value; }
function rank(value: unknown): number | null { if (value === null || value === undefined) return null; if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fail('rank must be at least 1 or null.'); return value; }
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) return fail('missing diagnosis name.'); return value; }
function metrics(value: unknown, total: number): PassMetrics {
  const raw = obj(value);
  const result: PassMetrics = { top_1_correct: count(raw.top_1_correct, 'top_1_correct', total), top_3_correct: count(raw.top_3_correct, 'top_3_correct', total), top_5_correct: count(raw.top_5_correct, 'top_5_correct', total), average_ground_truth_rank: rank(raw.average_ground_truth_rank) };
  if (result.top_1_correct > result.top_3_correct || result.top_3_correct > result.top_5_correct) return fail('Top-K correct counts must increase with K.');
  if (raw.ground_truth_rank_count !== undefined) result.ground_truth_rank_count = count(raw.ground_truth_rank_count, 'ground_truth_rank_count', total);
  if (raw.median_ground_truth_rank !== undefined) result.median_ground_truth_rank = rank(raw.median_ground_truth_rank);
  return result;
}
function pass(value: unknown): RecordPass | undefined {
  if (value === undefined) return undefined;
  const raw = obj(value);
  if (!Array.isArray(raw.diagnoses)) return fail('record diagnoses must be an array.');
  const seen = new Set<number>();
  const diagnoses = raw.diagnoses.map(value => {
    const item = obj(value); const position = count(item.rank, 'prediction rank');
    if (!position || seen.has(position)) return fail('prediction ranks must be positive and unique.');
    seen.add(position);
    return { rank: position, diagnosis: text(item.diagnosis) };
  }).sort((a,b) => a.rank - b.rank);
  const truthRank = rank(raw.ground_truth_rank);
  if (truthRank !== null && !Number.isSafeInteger(truthRank)) return fail('record ground-truth rank must be a whole number.');
  return { ground_truth_rank: truthRank, diagnoses };
}
/** Evolving API details are isolated here. Summary-only responses are valid; omitted detail is never fabricated. */
export function parseEvaluationResponse(input: unknown, expectedRecords: number): EvaluationResponse {
  let root = obj(input);
  if (root.summary === undefined && root.body !== undefined) root = obj(typeof root.body === 'string' ? JSON.parse(root.body) : root.body);
  const raw = obj(root.summary);
  const received = count(raw.records_received, 'records_received');
  if (received !== expectedRecords) return fail('received count does not match the submitted batch.');
  const evaluated = count(raw.records_evaluated, 'records_evaluated', received);
  const unknown = count(raw.unknown_ground_truth_records, 'unknown_ground_truth_records', received);
  if (evaluated + unknown !== received) return fail('evaluated and unknown counts must account for every submitted record.');
  const comparison = obj(raw.comparison);
  const outcomes = { improved_records: count(comparison.improved_records, 'improved_records', evaluated), worsened_records: count(comparison.worsened_records, 'worsened_records', evaluated), unchanged_records: count(comparison.unchanged_records, 'unchanged_records', evaluated) };
  if (outcomes.improved_records + outcomes.worsened_records + outcomes.unchanged_records !== evaluated) return fail('outcome counts do not match records_evaluated.');
  const summary: EvaluationSummary = { records_received: received, records_evaluated: evaluated, unknown_ground_truth_records: unknown, without_latent: metrics(raw.without_latent, evaluated), with_latent: metrics(raw.with_latent, evaluated), comparison: outcomes };
  if (raw.unknown_model_features !== undefined) summary.unknown_model_features = count(raw.unknown_model_features, 'unknown_model_features');
  const result: EvaluationResponse = { summary };
  if (root.records !== undefined) {
    if (!Array.isArray(root.records)) return fail('records must be an array.');
    const seen = new Set<number>();
    result.records = root.records.map(value => {
      const row = obj(value); const index = count(row.record_index, 'record_index', received - 1);
      if (seen.has(index)) return fail('duplicate record_index.');
      seen.add(index);
      const outcome = row.outcome === 'unknown_ground_truth' ? 'unknown' : row.outcome;
      if (!['improved','worsened','unchanged','unknown'].includes(outcome as string)) return fail('unknown outcome.');
      if (row.unknown_model_features !== undefined && (!Array.isArray(row.unknown_model_features) || !row.unknown_model_features.every(x => typeof x === 'string'))) return fail('unknown_model_features must be an array of feature names.');
      return { record_index: index, outcome: outcome as Outcome, without_latent: pass(row.without_latent), with_latent: pass(row.with_latent), ...(row.unknown_model_features !== undefined ? { unknown_model_features: row.unknown_model_features as string[] } : {}) };
    });
  }
  if (result.records?.length === received) {
    const totals = { improved: 0, worsened: 0, unchanged: 0, unknown: 0 };
    for (const row of result.records) totals[row.outcome]++;
    if (totals.improved !== outcomes.improved_records || totals.worsened !== outcomes.worsened_records || totals.unchanged !== outcomes.unchanged_records || totals.unknown !== unknown) return fail('record outcomes do not match the summary.');
  }
  if (root.per_diagnosis !== undefined) {
    if (!Array.isArray(root.per_diagnosis)) return fail('per_diagnosis must be an array.');
    const seen = new Set<string>();
    result.per_diagnosis = root.per_diagnosis.map(value => {
      const row = obj(value); const diagnosis = text(row.diagnosis); const support = count(row.support, 'support', evaluated);
      if (seen.has(diagnosis)) return fail('duplicate per-diagnosis entry.');
      seen.add(diagnosis);
      return { diagnosis, support, without_latent: metrics(row.without_latent, support), with_latent: metrics(row.with_latent, support) };
    });
  }
  if (result.per_diagnosis) {
    const support = result.per_diagnosis.reduce((total,row) => total + row.support, 0);
    if (support > evaluated) return fail('per-diagnosis support exceeds evaluated records.');
    if (support === evaluated) for (const pass of ['without_latent','with_latent'] as const) for (const key of ['top_1_correct','top_3_correct','top_5_correct'] as const) {
      if (result.per_diagnosis.reduce((total,row) => total + row[pass][key], 0) !== summary[pass][key]) return fail('per-diagnosis correct counts do not match the summary.');
    }
  }
  return result;
}
export async function evaluateBatch(request: EvaluationRequest, signal: AbortSignal): Promise<EvaluationResponse> {
  if (!EVALUATION_URL) throw new Error('Set VITE_LAMBDA4_EVALUATION_URL in .env.local, then restart the app to connect evaluation.');
  const url = new URL(EVALUATION_URL, window.location.origin);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The evaluation endpoint must use HTTP or HTTPS.');
  const timeout = AbortSignal.timeout(120000);
  let response: Response;
  try { response = await fetch(url.href, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.any([signal, timeout]) }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new Error(timeout.aborted ? 'This batch timed out. Retry it or start a new run with a smaller batch size.' : 'Could not reach the evaluation service. Check the connection and endpoint CORS settings.');
  }
  if (!response.ok) {
    let errorPayload: unknown;
    try { errorPayload = await response.json(); } catch { /* Gateways may return non-JSON errors. */ }
    throw parseEvaluationError(response.status, errorPayload, request.records.length);
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error('Evaluation service returned invalid JSON.'); }
  return parseEvaluationResponse(payload, request.records.length);
}
