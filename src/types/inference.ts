import type { Rule } from './rules';
import type { PathSearchResult } from '../inference/paths';
export interface InferenceOptions { minScore: number; maxDepth: number; topK: number; associationMode?: 'pairwise' | 'combined' }
export interface EvidencePath {
  id: string;
  antecedents: string[];
  consequent: string;
  rule: Rule;
  parentScore: number;
  inferenceScore: number;
  depth: number;
  lineage: string[];
}
export interface Candidate {
  symptom: string;
  depth: number;
  inferenceScore: number;
  bestEvidence: EvidencePath;
  evidence: EvidencePath[];
}
export interface InferenceResult {
  paths?: PathSearchResult;
  observed: string[];
  candidates: Candidate[];
  evaluatedAntecedents: number;
  durationMs: number;
  depthsExplored: number;
  truncated: boolean;
  options: InferenceOptions;
}
export const DEFAULT_OPTIONS: InferenceOptions = { minScore: .7, maxDepth: 3, topK: 5, associationMode: 'pairwise' };
