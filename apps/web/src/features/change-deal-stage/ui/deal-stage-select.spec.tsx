import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { dealKeys, stageKeys } from '@/entities/deal';
import { createQueryClient } from '@/shared/api/query-client';

import { DealStageSelect } from './deal-stage-select';
import { CALL_STAGE, TEST_DEAL, TEST_STAGES } from '../../../../test/deals';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const LABEL_ID = 'stage-label';

function renderSelect(): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(stageKeys.list, TEST_STAGES);
  queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), TEST_DEAL);
  return renderWithProviders(
    <>
      <span id={LABEL_ID}>Stage</span>
      <DealStageSelect deal={TEST_DEAL} labelId={LABEL_ID} />
    </>,
    queryClient,
  );
}

describe('DealStageSelect', () => {
  it('should keep an empty status region in place when no move is pending', () => {
    renderSelect();

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('should say the deal is moving in the region already there when a stage is chosen', async () => {
    recordRequests('post', `/api/deals/${TEST_DEAL.id}/move`, async () =>
      delay('infinite').then(() => HttpResponse.json({ ...TEST_DEAL, stage: CALL_STAGE })),
    );
    const user = userEvent.setup();
    renderSelect();
    const status = screen.getByRole('status');

    await user.click(screen.getByRole('combobox', { name: 'Stage' }));
    await user.click(await screen.findByRole('option', { name: 'Call' }));

    await waitFor(() => {
      expect(status).toHaveTextContent('Moving the deal…');
    });
    expect(screen.getAllByRole('status', { hidden: true })).toEqual([status]);
  });
});
