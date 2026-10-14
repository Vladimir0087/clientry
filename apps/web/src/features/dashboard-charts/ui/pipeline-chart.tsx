'use client';

import dynamic from 'next/dynamic';
import type * as React from 'react';

import { pluralizeDeals } from '@/entities/deal';
import { formatTotals } from '@/shared/lib/money';
import type { PipelineStage } from '@clientry/shared/dashboard';

import { ChartBox } from './chart-box';
import { usePrefersReducedMotion } from './use-reduced-motion';

const PipelineBars = dynamic(() => import('./pipeline-bars').then((chart) => chart.PipelineBars), {
  ssr: false,
});

const BAR_HEIGHT = 36;
const MIN_HEIGHT = 160;

// Literal classes, so Tailwind generates them: 36 px per stage, at least 160 px, ten stages at most.
const HEIGHT_CLASSES = [
  'h-40',
  'h-40',
  'h-40',
  'h-40',
  'h-40',
  'h-[180px]',
  'h-[216px]',
  'h-[252px]',
  'h-[288px]',
  'h-[324px]',
  'h-[360px]',
] as const;

interface PipelineChartProps {
  readonly stages: readonly PipelineStage[];
  // The section heading names the figure.
  readonly labelledBy: string;
}

export function PipelineChart({ stages, labelledBy }: PipelineChartProps): React.JSX.Element {
  const isAnimated = !usePrefersReducedMotion();
  const height = Math.max(MIN_HEIGHT, stages.length * BAR_HEIGHT);
  const heightClass = HEIGHT_CLASSES.at(Math.min(stages.length, HEIGHT_CLASSES.length - 1));
  return (
    <figure aria-labelledby={labelledBy} className="m-0">
      <ChartBox className={heightClass ?? 'h-40'}>
        {(width) => (
          <PipelineBars stages={stages} width={width} height={height} isAnimated={isAnimated} />
        )}
      </ChartBox>
      {/* On the box, not the table: a table grows to its content whatever its width. */}
      <div className="sr-only">
        <table>
          <caption>Open deals by stage</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">Deals</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {stages.map(({ stage, count, totals }) => (
              <tr key={stage.id}>
                <th scope="row">{stage.name}</th>
                <td>{pluralizeDeals(count)}</td>
                <td>{totals.length === 0 ? '—' : formatTotals(totals)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
