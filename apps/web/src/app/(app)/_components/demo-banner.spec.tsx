import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sessionKeys } from '@/entities/session';
import { createQueryClient } from '@/shared/api/query-client';
import type { SessionResponse } from '@clientry/shared/auth';

import { DemoBanner } from './demo-banner';
import { TEST_SESSION } from '../../../../test/fixtures';
import { renderWithProviders } from '../../../../test/render';

const DEMO_OWNER: SessionResponse = {
  user: { ...TEST_SESSION.user, name: 'Ann Carter' },
  workspace: { ...TEST_SESSION.workspace, isDemo: true },
  role: 'owner',
};

const DEMO_MANAGER: SessionResponse = {
  ...DEMO_OWNER,
  user: { ...DEMO_OWNER.user, name: 'Max Novak' },
  role: 'manager',
};

function renderBanner(session: SessionResponse): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(sessionKeys.current, session);
  return renderWithProviders(<DemoBanner />, queryClient);
}

describe('DemoBanner', () => {
  it('should name Ann as the owner and warn about shared changes when the demo owner is signed in', () => {
    renderBanner(DEMO_OWNER);

    expect(
      screen.getByText(
        'You are in a shared demo as Ann Carter, the owner. Other visitors see your changes, and the data resets every day.',
      ),
    ).toBeInTheDocument();
  });

  it('should name Max as a manager when the demo manager is signed in', () => {
    renderBanner(DEMO_MANAGER);

    expect(screen.getByText(/as Max Novak, a manager\./)).toBeInTheDocument();
  });

  it('should render nothing when the workspace is not the demo', () => {
    renderBanner(TEST_SESSION);

    expect(screen.queryByText(/shared demo/)).not.toBeInTheDocument();
  });
});
