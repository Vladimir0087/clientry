'use client';

import { useRouter } from 'next/navigation';
import type * as React from 'react';

import { CLIENTS_PATH, clientPath } from '@/entities/client';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';

import { ClientForm } from './client-form';
import { EMPTY_CLIENT_VALUES } from '../model/client-form-values';
import type { ClientFormValues } from '../model/client-form-values';
import { useCreateClient } from '../model/use-save-client';

export function CreateClientForm(): React.JSX.Element {
  const router = useRouter();
  const create = useCreateClient();

  const handleSave = async (values: ClientFormValues): Promise<void> => {
    const client = await create.mutateAsync(values);
    requestHeadingFocus();
    // Replace, so Back does not return to a filled form.
    router.replace(clientPath(client.id));
  };

  return (
    <ClientForm
      defaultValues={EMPTY_CLIENT_VALUES}
      submitLabel="Create client"
      cancelHref={CLIENTS_PATH}
      isEdit={false}
      isSaved={create.isSuccess}
      onSave={handleSave}
    />
  );
}
