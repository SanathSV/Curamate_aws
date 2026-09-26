import type { RulesOutput } from '../types/rules';
import type { InferenceOptions, InferenceResult } from '../types/inference';
export type WorkerRequest =
  | { type: 'initialize'; data: RulesOutput }
  | { type: 'infer'; id: number; observed: string[]; options: InferenceOptions }
  | { type: 'cancel' };
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; result: InferenceResult }
  | { type: 'error'; message: string; id?: number };
