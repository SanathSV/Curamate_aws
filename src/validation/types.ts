import type { InferenceOptions } from '../types/inference';
import type { RulesOutput } from '../types/rules';

export interface EvaluationRecord {
  age?: number;
  gender: string;
  current_symptoms: string[];
  history: string[];
  vitals?: { bp?: string; hr?: number };
  concluded_diagnosis: string;
}
export interface InspectedRecord { index: number; raw: unknown; record?: EvaluationRecord; errors: string[]; warnings: string[] }
// This is the ONLY record shape sent to the latent worker. No ground-truth field.
export interface LatentInput { index: number; symptoms: string[]; gender: string; history: string[] }
export interface LatentOutput { index: number; latent: string[]; unknownSymptoms: string[]; unknownContexts: string[]; truncated: boolean }
export interface PreparedRecord { index: number; record: EvaluationRecord & { latent_symptoms: string[] }; generation: LatentOutput }
export interface LabSettings { inference: InferenceOptions; latentLimit: number; diagnosisTopK: number; batchSize: number }
export interface EvaluationRequest { diagnosis_top_k: number; records: PreparedRecord['record'][] }
export interface PassMetrics {
  top_1_correct: number; top_3_correct: number; top_5_correct: number;
  average_ground_truth_rank: number | null;
  top_1_accuracy?: number | null; top_3_accuracy?: number | null; top_5_accuracy?: number | null;
  ground_truth_rank_count?: number;
  median_ground_truth_rank?: number | null;
}
export interface EvaluationSummary {
  records_received: number; records_evaluated: number; unknown_ground_truth_records: number;
  without_latent: PassMetrics; with_latent: PassMetrics;
  comparison: { improved_records: number; worsened_records: number; unchanged_records: number };
  unknown_model_features?: number;
}
export interface Prediction { rank: number; diagnosis: string; score?: number }
export interface RecordPass { ground_truth_rank: number | null; diagnoses: Prediction[] }
export type Outcome = 'improved' | 'worsened' | 'unchanged' | 'unknown';
export interface EvaluationDetail {
  record_index: number; outcome: Outcome;
  without_latent?: RecordPass; with_latent?: RecordPass;
  unknown_model_features?: string[];
}
export interface DiagnosisMetrics { diagnosis: string; support: number; without_latent: PassMetrics; with_latent: PassMetrics }
export interface EvaluationResponse { summary: EvaluationSummary; records?: EvaluationDetail[]; per_diagnosis?: DiagnosisMetrics[] }
export interface BatchResult { index: number; sourceIndices: number[]; response: EvaluationResponse }
export type GenerationRequest = { data: RulesOutput; inputs: LatentInput[]; options: InferenceOptions; latentLimit: number };
export type GenerationResponse = { type: 'progress'; output: LatentOutput; processed: number } | { type: 'complete' } | { type: 'error'; message: string };
