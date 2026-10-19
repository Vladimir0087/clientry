import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { dealKeys } from '@/entities/deal';
import { memberKeys } from '@/entities/member';
import { sessionKeys } from '@/entities/session';
import { taskKeys } from '@/entities/task';
import { createQueryClient } from '@/shared/api/query-client';
import type { SessionResponse } from '@clientry/shared/auth';
import type { Member } from '@clientry/shared/workspaces';

import { TeamView } from './team-view';
import { makeBoard } from '../../../../../test/deals';
import { TEST_SESSION } from '../../../../../test/fixtures';
import { held } from '../../../../../test/held';
import { problemResponse } from '../../../../../test/msw/problem';
import { recordRequests } from '../../../../../test/msw/record';
import type { Resolver } from '../../../../../test/msw/record';
import { renderWithProviders } from '../../../../../test/render';

function member(id: string, name: string, role: Member['role']): Member {
  return {
    id,
    name,
    email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@example.com`,
    role,
    joinedAt: '2026-10-01T09:00:00.000Z',
  };
}

const ANN = member(TEST_SESSION.user.id, TEST_SESSION.user.name, 'owner');
const MAX = member('0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f', 'Max Kim', 'manager');
const KIM = member('0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e70', 'Kim Park', 'manager');
const ZOE = member('0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e71', 'Zoe Lee', 'manager');

type User = ReturnType<typeof userEvent.setup>;

describe('TeamView', () => {
  let members: Member[];
  let session: SessionResponse;
  let meRequests: Request[];
  let memberRequests: Request[];
  let inviteRequests: Request[];

  beforeEach(() => {
    members = [ANN, MAX, KIM];
    session = TEST_SESSION;
    memberRequests = recordRequests('get', '/api/members', () =>
      HttpResponse.json({ items: members }),
    );
    inviteRequests = recordRequests('get', '/api/invites', () => HttpResponse.json({ items: [] }));
    meRequests = recordRequests('get', '/api/auth/me', () => HttpResponse.json(session));
  });

  function renderTeam(): ReturnType<typeof renderWithProviders> {
    return renderWithProviders(<TeamView />);
  }

  async function openActions(user: User, name: string): Promise<void> {
    const [trigger] = await screen.findAllByRole('button', { name: `Actions for ${name}` });
    if (trigger === undefined) {
      throw new Error(`No actions for ${name}`);
    }
    await user.click(trigger);
  }

  function answerPatch(id: string, resolver: Resolver): Request[] {
    return recordRequests('patch', `/api/members/${id}`, resolver);
  }

  function answerDelete(id: string, resolver: Resolver): Request[] {
    return recordRequests('delete', `/api/members/${id}`, resolver);
  }

  describe('access', () => {
    it('should show actions and the invites when the viewer is an owner', async () => {
      renderTeam();

      expect(
        await screen.findAllByRole('button', { name: 'Actions for Max Kim' }),
      ).not.toHaveLength(0);
      expect(await screen.findByRole('heading', { name: 'Pending invites' })).toBeInTheDocument();
    });

    it('should put the You badge on the caller row only when the members load', async () => {
      renderTeam();

      const ownRow = await screen.findByRole('row', { name: /^Ann Lee/ });
      const otherRow = screen.getByRole('row', { name: /^Max Kim/ });

      expect(within(ownRow).getByText('You')).toBeInTheDocument();
      expect(within(otherRow).queryByText('You')).not.toBeInTheDocument();
    });

    it('should hide actions and invites and say why when the viewer is a manager', async () => {
      session = { ...TEST_SESSION, role: 'manager' };
      renderTeam();

      expect(
        await screen.findByText('Only owners can invite people and change roles.'),
      ).toBeInTheDocument();
      await screen.findAllByText('Max Kim');
      expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Pending invites' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    });
  });

  describe('in the demo', () => {
    const DEMO_LINE =
      'Inviting people, changing roles, removing members and renaming the workspace are turned off in the demo.';

    function demoSession(role: SessionResponse['role']): SessionResponse {
      return {
        ...TEST_SESSION,
        workspace: { ...TEST_SESSION.workspace, isDemo: true },
        role,
      };
    }

    it('should show the demo line without owner controls or an invites request when the demo owner opens the page', async () => {
      session = demoSession('owner');
      renderTeam();

      expect(await screen.findByText(DEMO_LINE)).toBeInTheDocument();
      await screen.findAllByText('Max Kim');
      expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Pending invites' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
      expect(inviteRequests).toHaveLength(0);
    });

    it('should keep the owners-only line when the viewer is the demo manager', async () => {
      session = demoSession('manager');
      renderTeam();

      expect(
        await screen.findByText('Only owners can invite people and change roles.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(DEMO_LINE)).not.toBeInTheDocument();
    });
  });

  describe('roles', () => {
    it('should promote without a confirmation and say so when Make owner is chosen', async () => {
      const patches = answerPatch(MAX.id, () => HttpResponse.json({ ...MAX, role: 'owner' }));
      const user = userEvent.setup();
      renderTeam();

      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Make owner' }));

      expect(await screen.findByText('Max Kim is now an owner')).toBeInTheDocument();
      expect(await patches[0]?.json()).toEqual({ role: 'owner' });
    });

    it('should disable Make manager and offer no removal on the own row when the caller is the only owner', async () => {
      const user = userEvent.setup();
      renderTeam();

      await openActions(user, ANN.name);

      const item = await screen.findByRole('menuitem', { name: /Make manager/ });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Add another owner first');
      expect(
        screen.queryByRole('menuitem', { name: 'Remove from workspace' }),
      ).not.toBeInTheDocument();
    });

    it('should keep the blocked Make manager reachable and send nothing when it is chosen', async () => {
      const patches = answerPatch(ANN.id, () => HttpResponse.json(ANN));
      const user = userEvent.setup();
      renderTeam();
      await openActions(user, ANN.name);
      const item = await screen.findByRole('menuitem', { name: /Make manager/ });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(item).toHaveFocus();
      expect(patches).toHaveLength(0);
    });

    it('should disable the role item when a change of it is still pending', async () => {
      const answered = Promise.withResolvers<undefined>();
      answerPatch(MAX.id, async () => {
        await answered.promise;
        return HttpResponse.json({ ...MAX, role: 'owner' });
      });
      const user = userEvent.setup();
      renderTeam();
      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Make owner' }));

      await openActions(user, 'Max Kim');

      const item = await screen.findByRole('menuitem', { name: 'Make owner' });
      expect(item).toHaveAttribute('data-disabled');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      answered.resolve(undefined);
    });

    it('should confirm, refetch the session and drop the actions when the owner demotes themselves', async () => {
      members = [ANN, { ...MAX, role: 'owner' }, KIM];
      answerPatch(ANN.id, () => {
        session = { ...TEST_SESSION, role: 'manager' };
        members = [{ ...ANN, role: 'manager' }, { ...MAX, role: 'owner' }, KIM];
        return HttpResponse.json(members[0]);
      });
      const user = userEvent.setup();
      renderTeam();

      await openActions(user, ANN.name);
      await user.click(await screen.findByRole('menuitem', { name: 'Make manager' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Make yourself a manager?' });
      await user.click(within(dialog).getByRole('button', { name: 'Make me a manager' }));

      expect(await screen.findByText('You are now a manager')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
      });
      expect(meRequests.length).toBeGreaterThan(1);
      expect(screen.getByRole('heading', { level: 1, name: 'Team' })).toHaveFocus();
    });

    it('should send the manager role when a refetch shows another role while the demotion dialog is open', async () => {
      members = [ANN, { ...MAX, role: 'owner' }, KIM];
      const patches = answerPatch(ANN.id, () => HttpResponse.json({ ...ANN, role: 'manager' }));
      const user = userEvent.setup();
      const queryClient = createQueryClient();
      renderWithProviders(<TeamView />, queryClient);
      await openActions(user, ANN.name);
      await user.click(await screen.findByRole('menuitem', { name: 'Make manager' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Make yourself a manager?' });
      members = [{ ...ANN, role: 'manager' }, { ...MAX, role: 'owner' }, KIM];
      await queryClient.refetchQueries({ queryKey: memberKeys.all });

      await user.click(within(dialog).getByRole('button', { name: 'Make me a manager' }));

      await waitFor(() => {
        expect(patches).toHaveLength(1);
      });
      expect(await patches[0]?.json()).toEqual({ role: 'manager' });
    });

    it('should not ask for the invites again when the owner demotes themselves', async () => {
      members = [ANN, { ...MAX, role: 'owner' }, KIM];
      answerPatch(ANN.id, () => {
        session = { ...TEST_SESSION, role: 'manager' };
        return HttpResponse.json({ ...ANN, role: 'manager' });
      });
      const user = userEvent.setup();
      renderTeam();
      await waitFor(() => {
        expect(inviteRequests).toHaveLength(1);
      });

      await openActions(user, ANN.name);
      await user.click(await screen.findByRole('menuitem', { name: 'Make manager' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Make yourself a manager?' });
      await user.click(within(dialog).getByRole('button', { name: 'Make me a manager' }));

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Pending invites' })).not.toBeInTheDocument();
      });
      expect(inviteRequests).toHaveLength(1);
    });

    it.each([
      [409, 'LAST_OWNER', 'A workspace needs at least one owner.'],
      [404, 'MEMBER_NOT_FOUND', 'This member is no longer in the workspace.'],
      [403, 'INSUFFICIENT_ROLE', 'Only owners can do this.'],
    ])('should toast when the role change answers %s %s', async (status, code, text) => {
      answerPatch(MAX.id, () => problemResponse(status, code));
      const user = userEvent.setup();
      renderTeam();

      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Make owner' }));

      expect(await screen.findByText(text)).toBeInTheDocument();
    });

    it('should refetch invites when an owner is demoted', async () => {
      members = [ANN, { ...MAX, role: 'owner' }, KIM];
      answerPatch(MAX.id, () => HttpResponse.json({ ...MAX, role: 'manager' }));
      const invites = recordRequests('get', '/api/invites', () => HttpResponse.json({ items: [] }));
      const user = userEvent.setup();
      renderTeam();
      await waitFor(() => {
        expect(invites).toHaveLength(1);
      });

      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Make manager' }));

      await waitFor(() => {
        expect(invites).toHaveLength(2);
      });
    });

    it('should focus Members when the role change finds the member gone', async () => {
      answerPatch(MAX.id, () => {
        members = [ANN, KIM];
        return problemResponse(404, 'MEMBER_NOT_FOUND');
      });
      const user = userEvent.setup();
      renderTeam();

      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Make owner' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Members 2' })).toHaveFocus();
      });
    });

    it('should focus Members when a 403 takes the actions away', async () => {
      answerPatch(MAX.id, () => {
        session = { ...TEST_SESSION, role: 'manager' };
        return problemResponse(403, 'INSUFFICIENT_ROLE');
      });
      const user = userEvent.setup();
      renderTeam();

      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Make owner' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Members 3' })).toHaveFocus();
    });

    it('should refetch the session when the role change answers 403', async () => {
      answerPatch(MAX.id, () => problemResponse(403, 'INSUFFICIENT_ROLE'));
      const user = userEvent.setup();
      renderTeam();
      await waitFor(() => {
        expect(meRequests).toHaveLength(1);
      });

      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Make owner' }));

      await waitFor(() => {
        expect(meRequests).toHaveLength(2);
      });
    });
  });

  describe('removal', () => {
    async function openRemoval(user: User): Promise<HTMLElement> {
      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Remove from workspace' }));
      return screen.findByRole('alertdialog', { name: 'Remove Max Kim?' });
    }

    it('should hand over to the caller, drop the row and focus Members when the default receiver is kept', async () => {
      const deletes = answerDelete(MAX.id, () => {
        members = [ANN, KIM];
        return new HttpResponse(null, { status: 204 });
      });
      const user = userEvent.setup();
      const queryClient = createQueryClient();
      queryClient.setQueryData(dealKeys.board({ assignee: null }), makeBoard([]));
      queryClient.setQueryData(taskKeys.list({ assignee: 'me', status: 'open' }), {
        pages: [],
        pageParams: [],
      });
      renderWithProviders(<TeamView />, queryClient);

      const dialog = await openRemoval(user);
      expect(
        within(dialog).getByRole('combobox', { name: 'Hand over open deals and tasks to' }),
      ).toHaveTextContent(`${ANN.name} (you)`);
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Members 2' })).toHaveFocus();
      });
      expect(new URL(deletes[0]?.url ?? '').searchParams.get('transferTo')).toBe(ANN.id);
      expect(screen.queryByText('Max Kim')).not.toBeInTheDocument();
      expect(
        await screen.findByText(`Max Kim was removed. Open deals and tasks went to ${ANN.name}.`),
      ).toBeInTheDocument();
      expect(queryClient.getQueryState(dealKeys.board({ assignee: null }))?.isInvalidated).toBe(
        true,
      );
      expect(
        queryClient.getQueryState(taskKeys.list({ assignee: 'me', status: 'open' }))?.isInvalidated,
      ).toBe(true);
    });

    it('should list the caller, then the others by name, and send the receiver when another one is chosen', async () => {
      members = [ANN, MAX, ZOE, KIM];
      const deletes = answerDelete(MAX.id, () => new HttpResponse(null, { status: 204 }));
      const user = userEvent.setup();
      renderTeam();

      const dialog = await openRemoval(user);
      await user.click(within(dialog).getByRole('combobox'));
      const options = await screen.findAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual([
        `${ANN.name} (you)`,
        KIM.name,
        ZOE.name,
      ]);
      await user.click(screen.getByRole('option', { name: KIM.name }));
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(deletes).toHaveLength(1);
      });
      expect(new URL(deletes[0]?.url ?? '').searchParams.get('transferTo')).toBe(KIM.id);
    });

    it('should put the error on the select and focus it when the receiver was removed meanwhile', async () => {
      answerDelete(MAX.id, () =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'transferTo', message: 'Choose another member' }],
        }),
      );
      const user = userEvent.setup();
      renderTeam();

      const dialog = await openRemoval(user);
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      const select = within(dialog).getByRole('combobox');
      await waitFor(() => {
        expect(select).toHaveAccessibleDescription('Choose another member');
      });
      await waitFor(() => {
        expect(select).toHaveFocus();
      });
    });

    it('should leave the select empty when the chosen receiver is gone from the refetched members', async () => {
      answerDelete(MAX.id, () => {
        members = [ANN, MAX];
        return problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'transferTo', message: 'Choose another member' }],
        });
      });
      const user = userEvent.setup();
      renderTeam();
      const dialog = await openRemoval(user);
      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: KIM.name }));

      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      const select = within(dialog).getByRole('combobox');
      await waitFor(() => {
        expect(select.textContent).toBe('');
      });
      expect(select).toHaveAccessibleDescription('Choose another member');
    });

    it('should focus the empty select again and send nothing when Remove is pressed once more', async () => {
      const deletes = answerDelete(MAX.id, () => {
        members = [ANN, MAX];
        return problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'transferTo', message: 'Choose another member' }],
        });
      });
      const user = userEvent.setup();
      renderTeam();
      const dialog = await openRemoval(user);
      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: KIM.name }));
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
      const select = within(dialog).getByRole('combobox');
      await waitFor(() => {
        expect(select.textContent).toBe('');
      });

      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(select).toHaveFocus();
      });
      expect(deletes).toHaveLength(1);
    });

    it('should focus Members when a refetch drops the row while its removal dialog is open', async () => {
      const user = userEvent.setup();
      const queryClient = createQueryClient();
      renderWithProviders(<TeamView />, queryClient);
      await openRemoval(user);

      members = [ANN, KIM];
      await queryClient.refetchQueries({ queryKey: memberKeys.all });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Members 2' })).toHaveFocus();
      });
    });

    it('should refetch the members when the receiver was removed meanwhile', async () => {
      answerDelete(MAX.id, () =>
        problemResponse(400, 'VALIDATION_FAILED', {
          errors: [{ path: 'transferTo', message: 'Choose another member' }],
        }),
      );
      const user = userEvent.setup();
      renderTeam();
      const dialog = await openRemoval(user);
      const before = memberRequests.length;

      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(memberRequests.length).toBeGreaterThan(before);
      });
    });

    it('should show an alert and keep the dialog open when the removal fails unexpectedly', async () => {
      answerDelete(MAX.id, () => problemResponse(500, 'INTERNAL_SERVER_ERROR'));
      const user = userEvent.setup();
      renderTeam();

      const dialog = await openRemoval(user);
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      expect(
        await within(dialog).findByText('Something went wrong. Try again.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('alertdialog', { name: 'Remove Max Kim?' })).toBeInTheDocument();
    });

    it.each([
      [409, 'LAST_OWNER', 'A workspace needs at least one owner.'],
      [404, 'MEMBER_NOT_FOUND', 'This member is no longer in the workspace.'],
      [403, 'INSUFFICIENT_ROLE', 'Only owners can do this.'],
    ])('should toast and close when the removal answers %s %s', async (status, code, text) => {
      answerDelete(MAX.id, () => problemResponse(status, code));
      const user = userEvent.setup();
      renderTeam();

      const dialog = await openRemoval(user);
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      expect(await screen.findByText(text)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('removal refetches', () => {
    async function removeMax(user: User): Promise<void> {
      await openActions(user, 'Max Kim');
      await user.click(await screen.findByRole('menuitem', { name: 'Remove from workspace' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Remove Max Kim?' });
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    }

    it('should refetch the members when the removal answers 404', async () => {
      answerDelete(MAX.id, () => problemResponse(404, 'MEMBER_NOT_FOUND'));
      const user = userEvent.setup();
      renderTeam();
      await screen.findAllByRole('button', { name: 'Actions for Max Kim' });
      const before = memberRequests.length;

      await removeMax(user);

      await waitFor(() => {
        expect(memberRequests.length).toBeGreaterThan(before);
      });
    });

    it('should refetch the session when the removal answers 403', async () => {
      answerDelete(MAX.id, () => problemResponse(403, 'INSUFFICIENT_ROLE'));
      const user = userEvent.setup();
      renderTeam();
      await screen.findAllByRole('button', { name: 'Actions for Max Kim' });
      const before = meRequests.length;

      await removeMax(user);

      await waitFor(() => {
        expect(meRequests.length).toBeGreaterThan(before);
      });
    });
  });

  describe('rename', () => {
    it('should put the error on the field and send nothing when the name is blank', async () => {
      const patches = recordRequests('patch', '/api/workspace', () =>
        HttpResponse.json({ id: TEST_SESSION.workspace.id, name: 'x' }),
      );
      const user = userEvent.setup();
      renderTeam();

      await user.click(await screen.findByRole('button', { name: 'Rename' }));
      await user.clear(screen.getByLabelText('Workspace name'));
      await user.type(screen.getByLabelText('Workspace name'), '   ');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByLabelText('Workspace name')).toHaveAccessibleDescription(
        'Enter a workspace name',
      );
      expect(patches).toHaveLength(0);
    });

    it('should keep Save disabled when only spaces were added to the name', async () => {
      const user = userEvent.setup();
      renderTeam();

      await user.click(await screen.findByRole('button', { name: 'Rename' }));
      await user.type(screen.getByLabelText('Workspace name'), '  ');

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('should focus the page heading when a 403 takes the rename form away', async () => {
      recordRequests('patch', '/api/workspace', () => {
        session = { ...TEST_SESSION, role: 'manager' };
        return problemResponse(403, 'INSUFFICIENT_ROLE');
      });
      const user = userEvent.setup();
      renderTeam();

      await user.click(await screen.findByRole('button', { name: 'Rename' }));
      await user.type(screen.getByLabelText('Workspace name'), ' Lab');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Team' })).toHaveFocus();
    });

    it('should write the new name into the session without refetching it when the rename succeeds', async () => {
      const renamed = { id: TEST_SESSION.workspace.id, name: 'Pixel Lab' };
      recordRequests('patch', '/api/workspace', () => HttpResponse.json(renamed));
      const user = userEvent.setup();
      const { queryClient } = renderTeam();
      await waitFor(() => {
        expect(meRequests).toHaveLength(1);
      });

      await user.click(await screen.findByRole('button', { name: 'Rename' }));
      await user.clear(screen.getByLabelText('Workspace name'));
      await user.type(screen.getByLabelText('Workspace name'), 'Pixel Lab');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Workspace renamed')).toBeInTheDocument();
      expect(queryClient.getQueryData<SessionResponse>(sessionKeys.current)?.workspace).toEqual({
        ...renamed,
        isDemo: false,
      });
      expect(screen.getByText('Pixel Lab')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rename' })).toHaveFocus();
      expect(meRequests).toHaveLength(1);
    });

    it('should keep the new name and ask for the session again when a refetch was in flight during the rename', async () => {
      const renamed = { id: TEST_SESSION.workspace.id, name: 'Pixel Lab' };
      recordRequests('patch', '/api/workspace', () => {
        session = { ...TEST_SESSION, workspace: { ...renamed, isDemo: false } };
        return HttpResponse.json(renamed);
      });
      const user = userEvent.setup();
      const { queryClient } = renderTeam();
      await waitFor(() => {
        expect(meRequests).toHaveLength(1);
      });
      // The first refetch read the old name and answers only after the rename.
      const lateSession = held();
      const sessions = recordRequests('get', '/api/auth/me', async () => {
        if (sessions.length === 1) {
          await lateSession.promise;
          return HttpResponse.json(TEST_SESSION);
        }
        return HttpResponse.json(session);
      });
      void queryClient.refetchQueries({ queryKey: sessionKeys.current });

      await user.click(await screen.findByRole('button', { name: 'Rename' }));
      await user.clear(screen.getByLabelText('Workspace name'));
      await user.type(screen.getByLabelText('Workspace name'), 'Pixel Lab');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await screen.findByText('Workspace renamed');
      lateSession.release();

      await waitFor(() => {
        expect(sessions).toHaveLength(2);
      });
      await waitFor(() => {
        expect(queryClient.isFetching({ queryKey: sessionKeys.current })).toBe(0);
      });
      expect(queryClient.getQueryData<SessionResponse>(sessionKeys.current)?.workspace).toEqual({
        ...renamed,
        isDemo: false,
      });
    });
  });
});
