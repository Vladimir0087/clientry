import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced-value';

const DELAY_MS = 300;

function renderDebounced(): ReturnType<typeof renderHook<string, { readonly value: string }>> {
  return renderHook(({ value }) => useDebouncedValue(value, DELAY_MS), {
    initialProps: { value: '' },
  });
}

function wait(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should keep the old value until the delay has passed when the value changes', () => {
    const { result, rerender } = renderDebounced();

    rerender({ value: 'Rom' });
    wait(DELAY_MS - 1);
    expect(result.current).toBe('');
    wait(1);

    expect(result.current).toBe('Rom');
  });

  it('should start the delay over when the value changes again before it ends', () => {
    const { result, rerender } = renderDebounced();

    rerender({ value: 'R' });
    wait(DELAY_MS - 1);
    rerender({ value: 'Ro' });
    wait(DELAY_MS - 1);
    expect(result.current).toBe('');
    wait(1);

    expect(result.current).toBe('Ro');
  });
});
