import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { InspectedRecord, PreparedRecord } from '../../validation/types';
export function Chips({ values, latent = false }: { values: string[]; latent?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <div className={'lab-chips' + (latent ? ' lab-latent-chips' : '')}>{(expanded ? values : values.slice(0, 3)).map((value,index) => <span key={index}>{value}</span>)}{values.length > 3 && <button type="button" onClick={event => { event.stopPropagation(); setExpanded(!expanded); }}>{expanded ? 'Show less' : `+${values.length - 3}`}</button>}{!values.length && <small>None</small>}</div>;
}
export function Pagination({ page, count, onChange, size = 10 }: { page: number; count: number; onChange: (page: number) => void; size?: number }) {
  const pages = Math.max(1, Math.ceil(count / size));
  return <nav className="lab-pagination" aria-label="Record pages"><span>{count ? `${page * size + 1}–${Math.min((page + 1) * size, count)} of ${count}` : 'No matching records'}</span><button className="secondary-button" disabled={!page} onClick={() => onChange(page-1)}>Previous</button><span>Page {page+1} / {pages}</span><button className="secondary-button" disabled={page+1 >= pages} onClick={() => onChange(page+1)}>Next</button></nav>;
}
function RecordDialog({ row, close }: { row: InspectedRecord; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const record = row.record;
  return <dialog className="lab-dialog" ref={dialog} onCancel={close} aria-labelledby="lab-record-title"><button className="icon-button lab-dialog-close" aria-label="Close record" onClick={close}><X size={20} /></button><h2 id="lab-record-title">Record #{row.index+1}</h2>
    {record && <><dl className="lab-detail-grid"><div><dt>Ground truth</dt><dd>{record.concluded_diagnosis}</dd></div><div><dt>Age / gender</dt><dd>{record.age ?? 'Not supplied'} / {record.gender}</dd></div><div><dt>Blood pressure / heart rate</dt><dd>{record.vitals?.bp ?? 'Not supplied'} / {record.vitals?.hr ?? 'Not supplied'}</dd></div></dl><h3>Original symptoms</h3><Chips values={record.current_symptoms} /><h3>History</h3><Chips values={record.history} /></>}
    {row.errors.map(issue => <p className="lab-error" key={issue}>{issue}</p>)}{row.warnings.map(issue => <p className="lab-warning" key={issue}>{issue}</p>)}<details><summary>View raw JSON</summary><pre>{JSON.stringify(row.raw, null, 2)}</pre></details>
  </dialog>;
}
export function DatasetPreview({ rows }: { rows: InspectedRecord[] }) {
  const [search,setSearch] = useState(''), [diagnosis,setDiagnosis] = useState(''), [status,setStatus] = useState('all'), [page,setPage] = useState(0);
  const [selected,setSelected] = useState<InspectedRecord | null>(null);
  const diagnoses = useMemo(() => [...new Set(rows.flatMap(row => row.record ? [row.record.concluded_diagnosis] : []))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => (status === 'all' || (status === 'valid' ? !!row.record : !row.record)) && (!diagnosis || row.record?.concluded_diagnosis === diagnosis) && (!search || JSON.stringify(row.raw).toLowerCase().includes(search.toLowerCase()))), [rows, search, diagnosis, status]);
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10)-1));
  return <section className="lab-card"><div className="lab-section-heading"><div><h2>Inspect your dataset</h2><p>Review records and resolve errors before generating latent symptoms.</p></div></div>
    <div className="lab-filters"><label>Search records<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Symptoms, diagnosis, history..." /></label><label>Diagnosis<select value={diagnosis} onChange={e => { setDiagnosis(e.target.value); setPage(0); }}><option value="">All diagnoses</option>{diagnoses.map(value => <option key={value}>{value}</option>)}</select></label><label>Validation<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All records</option><option value="valid">Valid records</option><option value="invalid">Invalid records</option></select></label></div>
    <div className="lab-table-scroll" tabIndex={0} role="region" aria-label="Dataset preview"><table className="lab-table"><thead><tr>{['Record','Age / gender','Symptoms','History','BP / HR','Ground truth','Validation'].map(value => <th key={value}>{value}</th>)}</tr></thead><tbody>{filtered.slice(current*10,current*10+10).map(row => <tr key={row.index} onClick={() => setSelected(row)}><td><button className="text-button" onClick={() => setSelected(row)}>#{row.index+1}</button></td><td>{row.record?.age ?? '—'} / {row.record?.gender ?? '—'}</td><td><Chips values={row.record?.current_symptoms ?? []} /></td><td><Chips values={row.record?.history ?? []} /></td><td>{row.record?.vitals?.bp ?? '—'} / {row.record?.vitals?.hr ?? '—'}</td><td>{row.record?.concluded_diagnosis ?? 'Invalid record'}</td><td><span className={row.errors.length ? 'lab-error-text' : ''}>{row.errors.length ? `${row.errors.length} errors` : 'Valid'}</span>{row.warnings.length > 0 && <small>{row.warnings.length} warnings</small>}{row.errors.length > 0 && <small>{row.errors[0]}</small>}</td></tr>)}</tbody></table></div>
    <Pagination page={current} count={filtered.length} onChange={setPage} />{selected && <RecordDialog row={selected} close={() => setSelected(null)} />}
  </section>;
}
export function LatentPreview({ rows }: { rows: PreparedRecord[] }) {
  const [filter,setFilter] = useState('all'), [search,setSearch] = useState(''), [page,setPage] = useState(0);
  const filtered = useMemo(() => rows.filter(row => (filter === 'all' || (filter === 'expanded' ? row.record.latent_symptoms.length > 0 : !row.record.latent_symptoms.length)) && (!search || [row.record.concluded_diagnosis,...row.record.current_symptoms,...row.record.latent_symptoms].join(' ').toLowerCase().includes(search.toLowerCase()))), [rows,filter,search]);
  const current = Math.min(page,Math.max(0,filtered.length-1)); const row = filtered[current];
  return <section className="lab-card"><h2>Review Latent Expansion</h2><p>Generated symptoms are suggestions from the rules, not clinically observed findings.</p><div className="lab-filters"><label>Search<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Symptom or ground truth" /></label><label>Expansion<select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">All records</option><option value="expanded">Expanded</option><option value="unchanged">No latent symptoms</option></select></label></div>
    {row && <><div className="lab-record-heading"><strong>Record #{row.index+1}</strong><span>Ground truth: {row.record.concluded_diagnosis}</span></div><div className="lab-before-after"><div><h3>Original symptoms</h3><Chips values={row.record.current_symptoms} /></div><div><h3>After expansion</h3><Chips values={row.record.current_symptoms} /><h4>Generated latent symptoms</h4><Chips values={row.record.latent_symptoms} latent /></div></div>
    {(row.generation.unknownSymptoms.length > 0 || row.generation.unknownContexts.length > 0) && <div className="lab-warning">Not in the local rules catalog (preserved in the evaluation input): <Chips values={[...row.generation.unknownSymptoms,...row.generation.unknownContexts]} /></div>}{row.generation.truncated && <p className="lab-warning">This record reached the existing inference search limit. Its expansion is partial.</p>}
    <details><summary>Preview evaluation payload - this record</summary><pre>{JSON.stringify(row.record,null,2)}</pre></details></>}
    <Pagination page={current} count={filtered.length} size={1} onChange={setPage} />
  </section>;
}
