import { describe, expect, it } from 'vitest';
import { buildDiagnosisRequest, overallDiagnosticCandidates } from './diagnosisRequest';
import type { DiagnosisResponse } from '../types/diagnosis';

describe('diagnosis request preparation', () => {
  it('matches the Lambda 3 payload and preserves the original symptoms separately', () => {
    const original = ['A', 'B', 'C'];
    const request = buildDiagnosisRequest(original, 'female', ['HIV', 'autoimmune disease'], 3, [['a', 'b', 'c', 'D'], ['a', 'b', 'c', 'E'], ['a', 'b', 'c', 'F']]);
    expect(request).toEqual({ current_symptoms: ['A', 'B', 'C'], gender: 'female', history: ['HIV', 'autoimmune disease'], diagnosis_top_k: 3, symptom_combinations: [['A', 'B', 'C'], ['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'E'], ['A', 'B', 'C', 'F']] });
    expect(original).toEqual(['A', 'B', 'C']);
  });
  it('sends only the original combination when there are no latent additions', () => {
    expect(buildDiagnosisRequest(['C', 'A', 'B'], null, [], 7, []).symptom_combinations).toEqual([['C', 'A', 'B']]);
  });
  it('deduplicates combinations and keeps diagnosis K independent of their number', () => {
    const request = buildDiagnosisRequest(['A', 'B'], 'female', [], 2, [['A', 'B'], ['b', 'D', 'a'], ['A', 'B', 'd']]);
    expect(request.symptom_combinations).toEqual([['A', 'B'], ['A', 'B', 'D']]);
    expect(buildDiagnosisRequest(['A', 'B'], 'female', [], 10, request.symptom_combinations).symptom_combinations).toEqual(request.symptom_combinations);
    expect(Object.keys(request).sort()).toEqual(['current_symptoms', 'diagnosis_top_k', 'gender', 'history', 'symptom_combinations']);
  });
  it('rejects invalid K, context-as-symptoms, and combinations missing original symptoms', () => {
    for (const k of [0, -1, 1.5, NaN, Infinity]) expect(() => buildDiagnosisRequest(['A'], null, [], k, [])).toThrow('positive whole');
    expect(() => buildDiagnosisRequest([], null, [], 3, [])).toThrow('current symptom');
    expect(() => buildDiagnosisRequest(['A'], null, [], 3, [['A', 'gender:female']])).toThrow('Invalid generated');
    expect(() => buildDiagnosisRequest(['A', 'B'], null, [], 3, [['A', 'D']])).toThrow('original symptom');
  });
});

describe('overall diagnostic candidates', () => {
  it('deduplicates by highest API probability, with source combination and original API percentage', () => {
    const response: DiagnosisResponse = { results: [
      { combination_index: 0, symptoms: ['A', 'B', 'C'], diagnoses: [
        { rank: 1, diagnosis: 'diagnosis_x', probability: .52, percentage: 52 },
        { rank: 2, diagnosis: 'diagnosis_y', probability: .31, percentage: 31 },
      ] },
      { combination_index: 1, symptoms: ['A', 'B', 'C', 'D'], diagnoses: [
        { rank: 1, diagnosis: 'diagnosis_m', probability: .61, percentage: 61 },
        { rank: 2, diagnosis: 'diagnosis_x', probability: .22, percentage: 22 },
      ] },
    ] };
    const overall = overallDiagnosticCandidates(response);
    expect(overall.map(row => row.diagnosis)).toEqual(['diagnosis_m', 'diagnosis_x', 'diagnosis_y']);
    expect(overall[0]).toMatchObject({ probability: .61, percentage: 61, source_combination_index: 1, source_symptoms: ['A', 'B', 'C', 'D'] });
    expect(overall[1]).toMatchObject({ probability: .52, source_combination_index: 0 });
    expect(response.results[0].diagnoses).toHaveLength(2);
  });
  it('handles empty results and deterministic ties without accumulating scores', () => {
    expect(overallDiagnosticCandidates({ results: [] })).toEqual([]);
    const diagnoses = [{ rank: 1, diagnosis: 'X', probability: .5, percentage: 50 }];
    const result = overallDiagnosticCandidates({ results: [{ combination_index: 1, symptoms: ['B'], diagnoses }, { combination_index: 0, symptoms: ['A'], diagnoses }] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ probability: .5, source_combination_index: 0 });
  });
});
