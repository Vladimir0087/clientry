import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIsUserActive } from './use-is-user-active';

const IDLE_AFTER_MS = 15 * 60_000;

describe('useIsUserActive', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should turn idle when 15 minutes pass without input', () => {
    const { result } = renderHook(() => useIsUserActive());

    act(() => {
      vi.advanceTimersByTime(IDLE_AFTER_MS);
    });

    expect(result.current).toBe(false);
  });

  it('should count a click as input when it comes without pointer events', () => {
    const { result } = renderHook(() => useIsUserActive());
    act(() => {
      vi.advanceTimersByTime(IDLE_AFTER_MS);
    });

    fireEvent.click(document.body);

    expect(result.current).toBe(true);
  });
});
