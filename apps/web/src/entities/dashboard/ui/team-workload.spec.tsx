import { render, screen, within } from '@testing-library/react';
import type { Route } from 'next';
import { describe, expect, it } from 'vitest';

import { TeamWorkload } from './team-workload';
import { makeSummary, MAX } from '../../../../test/dashboard';
import { TEST_SESSION } from '../../../../test/fixtures';

const LINKS = {
  dealsHref: (id: string): Route => `/deals?assignee=${id}` as Route,
  tasksHref: (id: string): Route => `/tasks?assignee=${id}` as Route,
};

function renderTeam(): void {
  render(
    <TeamWorkload
      members={makeSummary().members}
      currentUserId={TEST_SESSION.user.id}
      {...LINKS}
    />,
  );
}

function table(): HTMLElement {
  return screen.getByRole('table');
}

describe('TeamWorkload', () => {
  it('should list every member with their numbers in the table when members are given', () => {
    renderTeam();

    const rows = within(table()).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'MemberOpen dealsIn pipelineOpen tasksOverdue',
      `${TEST_SESSION.user.name}You6$21,00091`,
      `${MAX.name}0—00`,
    ]);
  });

  it('should link the counts to the board and the tasks filtered by the member when they are above zero', () => {
    renderTeam();

    expect(
      within(table()).getByRole('link', { name: `6 open deals of ${TEST_SESSION.user.name}` }),
    ).toHaveAttribute('href', `/deals?assignee=${TEST_SESSION.user.id}`);
    expect(
      within(table()).getByRole('link', { name: `9 open tasks of ${TEST_SESSION.user.name}` }),
    ).toHaveAttribute('href', `/tasks?assignee=${TEST_SESSION.user.id}`);
    expect(within(table()).queryByRole('link', { name: /of Max/ })).not.toBeInTheDocument();
  });

  it('should show overdue tasks as a danger badge when a member has some', () => {
    renderTeam();

    expect(within(table()).getByText('1')).toHaveAttribute('data-variant', 'danger');
  });

  it('should show a card per member with the same links when the screen is narrow', () => {
    renderTeam();

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0] ?? document.body).getByText('You')).toBeInTheDocument();
    expect(
      within(cards[0] ?? document.body).getByRole('link', {
        name: `6 open deals of ${TEST_SESSION.user.name}`,
      }),
    ).toHaveAttribute('href', `/deals?assignee=${TEST_SESSION.user.id}`);
  });
});
