'use client';

import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';

interface RetryFocusBoxProps {
  // The focusTargetId of the RetryMessage inside.
  readonly id: string;
  // What loaded is on screen, a not found state included.
  readonly hasLoaded: boolean;
  readonly children: React.ReactNode;
}

// Holds the focus of Try again while no heading is on screen and hands it to the h1 that loads.
// Focusable only until then, so a click on loaded text does not focus it.
export function RetryFocusBox({ id, hasLoaded, children }: RetryFocusBoxProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (hasLoaded && box !== null && document.activeElement === box) {
      box.querySelector<HTMLElement>('h1')?.focus();
    }
  }, [hasLoaded]);

  const handleFocus = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      setIsFocused(true);
    }
  };
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      setIsFocused(false);
    }
  };
  return (
    <div
      ref={boxRef}
      id={id}
      // Kept while focused: a focused box that stops being focusable drops focus to the body.
      tabIndex={hasLoaded && !isFocused ? undefined : -1}
      className="outline-none"
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
    </div>
  );
}
