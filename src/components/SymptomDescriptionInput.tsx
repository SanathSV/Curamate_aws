import { useEffect, useId, useRef, useState } from 'react';
import { Check, LoaderCircle, RotateCcw, ArrowUp, Sparkles, X } from 'lucide-react';
import { recognizeSymptom } from '../symptomRecognition/api';
import { displaySymptom, normalizeSymptom } from '../inference/canonicalize';
import type { SymptomFrequency } from '../types/rules';

type Feedback = { kind: 'idle' | 'loading' | 'success' | 'error' | 'none'; message: string };
const noMatchMessage = 'No matching symptom could be identified.\nPlease try describing the symptom differently or search manually.';
interface Props {
  frequency: Record<string, SymptomFrequency>;
  excluded: Set<string>;
  disabled?: boolean;
  onSelect: (symptom: string) => void;
  onManual: () => void;
}
export function SymptomDescriptionInput({ frequency, excluded, disabled, onSelect, onManual }: Props) {
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle', message: '' });
  const [choices, setChoices] = useState<string[]>([]);
  const [choice, setChoice] = useState('');
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const loading = feedback.kind === 'loading';
  // Cancel when the catalog/selection changes, the workflow locks, or this mode closes.
  useEffect(() => {
    setChoices([]);
    setFeedback(previous => previous.kind === 'loading' ? { kind: 'idle', message: '' } : previous);
    return () => { request.current?.abort(); request.current = null; };
  }, [frequency, excluded, disabled]);
  function cancel() {
    request.current?.abort(); request.current = null;
    setFeedback({ kind: 'idle', message: '' });
    input.current?.focus();
  }
  function canonicalName(name: string) {
    return Object.keys(frequency).find(key => normalizeSymptom(key) === normalizeSymptom(name));
  }
  function accept(symptom: string) {
    if (disabled) return;
    setChoices([]);
    if (excluded.has(symptom)) {
      setFeedback({ kind: 'none', message: displaySymptom(symptom) + ' is already selected. Describe another symptom or use manual search.' });
      return;
    }
    onSelect(symptom);
    setFeedback({ kind: 'success', message: displaySymptom(symptom) });
    setDraft('');
    input.current?.focus();
  }
  async function submit() {
    if (!draft.trim() || disabled || loading) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setChoices([]);
    setFeedback({ kind: 'loading', message: 'Matching canonical symptom…' });
    try {
      const { prediction, alternatives } = await recognizeSymptom(draft.trim(), controller.signal);
      if (controller.signal.aborted || request.current !== controller) return;
      if (prediction.symptom.trim().toUpperCase() === 'NONE') {
        setFeedback({ kind: 'none', message: noMatchMessage });
        return;
      }
      if (prediction.confidence < 0.90) {
        const candidates = [...new Set([prediction, ...alternatives]
          .filter(candidate => candidate.symptom.trim().toUpperCase() !== 'NONE')
          .map(candidate => canonicalName(candidate.symptom))
          .filter((name): name is string => !!name))];
        if (!candidates.length) {
          setFeedback({ kind: 'none', message: noMatchMessage });
          return;
        }
        setChoices(candidates);
        setChoice(candidates.find(name => !excluded.has(name)) ?? '');
        setFeedback({ kind: 'idle', message: '' });
        return;
      }
      const symptom = canonicalName(prediction.symptom);
      if (!symptom) {
        setFeedback({ kind: 'none', message: 'That symptom is not available in the current symptom list. Please rephrase or use manual search.' });
        return;
      }
      accept(symptom);
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller) return;
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Recognition failed. Please retry or use manual search.' });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  return <div className="symptom-chat">
    <div className="symptom-chat-compose" aria-busy={loading}>
      <Sparkles size={16} className="symptom-compose-icon" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">Describe one symptom</label>
      <input ref={input} id={id} value={draft} maxLength={500} disabled={disabled} readOnly={loading}
        placeholder="Enter a symptom description…" autoComplete="off" aria-describedby={id + '-hint'}
        onChange={event => { setDraft(event.target.value); setChoices([]); setFeedback({ kind: 'idle', message: '' }); }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
      {loading ? <button type="button" aria-label="Cancel recognition" title="Cancel recognition" onClick={cancel}><X size={17} /></button>
        : <button type="button" className="symptom-chat-send" aria-label="Recognize symptom" title="Recognize symptom (Enter)" disabled={disabled || !draft.trim()} onClick={() => void submit()}><ArrowUp size={18} /></button>}
    </div>
    <p id={id + '-hint'} className="symptom-chat-hint">Describe one symptom at a time for the best recognition.</p>
    <div className="symptom-chat-reply" role="status" aria-live="polite" aria-atomic="true">
      {feedback.kind !== 'idle' && <div key={feedback.kind + feedback.message} className={'symptom-chat-message is-' + feedback.kind}>
        {feedback.kind === 'loading' ? <><LoaderCircle size={14} className="spin" /><span>{feedback.message}</span></>
          : feedback.kind === 'success' ? <><Check size={14} /><span>{feedback.message} added to observed symptoms.</span></>
          : <span>{feedback.message}</span>}
      </div>}
    </div>
    {choices.length > 0 && <fieldset className="symptom-confirmation" disabled={disabled}>
      <legend>Confirm canonical symptom</legend>
      <div className="symptom-confirmation-options">
      {choices.map(symptom => <label key={symptom}>
        <input type="radio" name={id + '-choice'} value={symptom} checked={choice === symptom}
          disabled={excluded.has(symptom)} onChange={() => setChoice(symptom)} />
        <span>{displaySymptom(symptom)}{excluded.has(symptom) ? ' (already selected)' : ''}</span>
      </label>)}
      <label><input type="radio" name={id + '-choice'} checked={choice === ''} onChange={() => setChoice('')} /><span>None of these</span></label>
      </div>
      <button type="button" onClick={() => {
        if (choice) accept(choice);
        else { setChoices([]); setFeedback({ kind: 'none', message: noMatchMessage }); input.current?.focus(); }
      }}>{choice ? 'Add symptom' : 'Try again'}</button>
    </fieldset>}
    {(feedback.kind === 'error' || feedback.kind === 'none') && <div className="symptom-chat-actions">
      {feedback.kind === 'error' && <button type="button" disabled={disabled} onClick={() => void submit()}><RotateCcw size={13} />Retry</button>}
      <button type="button" onClick={onManual}>Use manual search</button>
    </div>}
  </div>;
}
