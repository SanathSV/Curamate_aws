import { EvaluationBatchError } from './errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RulesOutput } from '../types/rules';
import type { BatchResult, GenerationResponse, InspectedRecord, LabSettings, LatentOutput, PreparedRecord } from './types';
import { inspectDataset, latentInputs, prepareRecords } from './dataset';
import { evaluateBatch, EVALUATION_URL } from './api';
import { aggregateBatches } from './aggregate';
export type LabPhase = 'upload' | 'reading' | 'inspect' | 'generate' | 'review' | 'evaluate' | 'paused' | 'failed' | 'results';
export function useValidationLab(data: RulesOutput | null, initialSettings: LabSettings) {
  const [phase, setPhase] = useState<LabPhase>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<InspectedRecord[]>([]);
  const [settings, setSettings] = useState<LabSettings>(() => structuredClone(initialSettings));
  const [prepared, setPrepared] = useState<PreparedRecord[]>([]);
  const [progress, setProgress] = useState({ processed: 0, latent: 0, unchanged: 0 });
  const [batches, setBatches] = useState<BatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejectedRecords, setRejectedRecords] = useState<{ sourceIndex: number | null; reason: string }[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<{ settings: LabSettings; rules: RulesOutput['metadata']; timestamp: string } | null>(null);
  const worker = useRef<Worker | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const autoEvaluate = useRef(false);
  const savedBatches = useRef<BatchResult[]>([]);
  const validRows = useMemo(() => rows.filter(row => row.record), [rows]);
  const aggregate = useMemo(() => aggregateBatches(batches), [batches]);
  const busy = ['reading','generate','evaluate'].includes(phase);
  function stop() { autoEvaluate.current = false; generation.current++; worker.current?.terminate(); worker.current = null; request.current?.abort(); request.current = null; }
  useEffect(() => () => { worker.current?.terminate(); request.current?.abort(); generation.current++; }, []);
  function clearRun() { setPrepared([]); setBatches([]); savedBatches.current = []; setError(null); setRejectedRecords([]); setSnapshot(null); setStartedAt(null); setFinishedAt(null); setProgress({ processed: 0, latent: 0, unchanged: 0 }); }
  async function upload(file: File) {
    stop(); clearRun(); setRows([]); setFileName(file.name); setPhase('reading'); const id = generation.current;
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a .json file.');
      if (file.size > 50 * 1024 * 1024) throw new Error('Please split files larger than 50 MB into smaller datasets.');
      const text = await file.text(); if (id !== generation.current) return;
      let input: unknown; try { input = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Check its commas, quotes, and brackets.'); }
      const inspected = inspectDataset(input); setRows(inspected); setPhase('inspect');
    } catch (reason) { if (id === generation.current) { setError(reason instanceof Error ? reason.message : 'Could not read this file.'); setPhase('upload'); } }
  }
  function generate(runEvaluation = false) {
    if (!data || !validRows.length || busy) return;
    stop(); clearRun(); const id = generation.current;
    autoEvaluate.current = runEvaluation;
    setPhase('generate');
    setSnapshot({ settings: structuredClone(settings), rules: structuredClone(data.metadata), timestamp: new Date().toISOString() });
    const outputs: LatentOutput[] = [];
    try {
      const current = new Worker(new URL('./generation.worker.ts', import.meta.url), { type: 'module' }); worker.current = current;
      const fail = (message: string) => { if (id !== generation.current) return; current.terminate(); worker.current = null; setError(message); setPhase('inspect'); };
      current.onerror = () => fail('The generation worker stopped unexpectedly. Try generating again.');
      current.onmessage = ({ data: message }: MessageEvent<GenerationResponse>) => {
        if (id !== generation.current) return;
        if (message.type === 'error') { fail(message.message); return; }
        if (message.type === 'progress') {
          outputs.push(message.output);
          setProgress(previous => ({ processed: message.processed, latent: previous.latent + message.output.latent.length, unchanged: previous.unchanged + (message.output.latent.length ? 0 : 1) }));
        } else {
          try { setPrepared(prepareRecords(validRows, outputs)); current.terminate(); worker.current = null; setPhase('review'); }
          catch (reason) { fail(reason instanceof Error ? reason.message : 'Generation was incomplete.'); }
        }
      };
      current.postMessage({ data, inputs: latentInputs(validRows), options: settings.inference, latentLimit: settings.latentLimit });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start generation.'); setPhase('inspect'); }
  }
  async function evaluate(resume = false) {
    if (busy || !prepared.length || !snapshot) return;
    stop(); const id = generation.current; const controller = new AbortController(); request.current = controller;
    if (!resume) { savedBatches.current = []; setBatches([]); setStartedAt(Date.now()); }
    setFinishedAt(null); setError(null); setRejectedRecords([]); setPhase('evaluate');
    const completed = [...savedBatches.current];
    const batchSize = settings.batchSize;
    // Settings are locked after the first submitted batch, so retry always resends the same slice.
    setSnapshot(previous => previous ? { ...previous, settings: structuredClone(settings) } : previous);
    try {
      for (let index = completed.length; index < Math.ceil(prepared.length / batchSize); index++) {
        const portion = prepared.slice(index * batchSize, (index + 1) * batchSize);
        const response = await evaluateBatch({ diagnosis_top_k: settings.diagnosisTopK, records: portion.map(row => row.record) }, controller.signal);
        if (id !== generation.current) return;
        completed.push({ index, sourceIndices: portion.map(row => row.index), response });
        savedBatches.current = [...completed]; setBatches([...completed]);
      }
      setFinishedAt(Date.now()); setPhase('results');
    } catch (reason) {
      if (id !== generation.current) return;
      if (reason instanceof EvaluationBatchError) {
        const portion = prepared.slice(completed.length * batchSize, (completed.length + 1) * batchSize);
        setRejectedRecords(reason.invalidRecords.map(row => ({ sourceIndex: row.recordIndex === null ? null : portion[row.recordIndex]?.index ?? null, reason: row.reason })));
      }
      setError(`Batch ${completed.length + 1} failed: ${reason instanceof Error ? reason.message : 'Unknown evaluation error.'}`); setFinishedAt(Date.now()); setPhase('failed');
    }
  }
  function startValidation() {
    if (!EVALUATION_URL) { setError('Configure VITE_LAMBDA4_EVALUATION_URL before starting validation.'); return; }
    generate(true);
  }
  useEffect(() => {
    if (phase === 'review' && autoEvaluate.current) {
      autoEvaluate.current = false;
      void evaluate();
    }
  }, [phase, prepared, snapshot]);
  function cancel() {
    stop();
    if (phase === 'evaluate') { setFinishedAt(Date.now()); setPhase('paused'); }
    else { setProgress({ processed: 0, latent: 0, unchanged: 0 }); setPhase('inspect'); setError('Generation cancelled. Original records are unchanged; generate again when ready.'); }
  }
  function again() { stop(); clearRun(); setPhase('inspect'); }
  function newDataset() { stop(); clearRun(); setRows([]); setFileName(''); setPhase('upload'); }
  function report() {
    const details = new Map(aggregate.records.map(row => [row.record_index, row]));
    return { metadata: { timestamp: new Date().toISOString(), experiment_started: snapshot?.timestamp, file_name: fileName, complete: phase === 'results', records_uploaded: rows.length, records_evaluated: aggregate.summary.records_evaluated, diagnosis_top_k: snapshot?.settings.diagnosisTopK, batch_size: snapshot?.settings.batchSize, latent_settings: { ...snapshot?.settings.inference, latent_limit: snapshot?.settings.latentLimit, rule_configuration: snapshot?.rules.configuration }, rules_metadata: snapshot?.rules, completed_batches: batches.length }, summary: aggregate.summary, per_diagnosis: aggregate.per_diagnosis, per_diagnosis_complete: aggregate.diagnosisDetailsComplete, records: prepared.map(row => ({ ...row.record, source_record_index: row.index, generation: row.generation, evaluation: details.get(row.index) ?? null })), rejected_records: rejectedRecords, input_issues: rows.filter(row => row.errors.length || row.warnings.length).map(row => ({ source_record_index: row.index, errors: row.errors, warnings: row.warnings })), batches };
  }
  return { phase, fileName, rows, validRows, settings, setSettings, prepared, progress, batches, aggregate, error, rejectedRecords, startedAt, finishedAt, snapshot, busy, upload, generate, startValidation, evaluate, cancel, again, newDataset, report };
}
export type Lab = ReturnType<typeof useValidationLab>;
