'use client';

import type * as React from 'react';
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';

import { formatCompactMoney, formatMoney } from '@/shared/lib/money';
import type { ClosedDealsPeriod } from '@clientry/shared/dashboard';
import type { Currency } from '@clientry/shared/deals';

import { activeItem, ChartTooltip } from './chart-tooltip';
import { longMonth, shortMonth } from '../model/month-labels';

const WON_CHART_HEIGHT = 240;

const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 };

function wonAmount(period: ClosedDealsPeriod, currency: Currency): number {
  return period.won.totals.find((total) => total.currency === currency)?.amount ?? 0;
}

interface WonBarsProps {
  readonly periods: readonly ClosedDealsPeriod[];
  readonly currency: Currency;
  readonly width: number;
  readonly isAnimated: boolean;
}

// Loaded only in the browser, through next/dynamic, as the pipeline bars.
export function WonBars({ periods, currency, width, isAnimated }: WonBarsProps): React.JSX.Element {
  // The label rides on its bar: recharts skips zero bars, so an index into data would shift.
  const data = periods.map((period) => {
    const amount = wonAmount(period, currency);
    return {
      month: shortMonth(period.start),
      amount,
      label: amount === 0 ? '' : formatCompactMoney(amount, currency),
    };
  });
  const renderTooltip = ({ active, activeIndex }: TooltipContentProps): React.ReactNode => {
    const period = active ? activeItem(periods, activeIndex) : undefined;
    if (period === undefined) {
      return null;
    }
    const lines = [
      `${String(period.won.count)} won`,
      ...period.won.totals.map((total) => formatMoney(total.amount, total.currency)),
      `${String(period.lost.count)} lost`,
    ];
    return <ChartTooltip title={longMonth(period.start)} lines={lines} />;
  };
  return (
    <BarChart
      width={width}
      height={WON_CHART_HEIGHT}
      data={data}
      accessibilityLayer={false}
      margin={{ top: 24, right: 8, bottom: 4, left: 8 }}
    >
      <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
      <YAxis hide />
      <Tooltip content={renderTooltip} cursor={{ fill: 'var(--muted)' }} />
      <Bar dataKey="amount" fill="var(--chart-2)" radius={4} isAnimationActive={isAnimated}>
        <LabelList dataKey="label" position="top" fill="var(--muted-foreground)" fontSize={12} />
      </Bar>
    </BarChart>
  );
}
