import type { BatchResult, DiagnosisMetrics, EvaluationSummary, PassMetrics } from './types';
const sum = (values: number[]) => values.reduce((a,b) => a+b, 0);
export function aggregatePass(rows: { metrics: PassMetrics; count: number }[]): PassMetrics {
  const rankRows = rows.filter(row => row.count > 0);
  const complete = rankRows.every(row => row.metrics.average_ground_truth_rank !== null);
  const weight = sum(rankRows.map(row => row.metrics.ground_truth_rank_count ?? row.count));
  const total = sum(rows.map(row => row.count));
  return {
    top_1_accuracy: total ? sum(rows.map(row => row.metrics.top_1_correct)) / total : null,
    top_3_accuracy: total ? sum(rows.map(row => row.metrics.top_3_correct)) / total : null,
    top_5_accuracy: total ? sum(rows.map(row => row.metrics.top_5_correct)) / total : null,
    top_1_correct: sum(rows.map(row => row.metrics.top_1_correct)),
    top_3_correct: sum(rows.map(row => row.metrics.top_3_correct)),
    top_5_correct: sum(rows.map(row => row.metrics.top_5_correct)),
    average_ground_truth_rank: complete && weight > 0 ? sum(rankRows.map(row => row.metrics.average_ground_truth_rank! * (row.metrics.ground_truth_rank_count ?? row.count))) / weight : null,
    ground_truth_rank_count: weight,
    // Batch medians cannot be averaged. Preserve only a single batch's supplied median.
    ...(rankRows.length === 1 && rankRows[0].metrics.median_ground_truth_rank !== undefined ? { median_ground_truth_rank: rankRows[0].metrics.median_ground_truth_rank } : {}),
  };
}
export function aggregateBatches(batches: BatchResult[]) {
  const summaries = batches.map(batch => batch.response.summary);
  const summary: EvaluationSummary = {
    records_received: sum(summaries.map(row => row.records_received)), records_evaluated: sum(summaries.map(row => row.records_evaluated)), unknown_ground_truth_records: sum(summaries.map(row => row.unknown_ground_truth_records)),
    without_latent: aggregatePass(summaries.map(row => ({ metrics: row.without_latent, count: row.records_evaluated }))), with_latent: aggregatePass(summaries.map(row => ({ metrics: row.with_latent, count: row.records_evaluated }))),
    comparison: { improved_records: sum(summaries.map(row => row.comparison.improved_records)), worsened_records: sum(summaries.map(row => row.comparison.worsened_records)), unchanged_records: sum(summaries.map(row => row.comparison.unchanged_records)) },
    ...(summaries.length && summaries.every(row => row.unknown_model_features !== undefined) ? { unknown_model_features: sum(summaries.map(row => row.unknown_model_features!)) } : {}),
  };
  const groups = new Map<string, DiagnosisMetrics[]>();
  for (const batch of batches) for (const row of batch.response.per_diagnosis ?? []) groups.set(row.diagnosis, [...(groups.get(row.diagnosis) ?? []), row]);
  const per_diagnosis = [...groups.entries()].map(([diagnosis, rows]) => ({ diagnosis, support: sum(rows.map(row => row.support)), without_latent: aggregatePass(rows.map(row => ({ metrics: row.without_latent, count: row.support }))), with_latent: aggregatePass(rows.map(row => ({ metrics: row.with_latent, count: row.support }))) }));
  const records = batches.flatMap(batch => (batch.response.records ?? []).map(row => ({ ...row, record_index: batch.sourceIndices[row.record_index] })));
  // Exact global medians are possible only with complete record-level ranks.
  for (const key of ['without_latent', 'with_latent'] as const) {
    const ranks = records.filter(row => row.outcome !== 'unknown').map(row => row[key]?.ground_truth_rank);
    if (ranks.length === summary.records_evaluated && ranks.length > 0 && ranks.every((value): value is number => typeof value === 'number')) {
      ranks.sort((a,b) => a-b); const middle = Math.floor(ranks.length / 2);
      summary[key].median_ground_truth_rank = ranks.length % 2 ? ranks[middle] : (ranks[middle - 1] + ranks[middle]) / 2;
    }
  }
  return { summary, per_diagnosis, records, diagnosisDetailsComplete: batches.length > 0 && batches.every(batch => batch.response.per_diagnosis !== undefined && batch.response.per_diagnosis.reduce((n,row) => n + row.support, 0) === batch.response.summary.records_evaluated) };
}
export const accuracy = (correct: number, total: number): number | null => total ? correct / total : null;
