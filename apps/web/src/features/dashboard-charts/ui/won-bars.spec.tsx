import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ClosedDealsPeriod } from '@clientry/shared/dashboard';

import { WonBars } from './won-bars';
import { makeClosedDeals } from '../../../../test/dashboard';

function wonInUsd(amount: number): Pick<ClosedDealsPeriod, 'won'> {
  return { won: { count: 1, totals: [{ currency: 'USD', amount, count: 1 }] } };
}

describe('WonBars', () => {
  it('should put each amount over its own month when months between have nothing won', () => {
    const { periods } = makeClosedDeals([
      {},
      wonInUsd(300_000),
      {},
      wonInUsd(450_000),
      {},
      wonInUsd(800_000),
    ]);

    const { container } = render(
      <WonBars periods={periods} currency="USD" width={600} isAnimated={false} />,
    );

    const labels = [...container.querySelectorAll('.recharts-label-list text')].map(
      (label) => label.textContent,
    );
    expect(labels.filter((label) => label !== '')).toEqual(['$3K', '$4.5K', '$8K']);
  });
});
