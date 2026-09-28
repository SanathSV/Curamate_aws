// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAnimatedProgress } from './useAnimatedProgress';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('animates an instant response through intermediate values before revealing results', () => {
  const { result, rerender } = renderHook(({ complete }) => useAnimatedProgress(complete ? 100 : 0, complete, false), { initialProps: { complete: false } });
  rerender({ complete: true });
  expect(result.current.value).toBe(0);
  act(() => { vi.advanceTimersByTime(450); });
  expect(result.current.value).toBeGreaterThan(20);
  expect(result.current.value).toBeLessThan(80);
  expect(result.current.revealed).toBe(false);
  act(() => { vi.advanceTimersByTime(470); });
  expect(result.current.value).toBe(100);
  expect(result.current.revealed).toBe(false);
  act(() => { vi.advanceTimersByTime(200); });
  expect(result.current.revealed).toBe(true);
});
it('never exceeds confirmed progress and cancels pending reveal on reset', () => {
  const { result, rerender } = renderHook(({ target, complete, reset }) => useAnimatedProgress(target, complete, reset), { initialProps: { target: 30, complete: false, reset: false } });
  act(() => { vi.advanceTimersByTime(2000); });
  expect(result.current.value).toBe(30);
  expect(result.current.revealed).toBe(false);
  rerender({ target: 100, complete: true, reset: false });
  act(() => { vi.advanceTimersByTime(920); });
  rerender({ target: 0, complete: false, reset: true });
  act(() => { vi.advanceTimersByTime(2000); });
  expect(result.current).toEqual({ value: 0, revealed: false });
});
it('reveals completed results immediately with reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const { result } = renderHook(() => useAnimatedProgress(100, true, false));
  expect(result.current).toEqual({ value: 100, revealed: true });
});
it('fills while awaiting a response, stays below completion, and finishes from its current position', () => {
  const { result, rerender } = renderHook(({ target, complete, waiting }) => useAnimatedProgress(target, complete, false, waiting), { initialProps: { target: 0, complete: false, waiting: true } });
  act(() => { vi.advanceTimersByTime(2000); });
  expect(result.current.value).toBeGreaterThan(0);
  const previous = result.current.value;
  rerender({ target: 5, complete: false, waiting: true });
  act(() => { vi.advanceTimersByTime(1000); });
  expect(result.current.value).toBeGreaterThanOrEqual(previous);
  act(() => { vi.advanceTimersByTime(120000); });
  expect(result.current.value).toBeLessThan(100);
  expect(result.current.revealed).toBe(false);
  rerender({ target: 100, complete: true, waiting: false });
  act(() => { vi.advanceTimersByTime(1200); });
  expect(result.current).toEqual({ value: 100, revealed: true });
});
