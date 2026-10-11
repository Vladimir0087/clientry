import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { dealKeys, stageKeys } from '@/entities/deal';
import { createQueryClient } from '@/shared/api/query-client';
import { PageHeading } from '@/shared/ui/page-heading';
import type { StageListItem, StageListResponse } from '@clientry/shared/deals';

import { StageManager } from './stage-manager';
import { stageItemAt, TEST_DEAL, TEST_STAGES } from '../../../../test/deals';
import { TEST_SESSION } from '../../../../test/fixtures';
import { failOnceThenWait } from '../../../../test/msw/fail-once';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const NEW = stageItemAt(0);
const CALL = stageItemAt(1);
const PROPOSAL = stageItemAt(2);
const CONTRACT = stageItemAt(3);
const PAID = stageItemAt(4);
const LOST = stageItemAt(5);
const HEADING_ID = 'stages-heading';

function idsOf(stages: readonly StageListItem[]): string[] {
  return stages.map((stage) => stage.id);
}

function renderManager(
  stages: StageListResponse = TEST_STAGES,
): ReturnType<typeof renderWithProviders> {
  const queryClient = createQueryClient();
  queryClient.setQueryData(stageKeys.list, stages);
  return renderWithProviders(
    <>
      <PageHeading id={HEADING_ID}>Stages</PageHeading>
      <StageManager headingId={HEADING_ID} />
    </>,
    queryClient,
  );
}

function withOpenStages(count: number): StageListResponse {
  const open = Array.from({ length: count }, (_, index) => ({
    id: `0199a3c4-6f70-7a81-9b2c-${String(100 + index).padStart(12, '0')}`,
    name: `Stage ${String(index + 1)}`,
    kind: 'open' as const,
    dealCount: 0,
  }));
  return { items: [...open, ...TEST_STAGES.items.filter((stage) => stage.kind !== 'open')] };
}

function withDeals(stageId: string, dealCount: number): StageListResponse {
  return {
    items: TEST_STAGES.items.map((stage) =>
      stage.id === stageId ? { ...stage, dealCount } : stage,
    ),
  };
}

