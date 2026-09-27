// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SymptomComparison } from './SymptomComparison';
import { createSymptomTrie } from '../../trie/symptomTrie';
import { dataset, rule } from '../../test/fixtures';

afterEach(cleanup);
const data = dataset([[['a'], [rule('x', .6, { occurrences: 300, antecedent_occurrences: 500 })]], [['b'], [rule('x', .2, { occurrences: 100, antecedent_occurrences: 500 })]]]);
function mount(observed: string[] = []) {
  return render(createElement(SymptomComparison, { data, trie: createSymptomTrie(data.symptom_frequency), observed }));
}
describe('comparison interactions', () => {
  it('starts from observations and renders count-based conditional likelihood', () => {
    mount(['a']);
    expect(screen.getByText('60.0%')).toBeTruthy();
    expect(screen.getByText('300 / 500 records')).toBeTruthy();
  });
  it('selects symptoms with the keyboard and updates results without running analysis', () => {
    mount();
    const input = screen.getByRole('combobox', { name: 'Search comparison starting symptoms' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('60.0%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove A' }));
    expect(screen.getByText(/Select at least one starting symptom/)).toBeTruthy();
  });
  it('imports observations and excludes starting symptoms from target suggestions', () => {
    mount(['a']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use observed symptoms' }));
    fireEvent.focus(screen.getByRole('combobox', { name: 'Search comparison target symptoms' }));
    expect(within(screen.getByRole('listbox')).queryByText('A')).toBeNull();
    fireEvent.click(within(screen.getByRole('listbox')).getByText('X'));
    expect(screen.getByText('1 of 1 target comparisons available', { exact: false })).toBeTruthy();
  });
  it('explains unavailable joint data without inventing a likelihood', () => {
    mount(['a', 'b']);
    expect(screen.getByText(/Why are there no percentages/)).toBeTruthy();
    expect(screen.queryByText('60.0%')).toBeNull();
  });
});
