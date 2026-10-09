'use client';

import { useRouter } from 'next/navigation';
import type * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { ClientNotFound, clientPath, isNotFound, useClient } from '@/entities/client';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import { Button } from '@/shared/ui/button';
import { PageHeading } from '@/shared/ui/page-heading';
import type { Client } from '@clientry/shared/clients';

import { ClientForm } from './client-form';
import { ClientFormSkeleton } from './client-form-skeleton';
import { changedFields, toClientFormValues } from '../model/client-form-values';
import type { ClientFormValues } from '../model/client-form-values';
import { useUpdateClient } from '../model/use-save-client';

function LoadedEditForm({ client }: { readonly client: Client }): React.JSX.Element {
  const router = useRouter();
  const update = useUpdateClient();

  const handleSave = async (
    values: ClientFormValues,
    form: UseFormReturn<ClientFormValues>,
  ): Promise<void> => {
    const changes = changedFields(values, form.formState.dirtyFields);
    await update.mutateAsync({ id: client.id, changes });
    requestHeadingFocus();
    router.replace(clientPath(client.id));
  };

  return (
    <ClientForm
      defaultValues={toClientFormValues(client)}
      submitLabel="Save changes"
      cancelHref={clientPath(client.id)}
      isEdit
      isSaved={update.isSuccess}
      onSave={handleSave}
    />
  );
}

function EditState({ id }: { readonly id: string }): React.JSX.Element {
  const client = useClient(id);
  if (client.data !== undefined) {
    return <LoadedEditForm client={client.data} />;
  }
  if (client.isPending) {
    return <ClientFormSkeleton />;
  }
  const handleRetry = (): void => {
    void client.refetch();
  };
  return (
    <div className="flex flex-col items-start gap-3">
      <p>We could not load the client.</p>
      <Button variant="outline" onClick={handleRetry}>
        Try again
      </Button>
    </div>
  );
}

// A client that is gone shows the card's not found state, which brings its own heading.
export function EditClientForm({ id }: { readonly id: string }): React.JSX.Element {
  const client = useClient(id);
  if (isNotFound(client.error)) {
    return <ClientNotFound />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeading>Edit client</PageHeading>
      <EditState id={id} />
    </div>
  );
}
