import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, MessageCircle, Plus, Search, X } from 'lucide-react';
import type { Trie } from '../trie/Trie';
import type { SymptomFrequency } from '../types/rules';
import { displaySymptom } from '../inference/canonicalize';
import { compactNumber } from '../utils/format';

import { SymptomDescriptionInput } from './SymptomDescriptionInput';
import './symptom-input.css';

interface Props {
  allowDescription?: boolean;
  trie: Trie | null;
  frequency: Record<string, SymptomFrequency>;
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  excludedSymptoms?: string[];
}
export function SymptomMultiSelect({ trie, frequency, selected, onChange, disabled, label = 'observed symptoms', placeholder = 'Search and add observed symptoms…', excludedSymptoms, allowDescription = false }: Props) {
  const [mode, setMode] = useState<'manual' | 'describe'>('manual');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const excluded = useMemo(() => new Set([...selected, ...(excludedSymptoms ?? [])]), [selected, excludedSymptoms]);
  const matches = useMemo(() => trie?.search(query, 8, excluded) ?? [], [trie, query, excluded]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  function select(symptom: string) {
    if (!excluded.has(symptom)) onChange([...selected, symptom]);
    setQuery(''); setActive(0); input.current?.focus();
  }
  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault(); setOpen(true); setActive(open ? (activeIndex + 1) % Math.max(matches.length, 1) : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true); setActive((activeIndex - 1 + Math.max(matches.length, 1)) % Math.max(matches.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && matches[activeIndex]) select(matches[activeIndex]); else setOpen(true);
    } else if (event.key === 'Escape') {
      event.preventDefault(); setOpen(false);
    } else if (event.key === 'Backspace' && !query && selected.length) onChange(selected.slice(0, -1));
  }
  return <div className="symptom-selector" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className="sr-only" htmlFor={id}>Search {label}</label>
    {selected.length > 0 && <div className="selected-symptoms" aria-label={'Selected ' + label}>
      {selected.map(symptom => <span className="symptom-chip" key={symptom}>
        <Check size={12} />{displaySymptom(symptom)}
        <button type="button" aria-label={'Remove ' + displaySymptom(symptom)} disabled={disabled} onClick={() => onChange(selected.filter(item => item !== symptom))}><X size={13} /></button>
      </span>)}
    </div>}
    {allowDescription && <div className="symptom-input-modes" role="group" aria-label="How to add symptoms">
      <button type="button" aria-pressed={mode === 'manual'} onClick={() => { setMode('manual'); setOpen(false); }}><Search size={14} />Search symptoms</button>
      <button type="button" aria-pressed={mode === 'describe'} onClick={() => { setMode('describe'); setOpen(false); }}><MessageCircle size={14} />Describe a symptom<span className="symptom-mode-new">AI</span></button>
    </div>}
    {mode === 'describe' ? <SymptomDescriptionInput frequency={frequency} excluded={excluded} disabled={disabled} onSelect={select} onManual={() => { setMode('manual'); setOpen(false); }} /> : <>
    <div className={'search-field ' + (open ? 'is-focused' : '')}>
      <Search size={17} aria-hidden="true" />
      <input id={id} ref={input} value={query} placeholder={placeholder}
        role="combobox" aria-autocomplete="list" aria-expanded={open && !disabled}
        aria-controls={id + '-list'} aria-activedescendant={open && matches.length ? id + '-option-' + activeIndex : undefined}
        disabled={disabled} autoComplete="off" spellCheck={false}
        onFocus={() => setOpen(true)} onKeyDown={handleKey}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} />
    </div>
    {open && !disabled && <div className="search-dropdown">
      <div className="dropdown-caption">{query ? 'MATCHING SYMPTOMS' : 'MOST FREQUENT IN DATASET'}</div>
      <ul id={id + '-list'} role="listbox" aria-label="Available symptoms">
        {matches.map((symptom, index) => <li key={symptom} id={id + '-option-' + index} role="option" aria-selected={activeIndex === index}
          className={activeIndex === index ? 'active' : ''} onMouseEnter={() => setActive(index)}
          onMouseDown={event => event.preventDefault()} onClick={() => select(symptom)}>
          <span>{displaySymptom(symptom)}</span><span className="suggestion-count">{compactNumber(frequency[symptom]?.count ?? 0)} <Plus size={14} /></span>
        </li>)}
        {!matches.length && <li className="no-matches" role="option" aria-selected="false">No matching symptoms in this dataset.</li>}
      </ul>
      <div className="search-hint"><span>↑ ↓ to navigate</span><span>↵ to select</span></div>
    </div>}
    </>}
    <span className="sr-only" role="status">{selected.length} {label} selected</span>
  </div>;
}
