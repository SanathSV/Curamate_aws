// @vitest-environment jsdom
import { createElement } from 'react';
import { ValidationLab } from '../components/validation/ValidationLab';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useValidationLab } from './useValidationLab';
import { EvaluationBatchError } from './errors';
import { evaluateBatch } from './api';
import { dataset, rule } from '../test/fixtures';
import { DEFAULT_OPTIONS } from '../types/inference';
import type { EvaluationRequest, EvaluationResponse, GenerationRequest, GenerationResponse } from './types';
vi.mock('./api', () => ({ evaluateBatch: vi.fn(), EVALUATION_URL: 'https://evaluation.example.test' }));
class FakeWorker {
  static current: FakeWorker;
  onmessage: ((event: {data:GenerationResponse}) => void) | null = null;
  onerror: (() => void) | null = null;
  posted?: GenerationRequest;
  terminated=false;
  constructor() { FakeWorker.current=this; }
  postMessage(message:GenerationRequest) { this.posted=message; }
  terminate() { this.terminated=true; }
  finish() {
    this.posted!.inputs.forEach((input,index) => this.onmessage?.({data:{type:'progress',processed:index+1,output:{index:input.index,latent:['b'],unknownSymptoms:[],unknownContexts:[],truncated:false}}}));
    this.onmessage?.({data:{type:'complete'}});
  }
}
const data=dataset([[['a'],[rule('b',.8)]]]);
const settings={inference:DEFAULT_OPTIONS,latentLimit:10,diagnosisTopK:5,batchSize:2};
function successful(request:EvaluationRequest):EvaluationResponse { const count=request.records.length; const pass={top_1_correct:count,top_3_correct:count,top_5_correct:count,average_ground_truth_rank:1}; return {summary:{records_received:count,records_evaluated:count,unknown_ground_truth_records:0,without_latent:pass,with_latent:pass,comparison:{improved_records:0,worsened_records:0,unchanged_records:count}}}; }
async function setup() {
  const hook=renderHook(() => useValidationLab(data,settings));
  const raw=Array.from({length:3},(_,index)=>({gender:'female',current_symptoms:['a'],history:[],concluded_diagnosis:`truth ${index}`}));
  const file={name:'records.json',size:100,text:async()=>JSON.stringify(raw)} as File;
  await act(async()=>{await hook.result.current.upload(file);});
  act(()=>hook.result.current.generate());
  return hook;
}
beforeEach(()=>{vi.stubGlobal('Worker',FakeWorker); vi.mocked(evaluateBatch).mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Validation Lab orchestration',()=>{
  it('shows JSON guidance and parameters up front, then completes generation and evaluation with one click', async()=>{
    render(createElement(ValidationLab,{data,options:DEFAULT_OPTIONS,latentLimit:10}));
    expect(screen.getByRole('heading',{name:'Expected JSON structure'})).toBeTruthy();
    expect(screen.getByLabelText('Example evaluation dataset JSON').textContent).toContain('current_symptoms');
    expect(screen.getByRole('button',{name:'Download example JSON'})).toBeTruthy();
    expect((screen.getByRole('button',{name:'Start validation'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Latent symptom limit'),{target:{value:'7'}});
    fireEvent.change(screen.getByLabelText('Batch size'),{target:{value:'1'}});
    fireEvent.change(screen.getByLabelText('Diagnosis Top-K'),{target:{value:'8'}});
    const file={name:'records.json',size:100,text:async()=>JSON.stringify([{gender:'female',current_symptoms:['a'],history:[],concluded_diagnosis:'truth'},null])} as File;
    fireEvent.change(screen.getByLabelText('Evaluation dataset JSON'),{target:{files:[file]}});
    const start=await screen.findByRole('button',{name:'Start validation (1 valid records)'});
    expect(screen.getByText(/1 invalid records will be excluded/)).toBeTruthy();
    expect(evaluateBatch).not.toHaveBeenCalled();
    vi.mocked(evaluateBatch).mockImplementation(async request=>successful(request));
    fireEvent.click(start);
    expect(FakeWorker.current.posted?.latentLimit).toBe(7);
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
    act(()=>FakeWorker.current.finish());
    await screen.findByText('VALIDATION COMPLETE');
    expect(evaluateBatch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(evaluateBatch).mock.calls[0][0].diagnosis_top_k).toBe(8);
    expect(screen.getByRole('button',{name:'Download Evaluation Report'})).toBeTruthy();
    expect(screen.getByText('Review generated latent symptoms')).toBeTruthy();
  });
  it('cancels the automatic flow before any evaluation is sent',async()=>{
    const hook=await setup();
    act(()=>hook.result.current.cancel());
    act(()=>hook.result.current.startValidation());
    const worker=FakeWorker.current;
    act(()=>hook.result.current.cancel());
    act(()=>worker.finish());
    expect(evaluateBatch).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toBe('inspect');
  });
  it('does not send labels to its worker and waits for review before calling the evaluation endpoint',async()=>{
    const hook=await setup();
    expect(JSON.stringify(FakeWorker.current.posted?.inputs)).not.toContain('truth');
    act(()=>FakeWorker.current.finish());
    expect(hook.result.current.phase).toBe('review'); expect(evaluateBatch).not.toHaveBeenCalled();
    expect(hook.result.current.prepared[0].record.current_symptoms).toEqual(['a']);
    expect(hook.result.current.prepared[0].record.latent_symptoms).toEqual(['b']);
    vi.mocked(evaluateBatch).mockImplementation(async request=>successful(request));
    await act(async()=>{await hook.result.current.evaluate();});
    expect(evaluateBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(evaluateBatch).mock.calls[0][0].records).toHaveLength(2);
    expect(vi.mocked(evaluateBatch).mock.calls[1][0].records).toHaveLength(1);
    expect(hook.result.current.phase).toBe('results');
    expect(hook.result.current.aggregate.summary.records_evaluated).toBe(3);
  });
  it('maps rejected batch records to original upload rows and preserves successful counts',async()=>{
    const hook=await setup(); act(()=>FakeWorker.current.finish());
    vi.mocked(evaluateBatch).mockImplementationOnce(async request=>successful(request)).mockRejectedValueOnce(new EvaluationBatchError('Invalid records',400,[{recordIndex:0,reason:'Too many latent symptoms'}]));
    await act(async()=>{await hook.result.current.evaluate();});
    expect(hook.result.current.rejectedRecords).toEqual([{sourceIndex:2,reason:'Too many latent symptoms'}]);
    expect(hook.result.current.aggregate.summary.records_received).toBe(2);
    expect(hook.result.current.report().rejected_records).toHaveLength(1);
    vi.mocked(evaluateBatch).mockImplementation(async request=>successful(request));
    await act(async()=>{await hook.result.current.evaluate(true);});
    expect(hook.result.current.rejectedRecords).toEqual([]);
    expect(hook.result.current.aggregate.summary.records_received).toBe(3);
  });
  it('retains successful batches and retries only the failed slice',async()=>{
    const hook=await setup(); act(()=>FakeWorker.current.finish());
    vi.mocked(evaluateBatch).mockImplementationOnce(async request=>successful(request)).mockRejectedValueOnce(new Error('network failed'));
    await act(async()=>{await hook.result.current.evaluate();});
    expect(hook.result.current.phase).toBe('failed'); expect(hook.result.current.batches).toHaveLength(1);
    vi.mocked(evaluateBatch).mockImplementation(async request=>successful(request));
    await act(async()=>{await hook.result.current.evaluate(true);});
    expect(evaluateBatch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(evaluateBatch).mock.calls[2][0].records[0].concluded_diagnosis).toBe('truth 2');
    expect(hook.result.current.aggregate.summary.records_received).toBe(3);
  });
  it('cancels generation and ignores late worker messages',async()=>{
    const hook=await setup(); const worker=FakeWorker.current;
    act(()=>hook.result.current.cancel()); act(()=>worker.finish());
    expect(worker.terminated).toBe(true); expect(hook.result.current.prepared).toEqual([]); expect(hook.result.current.phase).toBe('inspect');
  });
  it('aborts an in-flight evaluation without losing completed batches or accepting a late response',async()=>{
    const hook=await setup(); act(()=>FakeWorker.current.finish());
    let resolve!: (value:EvaluationResponse)=>void;
    vi.mocked(evaluateBatch).mockImplementationOnce(async request=>successful(request)).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
    let pending!:Promise<void>; act(()=>{pending=hook.result.current.evaluate();});
    await waitFor(()=>expect(evaluateBatch).toHaveBeenCalledTimes(2));
    act(()=>hook.result.current.cancel());
    expect(vi.mocked(evaluateBatch).mock.calls[1][1].aborted).toBe(true);
    await act(async()=>{resolve(successful(vi.mocked(evaluateBatch).mock.calls[1][0]));await pending;});
    expect(hook.result.current.phase).toBe('paused'); expect(hook.result.current.batches).toHaveLength(1);
    act(()=>hook.result.current.again()); expect(hook.result.current.rows).toHaveLength(3); expect(hook.result.current.batches).toEqual([]);
  });
});
