import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import type { RulesOutput } from '../../types/rules';
import type { Trie } from '../../trie/Trie';
import { compareSymptoms } from '../../inference/compareSymptoms';
import { displaySymptom } from '../../inference/canonicalize';
import { formatNumber, percent } from '../../utils/format';
import { SymptomMultiSelect } from '../SymptomMultiSelect';

const PAGE_SIZE = 15;
const unavailable = { missing: 'Not available', 'no-records': 'No matching records', inconsistent: 'Inconsistent counts' };
export function SymptomComparison({ data, trie, observed }: { data: RulesOutput; trie: Trie; observed: string[] }) {
  const [starting, setStarting] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<'likelihood' | 'name'>('likelihood');
  useEffect(() => {
    setStarting(previous => previous.filter(name => Object.hasOwn(data.symptom_frequency, name)));
    setTargets(previous => previous.filter(name => Object.hasOwn(data.symptom_frequency, name)));
    setPage(0);
  }, [data]);
  // Successful reloads may change the catalog; discarded symptoms never reach the calculator.
  const validStarting = starting.filter(name => Object.hasOwn(data.symptom_frequency, name));
  const validTargets = targets.filter(name => Object.hasOwn(data.symptom_frequency, name) && !validStarting.includes(name));
  const sourceKey = validStarting.join('|');
  const targetKey = validTargets.join('|');
  const comparison = useMemo(() => compareSymptoms(data, sourceKey ? sourceKey.split('|') : [], targetKey ? targetKey.split('|') : [], 'together'), [data, sourceKey, targetKey]);
  const rows = useMemo(() => [...comparison.rows].sort((a, b) => sort === 'name' ? a.symptom.localeCompare(b.symptom) :
    (b.cells[0]?.probability ?? -1) - (a.cells[0]?.probability ?? -1) || a.symptom.localeCompare(b.symptom)), [comparison, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const knownCount = rows.filter(row => row.cells[0]?.status === 'available').length;
  const condition = comparison.columns[0]?.symptoms.map(displaySymptom).join(' AND ') ?? '';
  function changeStarting(next: string[]) { setStarting(next); setTargets(previous => previous.filter(name => !next.includes(name))); setPage(0); }
  return <section id="symptom-comparison" className="comparison-section" aria-labelledby="comparison-title">
    <div className="paths-heading"><h2 id="comparison-title"><ArrowRightLeft size={18} />Compare symptom likelihoods</h2><button className="secondary-button" disabled={!observed.length} onClick={() => changeStarting([...observed])}>Use observed symptoms</button></div>
    <p className="paths-description">Choose symptoms that occur together, then compare how often other symptoms occur in those same records. All starting symptoms are required; additional symptoms in a record are allowed. Gender filters the available symptoms. Probabilities still use the recorded symptom-only counts, without conditioning on gender or history.</p>
    <div className="comparison-inputs">
      <div className="comparison-input"><h3>Given all of these symptoms</h3><SymptomMultiSelect trie={trie} frequency={data.symptom_frequency} selected={validStarting} onChange={changeStarting} label="comparison starting symptoms" placeholder="Add A, B, …" /></div>
      <div className="comparison-input"><h3>Compare with these symptoms</h3><SymptomMultiSelect trie={trie} frequency={data.symptom_frequency} selected={validTargets} excludedSymptoms={validStarting} onChange={next => { setTargets(next.filter(name => !validStarting.includes(name))); setPage(0); }} label="comparison target symptoms" placeholder="Add target symptoms, or leave empty for all…" /><p className="field-hint">Leave empty to compare all other symptoms. Starting symptoms are excluded.</p></div>
    </div>
    {!validStarting.length ? <p className="comparison-empty">Select at least one starting symptom to see the comparison. No discovery run is needed.</p> : <>
      <div className="comparison-summary"><div><strong>Given {condition}</strong><span>{knownCount} of {rows.length} target comparisons available · updates as you select</span></div><label>Sort by <select value={sort} onChange={event => { setSort(event.target.value as 'likelihood' | 'name'); setPage(0); }}><option value="likelihood">Highest likelihood</option><option value="name">Symptom name</option></select></label></div>
      {knownCount < rows.length && <p className="comparison-notice">“Not available” means the loaded dataset does not include the required joint rule. It does not mean 0%. Joint probabilities are never estimated by multiplying single-symptom probabilities.</p>}
      {rows.length === 0 ? <p className="comparison-empty">No other symptoms are available for this selection.</p> : <div className="comparison-table-scroll" tabIndex={0} role="region" aria-label="Symptom likelihood comparison table"><table className="comparison-table">
        <caption className="sr-only">Likelihood of each target given {condition}, compared with its overall dataset frequency.</caption>
        <thead><tr><th scope="col">Target symptom</th><th scope="col">Given all selected</th><th scope="col">Overall frequency</th><th scope="col">Difference</th></tr></thead>
        <tbody>{rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(row => {
          const cell = row.cells[0];
          return <tr key={row.symptom}><th scope="row">{displaySymptom(row.symptom)}</th><td>{cell.status === 'available' ? <>
            <strong>{percent(cell.probability!, 1)}</strong><span className="comparison-bar" aria-hidden="true"><i style={{ width: percent(cell.probability!) }} /></span><small>{formatNumber(cell.occurrences!)} / {formatNumber(cell.antecedentOccurrences!)} records</small>
          </> : <span className="comparison-unavailable">{unavailable[cell.status]}</span>}</td><td>{row.baseline === null ? 'Not available' : <><span>{percent(row.baseline, 1)}</span><small>{formatNumber(row.baselineCount)} / {formatNumber(comparison.transactions)} records</small></>}</td><td>{cell.difference === null ? '—' : <span className={cell.difference > 0 ? 'comparison-increase' : ''}>{cell.difference > 0 ? '+' : ''}{(cell.difference * 100).toFixed(1)} pp</span>}</td></tr>;
        })}</tbody>
      </table></div>}
      {pages > 1 && <nav className="paths-pagination" aria-label="Comparison result pages"><span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} of {rows.length} symptoms</span><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span aria-live="polite">Page {currentPage + 1} / {pages}</span><button className="secondary-button" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
      <p className="paths-description">P(target | {condition}) = records containing the target and every starting symptom ÷ records containing every starting symptom. Difference is measured in percentage points (pp) against the full dataset. These are dataset associations, not an individual prediction.</p>
    </>}
  </section>;
}
