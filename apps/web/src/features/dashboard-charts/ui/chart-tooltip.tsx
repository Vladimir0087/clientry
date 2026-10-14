import type * as React from 'react';

export interface TooltipLines {
  readonly title: string;
  readonly lines: readonly string[];
}

// Recharts passes the hovered or tapped index as a string; null when nothing is active.
export function activeItem<T>(items: readonly T[], activeIndex: unknown): T | undefined {
  if (typeof activeIndex !== 'string' && typeof activeIndex !== 'number') {
    return undefined;
  }
  return items.at(Number(activeIndex));
}

export function ChartTooltip({ title, lines }: TooltipLines): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <span className="font-medium">{title}</span>
      {lines.map((line) => (
        <span key={line} className="text-muted-foreground">
          {line}
        </span>
      ))}
    </div>
  );
}
