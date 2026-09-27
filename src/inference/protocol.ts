import type { RulesOutput } from '../types/rules';
import type { InferenceOptions, InferenceResult } from '../types/inference';
export type WorkerRequest =
  | { type: 'initialize'; data: RulesOutput }
  | { type: 'infer'; id: number; observations: string[]; contexts: string[]; options: InferenceOptions; collectAllCandidates?: boolean }
  | { type: 'cancel' };
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; result: InferenceResult }
  | { type: 'error'; message: string; id?: number };
