import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { ClosedDeals } from '@clientry/shared/dashboard';

import { WonDealsSection } from './won-deals-section';
import { makeClosedDeals } from '../../../../test/dashboard';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithUrl } from '../../../../test/render';

const TWO_CURRENCIES = makeClosedDeals([
  {},
  {},
  {},
  {},
  { won: { count: 3, totals: [{ currency: 'EUR', amount: 300_00, count: 3 }] } },
  {
    won: {
      count: 2,
      totals: [
        { currency: 'USD', amount: 1_250_000, count: 1 },
        { currency: 'EUR', amount: 100_00, count: 1 },
      ],
    },
    lost: { count: 1, totals: [{ currency: 'USD', amount: 300_00, count: 1 }] },
  },
]);

const ONE_CURRENCY = makeClosedDeals([
  { won: { count: 1, totals: [{ currency: 'USD', amount: 500_00, count: 1 }] } },
]);

function serve(closedDeals: ClosedDeals): Request[] {
  return recordRequests('get', '/api/dashboard/closed-deals', () => HttpResponse.json(closedDeals));
}

function currencySelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Currency' });
}

describe('WonDealsSection', () => {
  it('should ask for closed deals with seven ascending bounds when it mounts', async () => {
    const requests = serve(TWO_CURRENCIES);

    renderWithUrl(<WonDealsSection />);

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    const bounds = new URL(requests[0]?.url ?? '').searchParams.getAll('bounds');
    expect(bounds).toHaveLength(7);
    expect(bounds.toSorted()).toEqual(bounds);
  });

  it('should list currencies by won count and default to the first when several have won deals', async () => {
    const user = userEvent.setup();
    serve(TWO_CURRENCIES);
    renderWithUrl(<WonDealsSection />);

    expect(await screen.findByRole('combobox', { name: 'Currency' })).toHaveTextContent('EUR');
    expect(screen.getByRole('heading', { name: 'Won deals, last 6 months' })).toBeInTheDocument();
    await user.click(currencySelect());

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['EUR', 'USD']);
  });

  it('should write the currency to the URL when another is chosen and leave the default out', async () => {
    const user = userEvent.setup();
    serve(TWO_CURRENCIES);
    const { urlUpdates } = renderWithUrl(<WonDealsSection />);
    await screen.findByRole('combobox', { name: 'Currency' });

    await user.click(currencySelect());
    await user.click(await screen.findByRole('option', { name: 'USD' }));
    await waitFor(() => {
      expect(urlUpdates.at(-1)?.queryString).toBe('?currency=USD');
    });
    await user.click(currencySelect());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));

    await waitFor(() => {
      expect(urlUpdates.at(-1)?.searchParams.has('currency')).toBe(false);
    });
    expect(urlUpdates.every((update) => update.options.history === 'push')).toBe(true);
  });

  it('should show the default when the URL names a currency without won deals', async () => {
    serve(TWO_CURRENCIES);

    renderWithUrl(<WonDealsSection />, '?currency=PLN');

    expect(await screen.findByRole('combobox', { name: 'Currency' })).toHaveTextContent('EUR');
  });

  it('should name the one currency in the heading and show no select when only one has won deals', async () => {
    serve(ONE_CURRENCY);

    renderWithUrl(<WonDealsSection />);

    expect(
      await screen.findByRole('heading', { name: 'Won deals in USD, last 6 months' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Currency' })).not.toBeInTheDocument();
  });

  it('should hold every month with won and lost numbers in the hidden table when deals were won', async () => {
    serve(TWO_CURRENCIES);

    renderWithUrl(<WonDealsSection />);

    const table = await screen.findByRole('table', { name: 'Won and lost deals by month' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)?.textContent).toMatch(/2\$12,500 · €100 ?1$/);
  });

  it('should say nothing was won when no deals were won in six months', async () => {
    serve(makeClosedDeals([{ lost: { count: 2, totals: [] } }]));

    renderWithUrl(<WonDealsSection />);

    expect(await screen.findByText('No deals won in the last 6 months.')).toBeInTheDocument();
  });
});
