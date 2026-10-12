import { useSyncExternalStore } from 'react';

const TICK_MS = 60_000;

const listeners = new Set<() => void>();
let now = new Date();
let timer: number | undefined;

function tick(): void {
  now = new Date();
  for (const listener of listeners) {
    listener();
  }
}

// React reads the snapshot again right after subscribing, so the fresh time set here shows.
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = new Date();
    timer = window.setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
    }
  };
}

// Null on the server and during hydration: the server's clock and zone are not the reader's.
export function useNow(): Date | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
}
