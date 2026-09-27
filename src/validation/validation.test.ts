import { describe, expect, it } from 'vitest';
import { inspectDataset, latentInputs, prepareRecords } from './dataset';
import { generateLatent } from './generate';
import { aggregateBatches } from './aggregate';
import { parseEvaluationResponse } from './api';
import { dataset, rule } from '../test/fixtures';
import { DEFAULT_OPTIONS } from '../types/inference';
import { infer } from '../inference/engine';
import { InMemoryRuleSource } from '../api/rulesApi';
import { buildRagCombinations } from '../inference/ragCombinations';
import type { EvaluationResponse } from './types';
const record = () => ({ age: 28, gender: 'female', current_symptoms: [' A ', 'a'], history: [], concluded_diagnosis: 'truth' });
function response(total: number, correct: number, average: number): EvaluationResponse {
  const metrics = { top_1_correct: correct, top_3_correct: correct, top_5_correct: correct, average_ground_truth_rank: average };
  return { summary: { records_received: total, records_evaluated: total, unknown_ground_truth_records: 0, without_latent: { ...metrics }, with_latent: { ...metrics }, comparison: { improved_records: 0, worsened_records: 0, unchanged_records: total } } };
}
describe('dataset inspection and label isolation', () => {
  it('rejects invalid roots and retains malformed records with explicit issues', () => {
    expect(() => inspectDataset({ records: [] })).toThrow('array');
    const rows = inspectDataset([null, { current_symptoms: 'a', history: 'bad', vitals: [] }, record()]);
    expect(rows).toHaveLength(3); expect(rows[0].errors[0]).toContain('object');
    expect(rows[1].errors).toHaveLength(5); expect(rows[2].record).toBeDefined(); expect(rows[2].warnings).toHaveLength(2);
  });
  it('projects only allowed fields into the generation input even if raw data has extra labels', () => {
    const rows = inspectDataset([{ ...record(), diagnosis_hint: 'leak', latent_symptoms: ['leak'] }]);
    expect(latentInputs(rows)).toEqual([{ index: 0, symptoms: [' A ','a'], gender: 'female', history: [] }]);
    expect(JSON.stringify(latentInputs(rows))).not.toContain('truth');
  });
  it('preserves original symptom spelling, order and duplicates while deduplicating generated symptoms', () => {
    const original=record(); const rows=inspectDataset([original]);
    const result=prepareRecords(rows,[{ index: 0, latent: ['a',' X ','x'], unknownSymptoms: [], unknownContexts: [], truncated: false }]);
    expect(result[0].record.current_symptoms).toEqual([' A ','a']); expect(result[0].record.latent_symptoms).toEqual(['x']);
    result[0].record.current_symptoms.push('modified'); expect(original.current_symptoms).toEqual([' A ','a']);
    expect(() => prepareRecords(rows,[])).toThrow('incomplete');
  });
  it('uses the same inference engine and candidate limit as the diagnostic workflow', async () => {
    const data=dataset([[['a'],[rule('b',.8,{ occurrences:400,antecedent_occurrences:500 })]], [['b'],[rule('c',.9,{ occurrences:450,antecedent_occurrences:500 })]]]);
    const input={ index:0,symptoms:['a'],gender:'female',history:[] };
    const actual=await generateLatent(data,input,DEFAULT_OPTIONS,10);
    const existing=await infer(new InMemoryRuleSource(data),['a'],DEFAULT_OPTIONS,undefined,[],true);
    expect(actual.latent).toEqual(buildRagCombinations(existing,10).combinations.map(row => row.addedSymptom));
    const changed=inspectDataset([{...record(), concluded_diagnosis:'another truth'}]);
    expect((await generateLatent(data,latentInputs(changed)[0],DEFAULT_OPTIONS,10)).latent).toEqual(actual.latent);
    const unknown=await generateLatent(data,{...input,symptoms:['unlisted']},DEFAULT_OPTIONS,10);
    expect(unknown.latent).toEqual([]); expect(unknown.unknownSymptoms).toEqual(['unlisted']);
  });
});
describe('evaluation response validation and aggregation', () => {
  it('uses raw integer counts even when supplied percentages disagree', () => {
    const input=response(3,1,2);
    input.summary.without_latent.top_1_accuracy=.99;
    const parsed=parseEvaluationResponse(input,3);
    const result=aggregateBatches([{index:0,sourceIndices:[0,1,2],response:parsed}]);
    expect(result.summary.without_latent.top_1_correct).toBe(1);
    expect(result.summary.without_latent.top_1_accuracy).toBeCloseTo(1/3);
  });
  it('reads the server outcome even when rank details are absent', () => {
    const input=response(1,1,1);
    input.summary.comparison={improved_records:1,worsened_records:0,unchanged_records:0};
    input.records=[{record_index:0,outcome:'improved'}];
    expect(parseEvaluationResponse(input,1).records?.[0].outcome).toBe('improved');
  });
  it('sums counts and weights ranks by record counts, never averaging batch percentages', () => {
    const batches=[{ index:0,sourceIndices:Array.from({length:100},(_,i)=>i),response:response(100,40,6) },{ index:1,sourceIndices:[100],response:response(1,1,1) }];
    const aggregate=aggregateBatches(batches);
    expect(aggregate.summary.without_latent.top_1_correct).toBe(41);
    expect(aggregate.summary.records_evaluated).toBe(101);
    expect(aggregate.summary.without_latent.average_ground_truth_rank).toBeCloseTo(601/101);
    expect(aggregate.summary.without_latent.median_ground_truth_rank).toBeUndefined();
  });
  it('uses explicit rank sample counts and maps batch-local record indices back to source rows', () => {
    const first=response(2,1,3), second=response(1,1,1);
    first.summary.without_latent.ground_truth_rank_count=1;
    first.records=[{record_index:1,outcome:'unchanged'}];
    const aggregate=aggregateBatches([{index:0,sourceIndices:[4,9],response:first},{index:1,sourceIndices:[15],response:second}]);
    expect(aggregate.summary.without_latent.average_ground_truth_rank).toBe(2);
    expect(aggregate.records[0].record_index).toBe(9);
  });
  it('excludes unknown labels from accuracy and rejects inconsistent batch counts', () => {
    const input=response(2,1,2); input.summary.records_received=3; input.summary.unknown_ground_truth_records=1;
    expect(parseEvaluationResponse(input,3).summary.records_evaluated).toBe(2);
    expect(() => parseEvaluationResponse(input,2)).toThrow('submitted batch');
    input.summary.comparison.improved_records=1;
    expect(() => parseEvaluationResponse(input,3)).toThrow('outcome counts');
  });
  it('does not invent optional record details or rank metrics', () => {
    const input=response(1,0,1); input.summary.without_latent.average_ground_truth_rank=null;
    const parsed=parseEvaluationResponse({body:JSON.stringify(input)},1);
    expect(parsed.records).toBeUndefined(); expect(parsed.per_diagnosis).toBeUndefined();
    expect(aggregateBatches([{index:0,sourceIndices:[0],response:parsed}]).summary.without_latent.average_ground_truth_rank).toBeNull();
  });
  it('rejects duplicate record identities and impossible top-K counts', () => {
    const input=response(2,1,2); input.records=[{record_index:0,outcome:'unchanged'},{record_index:0,outcome:'unchanged'}];
    expect(() => parseEvaluationResponse(input,2)).toThrow('duplicate');
    delete input.records; input.summary.with_latent.top_1_correct=2;
    expect(() => parseEvaluationResponse(input,2)).toThrow('increase');
  });
});
