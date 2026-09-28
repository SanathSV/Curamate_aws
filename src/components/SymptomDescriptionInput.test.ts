// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SymptomMultiSelect } from './SymptomMultiSelect';
import { createSymptomTrie } from '../trie/symptomTrie';

const frequency = Object.fromEntries(['runny nose', 'nasal congestion', 'sneezing'].map(name => [name, { count: 10, probability: .1 }]));
function Picker() {
  const [selected, onChange] = useState<string[]>([]);
  return createElement(SymptomMultiSelect, { allowDescription: true, frequency, trie: createSymptomTrie(frequency), selected, onChange });
}
function response(confidence = .9721, symptom = 'runny nose') {
  return { success: true, query: 'My nose keeps dripping.', prediction: { symptom, confidence }, alternatives: [
    { symptom: 'nasal congestion', confidence: .0142 }, { symptom: 'sneezing', confidence: .0061 },
  ] };
}
function start(body = response()) {
  vi.stubEnv('VITE_LAMBDA5_SYMPTOM_URL', '');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal('fetch', fetch);
  render(createElement(Picker));
  fireEvent.click(screen.getByRole('button', { name: /Describe a symptom/ }));
  fireEvent.change(screen.getByLabelText('Describe one symptom'), { target: { value: 'My nose keeps dripping.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Recognize symptom' }));
  return fetch;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([.90, .9721])('posts the exact query and automatically adds confidence %s', async confidence => {
  const fetch = start(response(confidence));
  expect(await screen.findByRole('button', { name: 'Remove Runny nose' })).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith('/lambda5', expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'My nose keeps dripping.' }) }));
  expect(screen.queryByRole('group', { name: 'Confirm canonical symptom' })).toBeNull();
});
it('requires confirmation below the threshold and adds the chosen alternative', async () => {
  start(response(.8999));
  expect(await screen.findByRole('group', { name: 'Confirm canonical symptom' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'Nasal congestion' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add symptom' }));
  expect(screen.getByRole('button', { name: 'Remove Nasal congestion' })).toBeTruthy();
});
it('allows rejecting every suggestion without adding a symptom', async () => {
  start(response(.7));
  fireEvent.click(await screen.findByRole('radio', { name: 'None of these' }));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText(/No matching symptom could be identified/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
});
it('handles NONE before confidence and preserves the draft', async () => {
  start(response(.99, 'NONE'));
  expect(await screen.findByText(/No matching symptom could be identified/)).toBeTruthy();
  expect((screen.getByLabelText('Describe one symptom') as HTMLInputElement).value).toBe('My nose keeps dripping.');
  expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
});
it('keeps manual keyboard autocomplete independent of Lambda5', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(createElement(Picker));
  const input = screen.getByRole('combobox');
  fireEvent.focus(input); fireEvent.change(input, { target: { value: 'runny' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Remove Runny nose' })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it('ignores late responses after switching to manual search', async () => {
  const fetch = start();
  fireEvent.click(screen.getByRole('button', { name: 'Search symptoms' }));
  await waitFor(() => expect(fetch.mock.calls[0][1].signal.aborted).toBe(true));
  expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
});
it('retains the draft and offers retry on network failure', async () => {
  const fetch = start();
  await screen.findByRole('button', { name: 'Remove Runny nose' });
  fetch.mockRejectedValueOnce(new TypeError('Network failure'));
  fireEvent.change(screen.getByLabelText('Describe one symptom'), { target: { value: 'My throat feels scratchy.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Recognize symptom' }));
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  expect((screen.getByLabelText('Describe one symptom') as HTMLInputElement).value).toBe('My throat feels scratchy.');
});

