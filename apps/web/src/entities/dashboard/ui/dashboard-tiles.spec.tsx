import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardTiles } from './dashboard-tiles';
import { makeClosedDeals, makeSummary } from '../../../../test/dashboard';

const NONE = { count: 0, totals: [] };

function tile(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

describe('DashboardTiles', () => {
  it('should show each count with its totals line in a labelled group when the data has loaded', () => {
    const closedDeals = makeClosedDeals([
      {},
      {},
      {},
      {},
      {},
      { won: { count: 3, totals: [{ currency: 'USD', amount: 1_250_000, count: 3 }] } },
    ]);

    render(
      <DashboardTiles
        summary={makeSummary()}
        closedDeals={closedDeals}
        isClosedDealsError={false}
      />,
    );

    expect(tile('Open deals')).toHaveTextContent('14$45,500 · €1,200');
    expect(tile('Won this month')).toHaveTextContent('3$12,500');
    expect(tile('Overdue tasks')).toHaveTextContent('4of 23 open tasks');
  });

  it('should round the win rate to a whole percent over all periods when deals were won and lost', () => {
    const won = { count: 1, totals: [{ currency: 'USD' as const, amount: 100, count: 1 }] };
    const closedDeals = makeClosedDeals([
      { won, lost: { count: 2, totals: [] } },
      { won: { ...won, count: 4 }, lost: { count: 5, totals: [] } },
    ]);

    render(
      <DashboardTiles
        summary={makeSummary()}
        closedDeals={closedDeals}
        isClosedDealsError={false}
      />,
    );

    expect(tile('Win rate')).toHaveTextContent('42%5 won of 12 closed in 6 months');
  });

  it('should show the empty lines and a dash when nothing is open or closed', () => {
    const summary = makeSummary({ openDeals: NONE, tasks: { open: 0, overdue: 0 } });

    render(
      <DashboardTiles
        summary={summary}
        closedDeals={makeClosedDeals()}
        isClosedDealsError={false}
      />,
    );

    expect(tile('Open deals')).toHaveTextContent('0Nothing in the pipeline');
    expect(tile('Won this month')).toHaveTextContent('0No deals won yet this month');
    expect(tile('Win rate')).toHaveTextContent('—No deals closed yet');
  });

  it('should show skeletons in the two closed deals tiles when closed deals are loading', () => {
    render(
      <DashboardTiles summary={makeSummary()} closedDeals={undefined} isClosedDealsError={false} />,
    );

    expect(within(tile('Won this month')).getByTestId('tile-skeleton')).toBeInTheDocument();
    expect(within(tile('Win rate')).getByTestId('tile-skeleton')).toBeInTheDocument();
  });

  it('should show a dash in the two closed deals tiles when closed deals failed', () => {
    render(<DashboardTiles summary={makeSummary()} closedDeals={undefined} isClosedDealsError />);

    expect(tile('Won this month')).toHaveTextContent('Won this month—');
    expect(tile('Win rate')).toHaveTextContent('Win rate—');
  });

  it('should show overdue tasks in the danger color when some are overdue', () => {
    render(
      <DashboardTiles summary={makeSummary()} closedDeals={undefined} isClosedDealsError={false} />,
    );

    expect(within(tile('Overdue tasks')).getByText('4')).toHaveClass('text-danger-foreground');
  });
});
