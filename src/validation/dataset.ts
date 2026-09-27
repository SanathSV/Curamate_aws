import { normalizeSymptom } from '../inference/canonicalize';
import type { EvaluationRecord, InspectedRecord, LatentInput, LatentOutput, PreparedRecord } from './types';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string' && !!x.trim());
export function inspectDataset(input: unknown): InspectedRecord[] {
  if (!Array.isArray(input)) throw new Error('The JSON must contain an array of records, starting with [ and ending with ].');
  if (!input.length) throw new Error('This file contains no records.');
  return input.map((raw, index) => {
    const errors: string[] = [], warnings: string[] = [];
    if (!object(raw)) return { index, raw, errors: ['Record must be a JSON object.'], warnings };
    if (typeof raw.concluded_diagnosis !== 'string' || !raw.concluded_diagnosis.trim()) errors.push('Missing concluded_diagnosis: a non-empty diagnosis is required.');
    if (!strings(raw.current_symptoms) || !raw.current_symptoms.length) errors.push('current_symptoms must be a non-empty array of symptom names.');
    if (raw.history !== undefined && !strings(raw.history)) errors.push('history must be an array of non-empty names.');
    if (raw.history === undefined) warnings.push('Missing history; an empty history will be used.');
    if (typeof raw.gender !== 'string' || !raw.gender.trim()) errors.push('Missing gender: a non-empty value is required.');
    if (raw.age !== undefined && (typeof raw.age !== 'number' || !Number.isFinite(raw.age) || raw.age < 0 || raw.age > 130)) errors.push('Age must be a number between 0 and 130.');
    if (raw.age === undefined) warnings.push('Age is missing; local latent generation does not use age.');
    if (raw.vitals === undefined) warnings.push('Vitals are missing; local latent generation does not use vitals.');
    else if (!object(raw.vitals) || (raw.vitals.bp !== undefined && typeof raw.vitals.bp !== 'string') || (raw.vitals.hr !== undefined && (typeof raw.vitals.hr !== 'number' || !Number.isFinite(raw.vitals.hr) || raw.vitals.hr <= 0))) errors.push('Malformed vitals: use an object with optional bp text and a positive numeric hr.');
    if (strings(raw.current_symptoms) && new Set(raw.current_symptoms.map(normalizeSymptom)).size < raw.current_symptoms.length) warnings.push('Repeated symptom names: originals will be preserved; generation uses unique normalized names.');
    if ('latent_symptoms' in raw) warnings.push('Existing latent_symptoms will be ignored and regenerated.');
    if (errors.length) return { index, raw, errors, warnings };
    const record: EvaluationRecord = {
      ...(raw.age !== undefined ? { age: raw.age as number } : {}), gender: raw.gender as string,
      current_symptoms: [...raw.current_symptoms as string[]], history: [...(raw.history as string[] ?? [])],
      ...(object(raw.vitals) ? { vitals: { ...(raw.vitals.bp !== undefined ? { bp: raw.vitals.bp as string } : {}), ...(raw.vitals.hr !== undefined ? { hr: raw.vitals.hr as number } : {}) } } : {}),
      concluded_diagnosis: raw.concluded_diagnosis as string,
    };
    return { index, raw, record, errors, warnings };
  });
}
export function latentInputs(rows: InspectedRecord[]): LatentInput[] {
  return rows.flatMap(({ index, record }) => record ? [{ index, symptoms: [...record.current_symptoms], gender: record.gender, history: [...record.history] }] : []);
}
export function prepareRecords(rows: InspectedRecord[], outputs: LatentOutput[]): PreparedRecord[] {
  const mapped = new Map(outputs.map(output => [output.index, output]));
  return rows.flatMap(({ index, record }) => {
    if (!record) return [];
    const generation = mapped.get(index);
    if (!generation) throw new Error('Latent generation is incomplete. Generate all records before evaluation.');
    const original = new Set(record.current_symptoms.map(normalizeSymptom));
    const latent = [...new Set(generation.latent.map(normalizeSymptom))].filter(name => name && !original.has(name));
    return [{ index, generation, record: { ...record, current_symptoms: [...record.current_symptoms], history: [...record.history], ...(record.vitals ? { vitals: { ...record.vitals } } : {}), latent_symptoms: latent } }];
  });
}