describe('StageManager', () => {
  it('should give controls for every open stage when the viewer is the owner', async () => {
    renderManager();

    expect(await screen.findByRole('button', { name: 'Move Call up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move New up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rename Paid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Paid' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('New stage')).toBeEnabled();
  });

  it('should show the list without controls and say why when the viewer is a manager', async () => {
    recordRequests('get', '/api/auth/me', () =>
      HttpResponse.json({ ...TEST_SESSION, role: 'manager' }),
    );
    renderManager();

    expect(await screen.findByText('Only owners can change stages.')).toBeInTheDocument();
    expect(screen.getByText('Proposal sent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New stage')).not.toBeInTheDocument();
  });

  it('should focus the Stages heading when Try again reloads the stages', async () => {
    recordRequests('get', '/api/stages', failOnceThenWait(TEST_STAGES));
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <PageHeading id={HEADING_ID}>Stages</PageHeading>
        <StageManager headingId={HEADING_ID} />
      </>,
    );

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('stage-list-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
  });

  it('should send the new order and keep focus on the pressed button when Move up is pressed', async () => {
    const reordered: StageListResponse = { items: [NEW, PROPOSAL, CALL, CONTRACT, PAID, LOST] };
    const requests = recordRequests('put', '/api/stages/order', () => HttpResponse.json(reordered));
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Move Proposal sent up' }));

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(await requests[0]?.json()).toEqual({ ids: idsOf([NEW, PROPOSAL, CALL, CONTRACT]) });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Move Proposal sent up' })).toHaveFocus();
    });
  });

  it('should move focus to Move down when the stage reaches the top', async () => {
    const reordered: StageListResponse = { items: [CALL, NEW, PROPOSAL, CONTRACT, PAID, LOST] };
    recordRequests('put', '/api/stages/order', () => HttpResponse.json(reordered));
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Move Call up' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Move Call down' })).toHaveFocus();
    });
  });

  it('should move focus to Move up when the stage reaches the bottom', async () => {
    const reordered: StageListResponse = { items: [NEW, CALL, CONTRACT, PROPOSAL, PAID, LOST] };
    recordRequests('put', '/api/stages/order', () => HttpResponse.json(reordered));
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Move Proposal sent down' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Move Proposal sent up' })).toHaveFocus();
    });
  });

  it('should show the new name before the refetch when a rename is saved', async () => {
    recordRequests('patch', `/api/stages/${CALL.id}`, () =>
      HttpResponse.json({ id: CALL.id, name: 'Discovery call', kind: 'open' }),
    );
    recordRequests('get', '/api/stages', async () =>
      delay('infinite').then(() => HttpResponse.json(TEST_STAGES)),
    );
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Rename Call' }));
    const field = screen.getByLabelText('Stage name');
    await user.clear(field);
    await user.type(field, 'Discovery call');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Discovery call')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Discovery call' })).toHaveFocus();
  });

  it('should close the rename form and focus Rename when Escape is pressed on Cancel', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Rename Call' }));
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Stage name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Call' })).toHaveFocus();
  });

  it('should take the rename form away when the session comes back with the manager role', async () => {
    recordRequests('patch', `/api/stages/${CALL.id}`, () =>
      problemResponse(403, 'INSUFFICIENT_ROLE'),
    );
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByRole('button', { name: 'Rename Call' }));
    await user.type(screen.getByLabelText('Stage name'), ' back');
    recordRequests('get', '/api/auth/me', () =>
      HttpResponse.json({ ...TEST_SESSION, role: 'manager' }),
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Stage name')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Rename/ })).not.toBeInTheDocument();
  });

  it('should default the target to the previous stage and send it when a stage is deleted', async () => {
    const requests = recordRequests(
      'delete',
      `/api/stages/${PROPOSAL.id}`,
      () => new HttpResponse(null, { status: 204 }),
    );
    const user = userEvent.setup();
    renderManager(withDeals(PROPOSAL.id, 2));

    await user.click(await screen.findByRole('button', { name: 'Delete Proposal sent' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('combobox', { name: 'Its 2 deals move to' })).toHaveTextContent(
      'Call',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(new URL(requests[0]?.url ?? '').searchParams.get('moveDealsTo')).toBe(CALL.id);
  });

  it('should refetch and offer another target when the chosen one is gone', async () => {
    recordRequests('delete', `/api/stages/${PROPOSAL.id}`, () =>
      problemResponse(400, 'VALIDATION_FAILED', {
        errors: [{ path: 'moveDealsTo', message: 'Choose another open stage' }],
      }),
    );
    const withoutCall = withDeals(PROPOSAL.id, 2).items.filter((stage) => stage.id !== CALL.id);
    const reads = recordRequests('get', '/api/stages', () =>
      HttpResponse.json({ items: withoutCall }),
    );
    const user = userEvent.setup();
    renderManager(withDeals(PROPOSAL.id, 2));

    await user.click(await screen.findByRole('button', { name: 'Delete Proposal sent' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByText('Choose another open stage')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(dialog).getByRole('combobox', { name: 'Its 2 deals move to' }),
      ).toHaveTextContent('New');
    });
    expect(reads.length).toBeGreaterThan(0);
  });

  it('should mark the cached deals stale when a stage is renamed', async () => {
    recordRequests('patch', `/api/stages/${CALL.id}`, () =>
      HttpResponse.json({ id: CALL.id, name: 'Discovery call', kind: 'open' }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderManager();
    queryClient.setQueryData(dealKeys.detail(TEST_DEAL.id), TEST_DEAL);

    await user.click(await screen.findByRole('button', { name: 'Rename Call' }));
    await user.clear(screen.getByLabelText('Stage name'));
    await user.type(screen.getByLabelText('Stage name'), 'Discovery call');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(queryClient.getQueryState(dealKeys.detail(TEST_DEAL.id))?.isInvalidated).toBe(true);
    });
  });

  it('should keep the rename form when Escape is pressed while the name is saving', async () => {
    recordRequests('patch', `/api/stages/${CALL.id}`, async () =>
      delay('infinite').then(() => HttpResponse.json(CALL)),
    );
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Rename Call' }));
    await user.type(screen.getByLabelText('Stage name'), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByLabelText('Stage name'));
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Stage name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('should focus the page heading when a rename finds the stage deleted elsewhere', async () => {
    recordRequests('patch', `/api/stages/${CALL.id}`, () =>
      problemResponse(404, 'STAGE_NOT_FOUND'),
    );
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Rename Call' }));
    await user.type(screen.getByLabelText('Stage name'), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
    });
  });

  it('should focus the name field again when a rename fails and the form stays', async () => {
    recordRequests('patch', `/api/stages/${CALL.id}`, () => problemResponse(500, 'INTERNAL_ERROR'));
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Rename Call' }));
    await user.type(screen.getByLabelText('Stage name'), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Stage name')).toHaveFocus();
  });

  it('should show the deals to move when a refetch brings them while the dialog is open', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderManager();

    await user.click(await screen.findByRole('button', { name: 'Delete Proposal sent' }));
    const dialog = await screen.findByRole('alertdialog');
    act(() => {
      queryClient.setQueryData(stageKeys.list, withDeals(PROPOSAL.id, 2));
    });

    expect(
      await within(dialog).findByRole('combobox', { name: 'Its 2 deals move to' }),
    ).toBeInTheDocument();
  });

  it('should close with a toast and send nothing when a refetch leaves no stage to move deals to', async () => {
    const deletes = recordRequests(
      'delete',
      `/api/stages/${NEW.id}`,
      () => new HttpResponse(null, { status: 204 }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderManager(withDeals(NEW.id, 2));
    await user.click(await screen.findByRole('button', { name: 'Delete New' }));
    const dialog = await screen.findByRole('alertdialog');
    act(() => {
      queryClient.setQueryData(stageKeys.list, {
        items: TEST_STAGES.items
          .filter((stage) => stage.kind !== 'open' || stage.id === NEW.id)
          .map((stage) => (stage.id === NEW.id ? { ...stage, dealCount: 2 } : stage)),
      });
    });

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('A pipeline needs at least one open stage')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
    });
    expect(deletes).toHaveLength(0);
  });

  it('should return focus to the Delete button when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Delete Proposal sent' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete Proposal sent' })).toHaveFocus();
    });
  });

  it('should focus the page heading when the delete finds the stage deleted elsewhere', async () => {
    recordRequests('delete', `/api/stages/${PROPOSAL.id}`, () =>
      problemResponse(404, 'STAGE_NOT_FOUND'),
    );
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Delete Proposal sent' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
    });
  });

  it('should focus the page heading when the deleted stage row goes away', async () => {
    recordRequests(
      'delete',
      `/api/stages/${PROPOSAL.id}`,
      () => new HttpResponse(null, { status: 204 }),
    );
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Delete Proposal sent' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
    });
  });

  it('should disable adding with a hint when there are ten open stages', async () => {
    renderManager(withOpenStages(10));

    const field = await screen.findByLabelText('New stage');
    expect(field).toBeDisabled();
    expect(field).toHaveAccessibleDescription('A pipeline can have at most 10 open stages.');
    expect(screen.getByRole('button', { name: 'Add stage' })).toBeDisabled();
  });

  it('should focus the heading and name the limit when the tenth open stage is added', async () => {
    recordRequests('post', '/api/stages', () =>
      HttpResponse.json({ id: CALL.id, name: 'Demo', kind: 'open' }, { status: 201 }),
    );
    const user = userEvent.setup();
    renderManager(withOpenStages(9));

    await user.type(await screen.findByLabelText('New stage'), 'Demo');
    await user.click(screen.getByRole('button', { name: 'Add stage' }));

    expect(
      await screen.findByText('Stage Demo added. A pipeline can have at most 10 open stages.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
  });

  it('should put a taken name on the field when the API answers STAGE_NAME_TAKEN', async () => {
    recordRequests('post', '/api/stages', () =>
      problemResponse(409, 'STAGE_NAME_TAKEN', { detail: 'A stage with this name already exists' }),
    );
    const user = userEvent.setup();
    renderManager();

    await user.type(await screen.findByLabelText('New stage'), 'call');
    await user.click(screen.getByRole('button', { name: 'Add stage' }));

    await waitFor(() => {
      expect(screen.getByLabelText('New stage')).toHaveAccessibleDescription(
        'A stage with this name already exists',
      );
    });
  });

  it('should focus the heading when adding loses the race for the last open stage', async () => {
    recordRequests('post', '/api/stages', () =>
      problemResponse(409, 'STAGE_LIMIT_REACHED', {
        detail: 'A pipeline can have at most 10 open stages',
      }),
    );
    recordRequests('get', '/api/stages', () => HttpResponse.json(withOpenStages(10)));
    const user = userEvent.setup();
    renderManager(withOpenStages(9));

    await user.type(await screen.findByLabelText('New stage'), 'Demo');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByLabelText('New stage')).toBeDisabled();
    });
    expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
  });

  it('should focus the field again when adding fails and the form stays', async () => {
    recordRequests('post', '/api/stages', () => problemResponse(500, 'INTERNAL_ERROR'));
    const user = userEvent.setup();
    renderManager();

    await user.type(await screen.findByLabelText('New stage'), 'Demo');
    await user.click(screen.getByRole('button', { name: 'Add stage' }));

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('New stage')).toHaveFocus();
  });

  it('should leave focus where the user moved it when adding fails', async () => {
    let release = (): void => undefined;
    const requests = recordRequests('post', '/api/stages', async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return problemResponse(500, 'INTERNAL_ERROR');
    });
    const user = userEvent.setup();
    renderManager();
    await user.type(await screen.findByLabelText('New stage'), 'Demo');
    await user.click(screen.getByRole('button', { name: 'Add stage' }));
    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });

    screen.getByRole('button', { name: 'Rename Call' }).focus();
    release();

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Call' })).toHaveFocus();
  });

  it('should explain and refetch when the stages changed elsewhere', async () => {
    recordRequests('put', '/api/stages/order', () => problemResponse(409, 'STAGES_CHANGED'));
    const reads = recordRequests('get', '/api/stages', () => HttpResponse.json(TEST_STAGES));
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole('button', { name: 'Move Call up' }));

    expect(
      await screen.findByText('The stages were changed elsewhere. The list is updated.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(reads.length).toBeGreaterThan(0);
    });
  });

  it('should clear the field and announce the stage when it is added', async () => {
    recordRequests('post', '/api/stages', () =>
      HttpResponse.json({ id: CALL.id, name: 'Demo', kind: 'open' }, { status: 201 }),
    );
    const user = userEvent.setup();
    renderManager();

    const field = await screen.findByLabelText('New stage');
    await user.type(field, 'Demo');
    await user.click(screen.getByRole('button', { name: 'Add stage' }));

    expect(await screen.findByText('Stage Demo added')).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
  });

  it('should empty the added status when a new stage name is typed', async () => {
    recordRequests('post', '/api/stages', () =>
      HttpResponse.json({ id: CALL.id, name: 'Demo', kind: 'open' }, { status: 201 }),
    );
    const user = userEvent.setup();
    renderManager();
    const field = await screen.findByLabelText('New stage');
    await user.type(field, 'Demo');
    await user.click(screen.getByRole('button', { name: 'Add stage' }));
    const status = await screen.findByText('Stage Demo added');

    await user.type(field, 'D');

    expect(status).toBeEmptyDOMElement();
  });
});
