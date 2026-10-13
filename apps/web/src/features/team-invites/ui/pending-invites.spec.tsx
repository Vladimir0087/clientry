import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { inviteKeys } from '@/entities/invite';
import type { InviteSummary } from '@clientry/shared/workspaces';

import { PendingInvites } from './pending-invites';
import { TEST_SESSION } from '../../../../test/fixtures';
import { problemResponse } from '../../../../test/msw/problem';
import { recordRequests } from '../../../../test/msw/record';
import type { Resolver } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

const TOKEN = 'q3V8Hn1xKZ0bWcR5tYp2LmA9sEoJfDgU7iNvXwC4hBk';
const ANN = { id: TEST_SESSION.user.id, name: TEST_SESSION.user.name };

function invite(index: number): InviteSummary {
  return {
    id: `0199b0d2-1a2b-7c3d-8e4f-${String(index).padStart(12, '0')}`,
    createdBy: ANN,
    createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T09:30:00.000Z`,
    expiresAt: `2026-10-${String(index + 8).padStart(2, '0')}T09:30:00.000Z`,
  };
}

const CREATED = { ...invite(9), token: TOKEN };

function answerList(items: readonly InviteSummary[]): Request[] {
  return recordRequests('get', '/api/invites', () => HttpResponse.json({ items }));
}

function answerCreate(
  resolver: Resolver = () => HttpResponse.json(CREATED, { status: 201 }),
): Request[] {
  return recordRequests('post', '/api/invites', resolver);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Invite member' }));
  return screen.findByRole('dialog', { name: 'Invite a member' });
}

describe('PendingInvites', () => {
  it('should list each invite with its inviter and dates when invites are pending', async () => {
    answerList([invite(1)]);

    renderWithProviders(<PendingInvites />);

    expect(await screen.findByText(`Invited by ${ANN.name}`)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Revoke invite created Oct 2, 2026' }),
    ).toBeInTheDocument();
  });

  it('should say there are none when no invite is pending', async () => {
    answerList([]);

    renderWithProviders(<PendingInvites />);

    expect(await screen.findByText('No pending invites')).toBeInTheDocument();
  });

  it('should refetch the session when the list is refused for the role', async () => {
    recordRequests('get', '/api/invites', () => problemResponse(403, 'INSUFFICIENT_ROLE'));
    const sessions = recordRequests('get', '/api/auth/me', () => HttpResponse.json(TEST_SESSION));

    renderWithProviders(<PendingInvites />);

    await waitFor(() => {
      expect(sessions).toHaveLength(2);
    });
  });

  it('should disable Invite member and say why when 20 invites are pending', async () => {
    answerList(Array.from({ length: 20 }, (_, index) => invite(index)));

    renderWithProviders(<PendingInvites />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Invite member' })).toBeDisabled();
    });
    expect(
      screen.getByText('You can have up to 20 pending invites. Revoke one to create another.'),
    ).toBeInTheDocument();
  });

  describe('invite dialog', () => {
    it('should show the full link and focus Copy link when the link is created', async () => {
      answerList([]);
      answerCreate();
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));

      const field = await within(dialog).findByLabelText('Invite link');
      expect(field).toHaveValue(`http://localhost:3000/join#${TOKEN}`);
      expect(within(dialog).getByRole('button', { name: 'Copy link' })).toHaveFocus();
    });

    it('should copy the link and say so when Copy link is pressed', async () => {
      answerList([]);
      answerCreate();
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, 'writeText');
      onTestFinished(() => {
        writeText.mockRestore();
      });
      renderWithProviders(<PendingInvites />);

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await user.click(await within(dialog).findByRole('button', { name: 'Copy link' }));

      expect(writeText).toHaveBeenCalledWith(`http://localhost:3000/join#${TOKEN}`);
      expect(await screen.findByText('Link copied')).toBeInTheDocument();
    });

    it('should select the link and give a hint when the clipboard refuses', async () => {
      answerList([]);
      answerCreate();
      const user = userEvent.setup();
      const writeText = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockRejectedValue(new Error('denied'));
      onTestFinished(() => {
        writeText.mockRestore();
      });
      renderWithProviders(<PendingInvites />);

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await user.click(await within(dialog).findByRole('button', { name: 'Copy link' }));

      const field = within(dialog).getByLabelText<HTMLInputElement>('Invite link');
      await waitFor(() => {
        expect(field).toHaveAccessibleDescription('Copy the selected link.');
      });
      expect(field).toHaveFocus();
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
    });

    it('should select the link and give a hint when the page has no clipboard API', async () => {
      answerList([]);
      answerCreate();
      const user = userEvent.setup();
      // Outside a secure context browsers leave navigator.clipboard undefined.
      const clipboard = vi
        .spyOn(navigator, 'clipboard', 'get')
        .mockReturnValue(undefined as unknown as Clipboard);
      onTestFinished(() => {
        clipboard.mockRestore();
      });
      renderWithProviders(<PendingInvites />);

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await user.click(await within(dialog).findByRole('button', { name: 'Copy link' }));

      const field = within(dialog).getByLabelText<HTMLInputElement>('Invite link');
      expect(field).toHaveAccessibleDescription('Copy the selected link.');
      expect(field).toHaveFocus();
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
    });

    it('should show an alert in the dialog when the pending limit is reached', async () => {
      answerList([]);
      answerCreate(() =>
        problemResponse(409, 'INVITE_LIMIT_REACHED', {
          detail: 'A workspace can have at most 20 pending invites',
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));

      expect(
        await within(dialog).findByText('A workspace can have at most 20 pending invites'),
      ).toBeInTheDocument();
    });

    it('should refetch the list when the pending limit is reached', async () => {
      const lists = answerList([]);
      answerCreate(() => problemResponse(409, 'INVITE_LIMIT_REACHED'));
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);
      const dialog = await openDialog(user);

      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));

      await waitFor(() => {
        expect(lists).toHaveLength(2);
      });
    });

    it('should offer no close button while the link is being created', async () => {
      const answered = Promise.withResolvers<undefined>();
      answerList([]);
      answerCreate(async () => {
        await answered.promise;
        return HttpResponse.json(CREATED, { status: 201 });
      });
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);
      const dialog = await openDialog(user);
      expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));

      expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
      answered.resolve(undefined);
      expect(await within(dialog).findByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('should keep the dialog and its link when a click lands outside it after the link is created', async () => {
      answerList([]);
      answerCreate();
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await within(dialog).findByLabelText('Invite link');

      // Plain events: user-event refuses to click the body, which Radix makes pointer-events: none.
      fireEvent.pointerDown(document.body);
      fireEvent.pointerUp(document.body);
      fireEvent.click(document.body);

      expect(screen.getByRole('dialog', { name: 'Invite a member' })).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Invite link')).toHaveValue(
        `http://localhost:3000/join#${TOKEN}`,
      );
    });

    it('should offer a new link and no old one when the dialog is opened again', async () => {
      answerList([]);
      answerCreate();
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);
      const first = await openDialog(user);
      await user.click(within(first).getByRole('button', { name: 'Create link' }));
      await user.click(await within(first).findByRole('button', { name: 'Done' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      const second = await openDialog(user);

      expect(within(second).getByRole('button', { name: 'Create link' })).toBeInTheDocument();
      expect(within(second).queryByLabelText('Invite link')).not.toBeInTheDocument();
    });
  });

  describe('revoke', () => {
    it('should revoke, refetch the list and focus the heading when the revoke is confirmed', async () => {
      const lists = answerList([invite(1)]);
      const revokes = recordRequests(
        'delete',
        `/api/invites/${invite(1).id}`,
        () => new HttpResponse(null, { status: 204 }),
      );
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);

      await user.click(
        await screen.findByRole('button', { name: 'Revoke invite created Oct 2, 2026' }),
      );
      const dialog = await screen.findByRole('alertdialog', { name: 'Revoke this invite?' });
      await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Pending invites' })).toHaveFocus();
      });
      expect(revokes).toHaveLength(1);
      expect(lists.length).toBeGreaterThan(1);
      expect(await screen.findByText('Invite revoked')).toBeInTheDocument();
    });

    it('should say the invite is no longer pending and focus the heading when the revoke answers 404', async () => {
      answerList([invite(1)]);
      recordRequests('delete', `/api/invites/${invite(1).id}`, () =>
        problemResponse(404, 'INVITE_NOT_FOUND'),
      );
      const user = userEvent.setup();
      renderWithProviders(<PendingInvites />);

      await user.click(
        await screen.findByRole('button', { name: 'Revoke invite created Oct 2, 2026' }),
      );
      await user.click(await screen.findByRole('button', { name: 'Revoke' }));

      expect(await screen.findByText('This invite is no longer pending.')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Pending invites' })).toHaveFocus();
      });
    });

    it('should keep the confirmation open when a refetch empties the list meanwhile', async () => {
      answerList([invite(1)]);
      const user = userEvent.setup();
      const { queryClient } = renderWithProviders(<PendingInvites />);
      await user.click(
        await screen.findByRole('button', { name: 'Revoke invite created Oct 2, 2026' }),
      );
      await screen.findByRole('alertdialog', { name: 'Revoke this invite?' });

      answerList([]);
      await queryClient.invalidateQueries({ queryKey: inviteKeys.all });

      expect(await screen.findByText('No pending invites')).toBeInTheDocument();
      expect(screen.getByRole('alertdialog', { name: 'Revoke this invite?' })).toBeInTheDocument();
    });
  });
});
