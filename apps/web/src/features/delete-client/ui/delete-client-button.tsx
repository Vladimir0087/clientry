'use client';

import type * as React from 'react';

import { useSession } from '@/entities/session';
import { ConfirmDeleteDialog } from '@/shared/ui/confirm-delete-dialog';
import { canDeleteRecord } from '@clientry/shared/auth';
import type { Client } from '@clientry/shared/clients';

import { useDeleteClient } from '../model/use-delete-client';

interface DeleteClientButtonProps {
  readonly client: Pick<Client, 'id' | 'name' | 'createdBy'>;
}

function DeleteClientDialog({ client }: DeleteClientButtonProps): React.JSX.Element {
  const deletion = useDeleteClient();
  const handleConfirm = (onError: (error: unknown) => void): void => {
    deletion.mutate(client.id, { onError });
  };
  return (
    <ConfirmDeleteDialog
      name={client.name}
      description="The client and their deals disappear from lists, search and the board. You can undo this right after."
      forbiddenMessage="You can delete only clients you created."
      deletion={deletion}
      onConfirm={handleConfirm}
    />
  );
}

// Hidden while the session loads and when the role rule would refuse; the API checks it again.
export function DeleteClientButton({ client }: DeleteClientButtonProps): React.JSX.Element | null {
  const session = useSession();
  if (session.data === undefined) {
    return null;
  }
  const actor = { userId: session.data.user.id, role: session.data.role };
  return canDeleteRecord(actor, client.createdBy.id) ? (
    <DeleteClientDialog client={client} />
  ) : null;
}
