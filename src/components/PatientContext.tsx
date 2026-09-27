import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import type { SymptomFrequency } from '../types/rules';
import { displaySymptom, normalizeSymptom } from '../inference/canonicalize';

interface Props {
  frequency: Record<string, SymptomFrequency>;
  contexts: string[];
  onChange: (contexts: string[]) => void;
  disabled: boolean;
  combined: boolean;
}
export function PatientContext({ frequency, contexts, onChange, disabled, combined }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const tokens = useMemo(() => Object.keys(frequency).sort(), [frequency]);
  const genders = tokens.filter(token => token.startsWith('gender:'));
  const histories = tokens.filter(token => token.startsWith('history:'));
  const selectedHistory = contexts.filter(token => token.startsWith('history:'));
  const matches = histories.filter(token => !contexts.includes(token) && token.slice(8).includes(normalizeSymptom(query)))
    .sort((a, b) => frequency[b].count - frequency[a].count || a.localeCompare(b)).slice(0, 8);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const expanded = open && !disabled && histories.length > 0;
  function select(token: string) {
    if (disabled || contexts.includes(token)) return;
    onChange([...contexts, token]);
    setQuery(''); setActive(0); search.current?.focus();
  }
  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      const length = Math.max(1, matches.length);
      setActive(!open ? 0 : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + length) % length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (expanded && matches[activeIndex]) select(matches[activeIndex]); else setOpen(true);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    }
  }
  return <section className="patient-context" aria-labelledby={id + '-title'}>
    <h3 id={id + '-title'} className="sr-only">Patient context</h3>
    <div className="context-fields"><div className="context-field">
    <label htmlFor={id + '-gender'}>Gender <span>Optional</span></label>
    <div className="context-gender-select"><select id={id + '-gender'} disabled={disabled || !genders.length} value={contexts.find(token => token.startsWith('gender:')) ?? ''} onChange={event => onChange([...contexts.filter(token => !token.startsWith('gender:')), ...(event.target.value ? [event.target.value] : [])])}>
      <option value="">Not specified</option>
      {genders.map(token => <option key={token} value={token}>{displaySymptom(token.slice('gender:'.length))}</option>)}
    </select><ChevronDown size={15} aria-hidden="true" /></div>
    </div><div className="context-field">
    <label htmlFor={id + '-history'}>Medical history <span>Optional</span></label>
    <div className="history-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      {selectedHistory.length > 0 && <div className="history-chips" aria-label="Selected medical history">{selectedHistory.map(token => <span key={token}>{displaySymptom(token.slice(8))}<button type="button" disabled={disabled} aria-label={'Remove history ' + displaySymptom(token.slice(8))} onClick={() => onChange(contexts.filter(value => value !== token))}><X size={12} /></button></span>)}</div>}
      <div className="history-search"><Search size={15} aria-hidden="true" /><input id={id + '-history'} ref={search} type="text" value={query} placeholder={histories.length ? 'Search history…' : 'No history options available'} disabled={disabled || !histories.length}
        role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? id + '-history-list' : undefined} aria-activedescendant={expanded && matches.length ? id + '-history-option-' + activeIndex : undefined}
        autoComplete="off" spellCheck={false} onFocus={() => setOpen(true)} onKeyDown={handleKey} onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} />
        {query && <button type="button" className="icon-button" disabled={disabled} aria-label="Clear history search" onClick={() => { setQuery(''); setActive(0); search.current?.focus(); }}><X size={13} /></button>}
      </div>
      {expanded && <div className="history-suggestions"><span className="history-caption">{query ? 'Matching history' : 'Add medical history'}</span>
        <ul id={id + '-history-list'} role="listbox" aria-label="Available medical history">{matches.map((token, index) => <li id={id + '-history-option-' + index} key={token} role="option" aria-selected={activeIndex === index} className={index === activeIndex ? 'active' : ''} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => select(token)}><span>{displaySymptom(token.slice(8))}</span><Plus size={14} aria-hidden="true" /></li>)}</ul>
        {!matches.length && <p className="history-empty">{selectedHistory.length === histories.length ? 'All available history selected.' : 'No matching history in this dataset.'}</p>}
      </div>}
    </div>
    </div></div>
    <span className="sr-only" role="status">{selectedHistory.length} history items selected{expanded ? ', ' + matches.length + ' suggestions available' : ''}</span>
    {contexts.length > 0 && <p className="field-hint">{combined ? 'Patient context included' : 'Gender filters symptoms. Use Combined symptoms in Settings for context-conditioned rules.'}</p>}
  </section>;
}
