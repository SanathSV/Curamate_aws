export interface DiagnosisRequest {
  current_symptoms: string[];
  gender: string | null;
  history: string[];
  diagnosis_top_k: number;
  symptom_combinations: string[][];
}
export interface DiagnosticCandidate {
  rank: number;
  diagnosis: string;
  probability: number;
  percentage: number;
}
export interface DiagnosisResponse {
  results: { combination_index: number; symptoms: string[]; diagnoses: DiagnosticCandidate[] }[];
  metadata?: { diagnosis_top_k: number; combinations_received: number; combinations_scored: number };
}
export interface OverallDiagnosticCandidate extends DiagnosticCandidate {
  source_combination_index: number;
  source_symptoms: string[];
}
