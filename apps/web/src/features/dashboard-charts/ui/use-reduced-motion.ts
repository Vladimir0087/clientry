import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(listener: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', listener);
  return () => {
    list.removeEventListener('change', listener);
  };
}

// The charts draw only in the browser, so the server answer is never shown.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
