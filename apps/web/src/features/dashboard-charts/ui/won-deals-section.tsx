'use client';

import dynamic from 'next/dynamic';
import { useId } from 'react';
import type * as React from 'react';

import { PERIOD_MONTHS, useClosedDeals, usePeriodBounds } from '@/entities/dashboard';
import { formatTotals } from '@/shared/lib/money';
import { Label } from '@/shared/ui/label';
import { OptionSelect } from '@/shared/ui/option-select';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Skeleton } from '@/shared/ui/skeleton';
import type { ClosedDeals } from '@clientry/shared/dashboard';
import type { Currency } from '@clientry/shared/deals';

import { ChartBox } from './chart-box';
import { usePrefersReducedMotion } from './use-reduced-motion';
import { longMonth } from '../model/month-labels';
import { useWonCurrency } from '../model/use-won-currency';
import { wonCurrencies } from '../model/won-currencies';

const WonBars = dynamic(() => import('./won-bars').then((chart) => chart.WonBars), {
  ssr: false,
});

const PERIOD_TEXT = `last ${String(PERIOD_MONTHS)} months`;

interface WonChartProps {
  readonly closedDeals: ClosedDeals;
  readonly currency: Currency;
  readonly labelledBy: string;
}

function WonChart({ closedDeals, currency, labelledBy }: WonChartProps): React.JSX.Element {
  const isAnimated = !usePrefersReducedMotion();
  return (
    <figure aria-labelledby={labelledBy} className="m-0">
      <ChartBox className="h-60">
        {(width) => (
          <WonBars
            periods={closedDeals.periods}
            currency={currency}
            width={width}
            isAnimated={isAnimated}
          />
        )}
      </ChartBox>
      {/* On the box, not the table: a table grows to its content whatever its width. */}
      <div className="sr-only">
        <table>
          <caption>Won and lost deals by month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Won deals</th>
              <th scope="col">Won amount</th>
              <th scope="col">Lost deals</th>
            </tr>
          </thead>
          <tbody>
            {closedDeals.periods.map((period) => (
              <tr key={period.start}>
                <th scope="row">{longMonth(period.start)}</th>
                <td>{period.won.count}</td>
                <td>{period.won.count === 0 ? '—' : formatTotals(period.won.totals)}</td>
                <td>{period.lost.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

interface CurrencyPickerProps {
  readonly currencies: readonly Currency[];
  readonly currency: Currency | undefined;
  readonly onChange: (currency: Currency) => void;
}

function CurrencyPicker({
  currencies,
  currency,
  onChange,
}: CurrencyPickerProps): React.JSX.Element {
  const id = useId();
  const handleChange = (value: string): void => {
    const next = currencies.find((option) => option === value);
    if (next !== undefined) {
      onChange(next);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id}>Currency</Label>
      <OptionSelect
        id={id}
        aria-invalid={false}
        aria-describedby={undefined}
        options={currencies.map((option) => ({ value: option, label: option }))}
        value={currency}
        onChange={handleChange}
        className="w-24"
      />
    </div>
  );
}

// The won amount per month in one currency at a time: amounts in different currencies never add.
export function WonDealsSection(): React.JSX.Element {
  const headingId = useId();
  const closedDeals = useClosedDeals(usePeriodBounds());
  const currencies = closedDeals.data === undefined ? [] : wonCurrencies(closedDeals.data);
  const { currency, setCurrency } = useWonCurrency(currencies);
  const [only] = currencies.length === 1 ? currencies : [];
  const handleRetry = (): void => {
    void closedDeals.refetch();
  };
  const body = (): React.ReactNode => {
    if (closedDeals.data === undefined) {
      return closedDeals.isError ? (
        <RetryMessage
          message="We could not load won deals."
          focusTargetId={headingId}
          onRetry={handleRetry}
        />
      ) : (
        <Skeleton data-testid="won-chart-skeleton" className="h-60" />
      );
    }
    if (currency === undefined) {
      return <p className="text-sm text-muted-foreground">No deals won in the {PERIOD_TEXT}.</p>;
    }
    return <WonChart closedDeals={closedDeals.data} currency={currency} labelledBy={headingId} />;
  };
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold outline-none">
          {only === undefined
            ? `Won deals, ${PERIOD_TEXT}`
            : `Won deals in ${only}, ${PERIOD_TEXT}`}
        </h2>
        {currencies.length > 1 && (
          <CurrencyPicker currencies={currencies} currency={currency} onChange={setCurrency} />
        )}
      </div>
      {body()}
    </section>
  );
}
