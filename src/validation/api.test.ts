// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvaluationRequest } from './types';
const request:EvaluationRequest={diagnosis_top_k:5,records:[{gender:'female',current_symptoms:['a'],latent_symptoms:['b'],history:[],concluded_diagnosis:'truth'}]};
const metrics={top_1_correct:1,top_3_correct:1,top_5_correct:1,average_ground_truth_rank:1};
const response={summary:{records_received:1,records_evaluated:1,unknown_ground_truth_records:0,without_latent:metrics,with_latent:metrics,comparison:{improved_records:0,worsened_records:0,unchanged_records:1}}};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
describe('Lambda 4 transport',()=>{
  it('surfaces structured 400 rejections without accepting any partial metrics',async()=>{
    vi.stubEnv('VITE_LAMBDA4_EVALUATION_URL','https://evaluation.example.test');vi.resetModules();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:400,json:async()=>({error:'Batch validation failed',invalid_records:[{record_index:0,error:'latent_symptoms exceeds MAX_LATENT_SYMPTOMS'}],summary:response.summary})}));
    const {evaluateBatch}=await import('./api');
    await expect(evaluateBatch(request,new AbortController().signal)).rejects.toMatchObject({status:400,invalidRecords:[{recordIndex:0,reason:'latent_symptoms exceeds MAX_LATENT_SYMPTOMS'}],message:expect.stringContaining('No records from this batch were counted')});
  });
  it('preserves HTTP status when the gateway returns non-JSON errors',async()=>{
    vi.stubEnv('VITE_LAMBDA4_EVALUATION_URL','https://evaluation.example.test');vi.resetModules();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403,json:async()=>{throw new Error('HTML');}}));
    const {evaluateBatch}=await import('./api');
    await expect(evaluateBatch(request,new AbortController().signal)).rejects.toThrow('HTTP 403');
  });
  it('requires its own endpoint instead of falling back to the diagnosis API',async()=>{
    vi.stubEnv('VITE_LAMBDA4_EVALUATION_URL','');vi.stubEnv('VITE_DIAGNOSIS_API_URL','https://diagnosis.example.test');vi.resetModules();
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const {evaluateBatch}=await import('./api');
    await expect(evaluateBatch(request,new AbortController().signal)).rejects.toThrow('VITE_LAMBDA4_EVALUATION_URL');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('posts the exact batch with separate originals and generated symptoms',async()=>{
    vi.stubEnv('VITE_LAMBDA4_EVALUATION_URL','https://evaluation.example.test');vi.resetModules();
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>response});vi.stubGlobal('fetch',fetch);
    const {evaluateBatch}=await import('./api');
    await evaluateBatch(request,new AbortController().signal);
    expect(fetch.mock.calls[0][0]).toBe('https://evaluation.example.test/');
    const options=fetch.mock.calls[0][1];
    expect(options.method).toBe('POST');expect(options.credentials).toBe('omit');expect(JSON.parse(options.body)).toEqual(request);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
