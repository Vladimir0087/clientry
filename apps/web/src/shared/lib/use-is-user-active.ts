import { useEffect, useState } from 'react';

const IDLE_AFTER_MS = 15 * 60_000;
// A screen reader in browse mode activates with a click and no pointer events.
const INPUT_EVENTS = ['keydown', 'pointerdown', 'click', 'scroll', 'touchstart'] as const;

function listenToInput(handleInput: () => void): () => void {
  for (const type of INPUT_EVENTS) {
    window.addEventListener(type, handleInput, { capture: true, passive: true });
  }
  return () => {
    for (const type of INPUT_EVENTS) {
      window.removeEventListener(type, handleInput, { capture: true });
    }
  };
}

// True while the user has given input within 15 minutes; loading the page counts as input.
export function useIsUserActive(): boolean {
  const [isActive, setIsActive] = useState(true);
  useEffect(() => {
    let lastInputAt = Date.now();
    let timer: number | undefined;
    // One timer per idle period, not per event: scroll fires often.
    const scheduleIdleCheck = (delayMs: number): void => {
      timer = window.setTimeout(() => {
        const idleMs = Date.now() - lastInputAt;
        if (idleMs >= IDLE_AFTER_MS) {
          timer = undefined;
          setIsActive(false);
        } else {
          scheduleIdleCheck(IDLE_AFTER_MS - idleMs);
        }
      }, delayMs);
    };
    scheduleIdleCheck(IDLE_AFTER_MS);
    const stopListening = listenToInput(() => {
      lastInputAt = Date.now();
      setIsActive(true);
      if (timer === undefined) {
        scheduleIdleCheck(IDLE_AFTER_MS);
      }
    });
    return () => {
      window.clearTimeout(timer);
      stopListening();
    };
  }, []);
  return isActive;
}
