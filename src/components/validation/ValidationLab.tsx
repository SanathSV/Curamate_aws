import { useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Upload, LoaderCircle } from 'lucide-react';
import type { RulesOutput } from '../../types/rules';
import type { InferenceOptions } from '../../types/inference';
import { useValidationLab } from '../../validation/useValidationLab';
import type { Lab } from '../../validation/useValidationLab';
import { EVALUATION_URL } from '../../validation/api';
import { DatasetPreview, LatentPreview } from './LabRecords';
import { LabResults, StatCards } from './LabResults';
import './validation.css';

function Progress({ lab }: { lab: Lab }) {
  const [now,setNow] = useState(Date.now());
  useEffect(() => { if (lab.phase !== 'evaluate') return; const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); }, [lab.phase]);
  const generating = lab.phase === 'generate';
  const total = generating ? lab.validRows.length : lab.prepared.length;
  const done = generating ? lab.progress.processed : lab.aggregate.summary.records_received;
  const percent = total ? done/total*100 : 0;
  const batches = Math.ceil(total/lab.settings.batchSize);
  const seconds = Math.max(0,Math.floor(((lab.finishedAt ?? now)-(lab.startedAt ?? now))/1000));
  return <section className="lab-card lab-progress" aria-labelledby="lab-progress-title"><LoaderCircle size={26} className={lab.busy ? 'spin' : ''} /><h2 id="lab-progress-title">{generating ? 'Generating Latent Symptoms' : lab.phase === 'failed' ? 'Evaluation needs attention' : lab.phase === 'paused' ? 'Evaluation paused' : 'Validating CuraMate'}</h2><strong className="lab-progress-value">{percent.toFixed(0)}%</strong><progress max={total || 1} value={done} aria-label={generating ? 'Latent generation progress' : 'Evaluation progress'} /><p role="status">{done.toLocaleString()} / {total.toLocaleString()} records {generating ? 'processed' : 'completed'}</p><p>{generating ? 'Applying CuraMate association rules locally' : `Batch ${Math.min(lab.batches.length+1,batches)} of ${batches} | ${lab.phase === 'evaluate' ? 'Waiting for baseline and latent comparison results' : 'Completed batches are retained'}`}</p><StatCards items={generating ? [['Records processed',done],['Records remaining',total-done],['Latent symptoms generated',lab.progress.latent],['No latent expansion',lab.progress.unchanged]] : [['Records evaluated',lab.aggregate.summary.records_evaluated],['Batches completed',`${lab.batches.length} / ${batches}`],['Remaining records',total-done],['Elapsed time',`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`]]} />{lab.busy && <button className="secondary-button" onClick={lab.cancel}>Cancel</button>}{['failed','paused'].includes(lab.phase) && <button className="primary-button" onClick={() => void lab.evaluate(true)}>{lab.phase === 'failed' ? 'Retry Batch' : 'Resume Evaluation'}</button>}</section>;
}
function LatentSettings({ lab, data }: { lab: Lab; data: RulesOutput | null }) {
  const config = data?.metadata.configuration;
  const inference = lab.settings.inference;
  const update = (next: Partial<InferenceOptions>) => lab.setSettings({ ...lab.settings, inference: { ...inference,...next } });
  return <section className="lab-card"><h2>Latent generation settings</h2><p>Starts with the current clinical workspace settings. Changes here apply only to this experiment.</p><div className="lab-settings-grid"><label>Association mode<select value={inference.associationMode ?? 'combined'} onChange={e => update({ associationMode: e.target.value as 'pairwise'|'combined' })}><option value="pairwise">Pairwise</option><option value="combined">Combined symptoms and context</option></select></label><label>Minimum path score (%)<input type="number" min="0" max="100" step="0.1" value={Number((inference.minScore*100).toFixed(1))} onChange={e => { const value=e.target.valueAsNumber; if (Number.isFinite(value) && value>=0 && value<=100) update({ minScore: value/100 }); }} /></label><label>Maximum depth<select value={inference.maxDepth} onChange={e => update({ maxDepth: Number(e.target.value) })}>{[1,2,3,4,5,6].map(value => <option key={value}>{value}</option>)}</select></label><label>Latent symptom limit<input type="number" min="1" max="100" value={lab.settings.latentLimit} onChange={e => { const value=e.target.valueAsNumber; if (Number.isInteger(value) && value>=1 && value<=100) lab.setSettings({ ...lab.settings, latentLimit: value }); }} /></label></div>
    <dl className="lab-detail-grid"><div><dt>Saved rule confidence threshold</dt><dd>{config?.min_confidence ?? 'Not reported'}</dd></div><div><dt>Saved rule support threshold</dt><dd>{config?.min_support ?? 'Not reported'}</dd></div><div><dt>Saved rule lift threshold</dt><dd>{config?.min_lift ?? 'Not reported'}</dd></div></dl><p className="lab-footnote">Rule thresholds were applied when the dataset was built and are read-only here, as in the clinical workspace. Minimum path score filters generated candidates. The diagnosis workflow explores all candidates before applying the latent limit; the graph display limit does not apply.</p>
  </section>;
}
const EXAMPLE_DATASET = [
  {
    age: 28,
    gender: 'female',
    current_symptoms: ['abdominal pain', 'nausea'],
    history: ['autoimmune disease'],
    vitals: { bp: '166/94', hr: 85 },
    concluded_diagnosis: 'ectopic pregnancy',
  },
];
function JsonGuide() {
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(EXAMPLE_DATASET, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'curamate-evaluation-example.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="lab-card lab-json-guide"><div className="lab-section-heading"><div><h2>Expected JSON structure</h2><p>Use an array of records, even for one record. This is a format example, not an evaluation dataset.</p></div><button className="secondary-button" onClick={download}>Download example JSON</button></div><pre aria-label="Example evaluation dataset JSON">{JSON.stringify(EXAMPLE_DATASET, null, 2)}</pre><p><strong>Required:</strong> gender, current_symptoms (a non-empty list), and concluded_diagnosis (the known diagnosis).</p><p><strong>Optional:</strong> age, history (a list; use [] if none), and vitals. Do not add latent_symptoms; CuraMate generates them separately. The known diagnosis is used only for evaluation.</p></section>;
}
function EvaluationSettings({ lab }: { lab: Lab }) {
  return <section className="lab-card"><h2>Evaluation settings</h2><p>Choose these before starting. Generation and evaluation will run automatically in sequence.</p><div className="lab-settings-grid"><label>Diagnosis Top-K<input type="number" min="5" max="100" value={lab.settings.diagnosisTopK} onChange={e => { const value=e.target.valueAsNumber; if (Number.isInteger(value) && value>=5 && value<=100) lab.setSettings({ ...lab.settings, diagnosisTopK:value }); }} /><small>At least 5 to compare Top-1, Top-3, and Top-5.</small></label><label>Batch size<input type="number" min="1" max="500" value={lab.settings.batchSize} onChange={e => { const value=e.target.valueAsNumber; if (Number.isInteger(value) && value>=1 && value<=500) lab.setSettings({ ...lab.settings, batchSize:value }); }} /></label></div></section>;
}
export function ValidationLab({ data, options, latentLimit }: { data: RulesOutput | null; options: InferenceOptions; latentLimit: number }) {
  const lab = useValidationLab(data,{ inference: options, latentLimit, diagnosisTopK: 5, batchSize: 100 });
  const input = useRef<HTMLInputElement>(null);
  const [dragging,setDragging] = useState(false);
  const stats = useMemo(() => ({ diagnoses: new Set(lab.validRows.map(row => row.record!.concluded_diagnosis)).size, warnings: lab.rows.filter(row => row.warnings.length).length }), [lab.rows,lab.validRows]);
  const setup = ['upload','reading','inspect'].includes(lab.phase);
  const step = setup ? 0 : lab.phase === 'generate' || lab.phase === 'review' ? 1 : lab.phase === 'results' ? 3 : 2;
  const invalid = lab.rows.length-lab.validRows.length;
  return <div className="validation-lab"><header className="lab-header"><div><span className="lab-eyebrow"><FlaskConical size={16} /> CURAMATE VALIDATION LAB</span><h1>Model Validation</h1><p>Upload your dataset, choose your settings, and start the full experiment in one click.</p></div>{lab.rows.length > 0 && !lab.busy && <button className="secondary-button" onClick={lab.newDataset}>Upload New Dataset</button>}</header>
    <ol className="lab-steps lab-steps-automatic" aria-label="Validation stages">{['Dataset & settings','Generate latent','Run evaluation','Results'].map((label,index) => <li key={label} className={step === index ? 'active' : step > index ? 'complete' : ''} aria-current={step === index ? 'step' : undefined}><span>{index+1}</span>{label}</li>)}</ol>
    <p className="lab-scientific-note">Validation results measure performance on the uploaded evaluation dataset and do not establish clinical validity. Use held-out records that were not used to build the current model artifacts.</p>
    {lab.error && <div className="lab-error" role="alert"><p>{lab.error}</p>{lab.rejectedRecords.length > 0 && <><p>Fix the listed records in your file and upload it as a new experiment, or correct the backend validation/settings before retrying this batch.</p><ul>{lab.rejectedRecords.slice(0,20).map((row,index) => <li key={index}><strong>{row.sourceIndex === null ? 'Unidentified record' : `Uploaded record #${row.sourceIndex + 1}`}:</strong> {row.reason}</li>)}</ul>{lab.rejectedRecords.length > 20 && <p>Showing the first 20 of {lab.rejectedRecords.length} rejected records.</p>}</>}</div>}
    {setup && <>
      {['upload','reading'].includes(lab.phase) && <div className="lab-setup-grid"><section className={'lab-upload lab-card' + (dragging ? ' dragging' : '')} onDragOver={event => { event.preventDefault(); if (!lab.busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); const file=event.dataTransfer.files[0]; if (file && !lab.busy) void lab.upload(file); }}><Upload size={32} /><h2>Upload Evaluation Dataset</h2><p>Drag & drop a JSON file here, or browse your files.</p><input ref={input} type="file" accept=".json,application/json" className="sr-only" aria-label="Evaluation dataset JSON" disabled={lab.busy} onChange={event => { const file=event.target.files?.[0]; if (file) void lab.upload(file); event.target.value=''; }} /><button className="primary-button" disabled={lab.busy} onClick={() => input.current?.click()}>{lab.phase === 'reading' ? 'Reading file...' : 'Browse File'}</button><small>CuraMate EHR JSON | up to 50 MB</small><p>Uploading only reads the file locally. Nothing is sent until you start validation.</p></section><JsonGuide /></div>}
      {lab.phase === 'inspect' && <><div className="lab-file-label">{lab.fileName}</div><StatCards items={[["Total records",lab.rows.length],["Diagnoses",stats.diagnoses],["Valid records",lab.validRows.length],["Invalid records",invalid],["Records with warnings",stats.warnings]]} />{invalid > 0 && <p className="lab-warning">{invalid} invalid records will be excluded. Start validation will process only the {lab.validRows.length} valid records. Expand the dataset inspection below to see every error.</p>}<details className="lab-inspect-disclosure"><summary>Inspect dataset and validation issues</summary><DatasetPreview rows={lab.rows} /></details></>}
      <fieldset className="lab-setup-settings" disabled={lab.busy}><LatentSettings lab={lab} data={data} /><EvaluationSettings lab={lab} /></fieldset>
      <section className="lab-card lab-start-card"><h2>Ready to run</h2><p>{lab.validRows.length ? `${lab.validRows.length} valid records in ${Math.ceil(lab.validRows.length/lab.settings.batchSize)} sequential batches.` : 'Upload a dataset to get started.'} One click generates latent symptoms and sends the prepared records to Lambda 4. Progress, cancellation, and failed-batch retries remain available.</p><p className="lab-footnote">Original symptoms, context, generated latent symptoms, and known diagnosis labels are sent to the evaluation service. Original symptoms remain unchanged.</p>{!data && <p className="lab-warning">Load the association dataset before starting. Use Reload dataset in the header if needed.</p>}{!EVALUATION_URL && <p className="lab-warning">Set VITE_LAMBDA4_EVALUATION_URL in .env.local and restart the app to connect evaluation.</p>}<button className="primary-button" disabled={lab.busy || !data || !EVALUATION_URL || !lab.validRows.length} onClick={lab.startValidation}>{invalid ? `Start validation (${lab.validRows.length} valid records)` : 'Start validation'}</button></section>
    </>}
    {['generate','evaluate','failed','paused'].includes(lab.phase) && <Progress lab={lab} />}
    {!setup && lab.prepared.length > 0 && <details className="lab-inspect-disclosure"><summary>Review generated latent symptoms</summary><LatentPreview rows={lab.prepared} /></details>}
    {(lab.phase === 'results' || (['failed','paused'].includes(lab.phase) && lab.batches.length > 0)) && <LabResults lab={lab} />}
    {['failed','paused'].includes(lab.phase) && !lab.batches.length && <div className="lab-actions"><button className="secondary-button" onClick={lab.again}>Change settings and start again</button></div>}
  </div>;
}
