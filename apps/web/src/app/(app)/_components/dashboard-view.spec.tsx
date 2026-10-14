import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { DashboardSummary } from '@clientry/shared/dashboard';

import { DashboardView } from './dashboard-view';
import { makeActivityEntry, makeActivityPage } from '../../../../test/activity';
import { EMPTY_SUMMARY, makeSummary } from '../../../../test/dashboard';
import { problemResponse } from '../../../../test/msw/problem';
import { server } from '../../../../test/msw/server';
import { renderWithUrl } from '../../../../test/render';

function failOnce(path: string, body: DashboardSummary): void {
  let hasFailed = false;
  server.use(
    http.get(`*${path}`, () => {
      if (hasFailed) {
        return HttpResponse.json(body);
      }
      hasFailed = true;
      return problemResponse(400, 'VALIDATION_FAILED');
    }),
  );
}

function fail(path: string): void {
  server.use(http.get(`*${path}`, () => problemResponse(400, 'VALIDATION_FAILED')));
}

describe('DashboardView', () => {
  it('should show the tiles, the pipeline, the team and the feed when everything loads', async () => {
    server.use(
      http.get('*/api/dashboard/summary', () => HttpResponse.json(makeSummary())),
      http.get('*/api/activity', () => HttpResponse.json(makeActivityPage([makeActivityEntry(1)]))),
    );

    renderWithUrl(<DashboardView />);

    expect(await screen.findByRole('group', { name: 'Open deals' })).toHaveTextContent('14');
    expect(screen.getByRole('figure', { name: 'Pipeline' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open board' })).toHaveAttribute('href', '/deals');
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(await screen.findByText('Subject 1')).toBeInTheDocument();
  });

  it('should invite to the board when no deal is open', async () => {
    renderWithUrl(<DashboardView />);

    const pipeline = await screen.findByRole('region', { name: 'Pipeline' });
    expect(pipeline).toHaveTextContent('No open deals. Add one on the board.');
    expect(within(pipeline).getByRole('link', { name: 'board' })).toHaveAttribute('href', '/deals');
  });

  it('should show one error in place of the summary and focus Dashboard on Try again when the summary fails', async () => {
    const user = userEvent.setup();
    failOnce('/api/dashboard/summary', EMPTY_SUMMARY);
    renderWithUrl(<DashboardView />);

    expect(await screen.findByText('We could not load the dashboard.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pipeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Team' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toHaveFocus();
    expect(await screen.findByRole('group', { name: 'Open deals' })).toBeInTheDocument();
  });

  it('should show the won deals error and a dash in two tiles when closed deals fail', async () => {
    fail('/api/dashboard/closed-deals');

    renderWithUrl(<DashboardView />);

    expect(await screen.findByText('We could not load won deals.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Won this month' })).toHaveTextContent('—');
    expect(screen.getByRole('group', { name: 'Win rate' })).toHaveTextContent('—');
  });

  it('should focus the won deals heading on Try again when closed deals fail', async () => {
    const user = userEvent.setup();
    fail('/api/dashboard/closed-deals');
    renderWithUrl(<DashboardView />);
    const section = await screen.findByRole('region', { name: 'Won deals, last 6 months' });

    await user.click(await within(section).findByRole('button', { name: 'Try again' }));

    expect(within(section).getByRole('heading')).toHaveFocus();
  });

  it('should show the activity error and focus its heading on Try again when the feed fails', async () => {
    const user = userEvent.setup();
    fail('/api/activity');
    renderWithUrl(<DashboardView />);
    const section = await screen.findByRole('region', { name: 'Activity' });

    expect(await within(section).findByText('We could not load activity.')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Try again' }));

    expect(within(section).getByRole('heading', { name: 'Activity' })).toHaveFocus();
  });
});
