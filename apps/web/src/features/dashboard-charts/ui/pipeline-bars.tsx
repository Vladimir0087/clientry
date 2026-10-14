'use client';

import type * as React from 'react';
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';

import { pluralizeDeals } from '@/entities/deal';
import { formatMoney } from '@/shared/lib/money';
import type { PipelineStage } from '@clientry/shared/dashboard';

import { activeItem, ChartTooltip } from './chart-tooltip';
import { truncateStageLabel } from '../model/stage-label';

const AXIS_WIDTH = 140;
const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 };

interface PipelineBarsProps {
  readonly stages: readonly PipelineStage[];
  readonly width: number;
  readonly height: number;
  readonly isAnimated: boolean;
}

// Loaded only in the browser, through next/dynamic: this file and recharts stay out of the server
// render and out of every other route.
export function PipelineBars({
  stages,
  width,
  height,
  isAnimated,
}: PipelineBarsProps): React.JSX.Element {
  const data = stages.map(({ stage, count }) => ({ name: stage.name, count }));
  const renderTooltip = ({ active, activeIndex }: TooltipContentProps): React.ReactNode => {
    const item = active ? activeItem(stages, activeIndex) : undefined;
    if (item === undefined) {
      return null;
    }
    const lines = [
      pluralizeDeals(item.count),
      ...item.totals.map((total) => formatMoney(total.amount, total.currency)),
    ];
    return <ChartTooltip title={item.stage.name} lines={lines} />;
  };
  return (
    <BarChart
      width={width}
      height={height}
      data={data}
      layout="vertical"
      accessibilityLayer={false}
      margin={{ top: 4, right: 32, bottom: 4, left: 0 }}
    >
      <XAxis type="number" hide allowDecimals={false} />
      <YAxis
        type="category"
        dataKey="name"
        width={AXIS_WIDTH}
        tick={TICK}
        tickFormatter={truncateStageLabel}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip content={renderTooltip} cursor={{ fill: 'var(--muted)' }} />
      <Bar
        dataKey="count"
        fill="var(--chart-1)"
        radius={4}
        maxBarSize={24}
        isAnimationActive={isAnimated}
      >
        <LabelList dataKey="count" position="right" fill="var(--muted-foreground)" fontSize={12} />
      </Bar>
    </BarChart>
  );
}
