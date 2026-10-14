'use client';

import { cn } from 'cn';
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';

interface ChartBoxProps {
  // A height class, set in the server HTML so nothing shifts when the chart draws.
  readonly className: string;
  readonly children: (width: number) => React.ReactNode;
}

// Recharts needs a measured width; the chart draws only once there is one, so it never renders
// at zero size. Hidden from screen readers: the table after it holds every number.
export function ChartBox({ className, children }: ChartBoxProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (box === null) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry?.contentRect.width ?? 0));
    });
    // The observer reports the first size right after observe.
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <div ref={boxRef} aria-hidden="true" className={cn('w-full min-w-0', className)}>
      {width > 0 && children(width)}
    </div>
  );
}
