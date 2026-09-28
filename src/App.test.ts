// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
vi.mock('./hooks/useRules', async () => {
  const { dataset, rule } = await import('./test/fixtures');
  const data = dataset([[['a'], [rule('x', .6, { occurrences: 300, antecedent_occurrences: 500 })]]]);
  return { useRules: () => ({ data, loading: false, error: null, reload: vi.fn(), retry: vi.fn() }) };
});
vi.mock('./hooks/useInference', () => ({ useInference: () => ({ ready: true, running: false, result: null, clear: vi.fn(), run: vi.fn() }) }));
vi.mock('./hooks/useAnalytics', () => ({ useAnalytics: () => ({ ready: true, running: false, phase: 'idle', reset: vi.fn(), start: vi.fn() }) }));
vi.mock('./hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }) }));
vi.mock('./components/graph/SymptomGraph', () => ({ SymptomGraph: () => null }));
vi.mock('./components/Methodology', () => ({ Methodology: () => null }));
afterEach(cleanup);
describe('workspace tabs', () => {
  it('collapses and restores navigation without losing symptom selections', () => {
    render(createElement(App));
    const input = screen.getByRole('combobox', { name: 'Search observed symptoms' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByRole('complementary', { name: 'Workspace navigation' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove A' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('complementary', { name: 'Workspace navigation' }), { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Expand sidebar' }));
  });
  it('opens a dedicated comparison view, imports observations, and preserves selections across tabs', () => {
    render(createElement(App));
    const input = screen.getByRole('combobox', { name: 'Search observed symptoms' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('tab', { name: 'Compare symptoms' }));
    expect(screen.getByRole('tabpanel').id).toBe('comparison-panel');
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull();
    expect(screen.getByText('60.0%')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Clinical workspace' }));
    expect(screen.getByRole('tabpanel').id).toBe('clinical-panel');
    fireEvent.click(screen.getByRole('tab', { name: 'Compare symptoms' }));
    expect(screen.getByText('60.0%')).toBeTruthy();
  });
  it('collapses inputs to free review space and restores the selected symptoms', () => {
    render(createElement(App));
    const input = screen.getByRole('combobox', { name: 'Search observed symptoms' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inputs' }));
    expect(screen.queryByRole('combobox', { name: 'Search observed symptoms' })).toBeNull();
    expect(screen.getByText('1 symptom selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand inputs' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('region', { name: 'Symptom evidence, independently scrollable' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Expand inputs' }));
    expect(screen.getByRole('button', { name: 'Remove A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse inputs' }).getAttribute('aria-expanded')).toBe('true');
  });
  it('opens the separate Validation Lab using keyboard navigation', async () => {
    render(createElement(App));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Clinical workspace' }), { key: 'End' });
    expect(await screen.findByRole('heading', { name: 'Model Validation' })).toBeTruthy();
    expect(screen.getByRole('tabpanel').id).toBe('validation-panel');
    expect(screen.queryByRole('combobox', { name: 'Search observed symptoms' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Clinical workspace' }));
    expect(screen.getByRole('combobox', { name: 'Search observed symptoms' })).toBeTruthy();
  });
  it('supports keyboard navigation between tabs', () => {
    render(createElement(App));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Clinical workspace' }), { key: 'ArrowRight' });
    const comparison = screen.getByRole('tab', { name: 'Compare symptoms' });
    expect(comparison.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(comparison);
    fireEvent.keyDown(comparison, { key: 'Home' });
    expect(screen.getByRole('tabpanel').id).toBe('clinical-panel');
  });
});
