'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import type * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { ClientNotFound, clientPath, useClient } from '@/entities/client';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';
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

interface EditStateProps {
  readonly id: string;
  readonly headingId: string;
}

function EditState({ id, headingId }: EditStateProps): React.JSX.Element {
  const client = useClient(id);
  if (client.data !== undefined) {
    return <LoadedEditForm client={client.data} />;
  }
  if (client.isPending) {
    return <ClientFormSkeleton />;
  }
  const handleRetry = (): void => {
    void client.refetch().then((result) => {
      // A client gone meanwhile swaps the heading Try again focused for the not found state's.
      if (isNotFound(result.error) && document.activeElement?.id === headingId) {
        requestHeadingFocus();
      }
    });
  };
  return (
    <RetryMessage
      message="We could not load the client."
      focusTargetId={headingId}
      onRetry={handleRetry}
    />
  );
}

// A client that is gone shows the card's not found state, which brings its own heading.
export function EditClientForm({ id }: { readonly id: string }): React.JSX.Element {
  const client = useClient(id);
  const headingId = useId();
  if (isNotFound(client.error)) {
    return <ClientNotFound />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeading id={headingId}>Edit client</PageHeading>
      <EditState id={id} headingId={headingId} />
    </div>
  );
}
