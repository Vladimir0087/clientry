'use client';

import type * as React from 'react';

import { useSession } from '@/entities/session';
import { ConfirmDeleteDialog } from '@/shared/ui/confirm-delete-dialog';
import { canDeleteRecord } from '@clientry/shared/auth';
import type { Deal } from '@clientry/shared/deals';

import { useDeleteDeal } from '../model/use-delete-deal';

interface DeleteDealButtonProps {
  readonly deal: Pick<Deal, 'id' | 'title' | 'createdBy'>;
}

function DeleteDealDialog({ deal }: DeleteDealButtonProps): React.JSX.Element {
  const deletion = useDeleteDeal();
  const handleConfirm = (onError: (error: unknown) => void): void => {
    deletion.mutate(deal, { onError });
  };
  return (
    <ConfirmDeleteDialog
      name={deal.title}
      description="The deal disappears from the board and the client's deals. You can undo this right after."
      forbiddenMessage="You can delete only deals you created."
      deletion={deletion}
      onConfirm={handleConfirm}
    />
  );
}

// Hidden while the session loads and when the role rule would refuse; the API checks it again.
export function DeleteDealButton({ deal }: DeleteDealButtonProps): React.JSX.Element | null {
  const session = useSession();
  if (session.data === undefined) {
    return null;
  }
  const actor = { userId: session.data.user.id, role: session.data.role };
  return canDeleteRecord(actor, deal.createdBy.id) ? <DeleteDealDialog deal={deal} /> : null;
}
