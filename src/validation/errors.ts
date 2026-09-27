export interface InvalidEvaluationRecord { recordIndex: number | null; reason: string }
export class EvaluationBatchError extends Error {
  constructor(message: string, public readonly status: number, public readonly invalidRecords: InvalidEvaluationRecord[] = []) {
    super(message);
    this.name = 'EvaluationBatchError';
  }
}
/** Error bodies never contribute results or counts, even if they include partial metrics. */
export function parseEvaluationError(status: number, payload: unknown, batchLength: number): EvaluationBatchError {
  let value = payload;
  if (value && typeof value === 'object' && 'body' in value) {
    try { const body = (value as { body: unknown }).body; value = typeof body === 'string' ? JSON.parse(body) : body; } catch { value = null; }
  }
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const invalidRecords: InvalidEvaluationRecord[] = status === 400 && Array.isArray(root.invalid_records) ? root.invalid_records.map(value => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const index = row.record_index;
    const messages = Array.isArray(row.errors) ? row.errors.filter((item): item is string => typeof item === 'string') : [];
    return {
      recordIndex: typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 && index < batchLength ? index : null,
      reason: typeof row.error === 'string' ? row.error : typeof row.message === 'string' ? row.message : messages.length ? messages.join('; ') : 'The service rejected this record without a detailed reason.',
    };
  }) : [];
  const message = typeof root.error === 'string' ? root.error : typeof root.message === 'string' ? root.message : '';
  const rejection = status === 400 && root.invalid_records !== undefined;
  return new EvaluationBatchError(
    (rejection ? 'The service rejected this whole batch because some records are invalid. No records from this batch were counted.' : `Evaluation service returned HTTP ${status}.`) +
    (message ? ` ${message}` : '') + ' Previous completed batches are saved in this session.', status, invalidRecords,
  );
}
