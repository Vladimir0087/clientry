'use client';

import { ChevronLeftIcon, PencilIcon } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import {
  ClientDetails,
  ClientDetailsSkeleton,
  ClientNotFound,
  CLIENTS_PATH,
  editClientPath,
  isNotFound,
  useClient,
} from '@/entities/client';
import { DeleteClientButton } from '@/features/delete-client';
import { Button } from '@/shared/ui/button';
import { PageHeading } from '@/shared/ui/page-heading';
import type { Client } from '@clientry/shared/clients';

function ClientCard({ client }: { readonly client: Client }): React.JSX.Element {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <PageHeading className="break-words">{client.name}</PageHeading>
          {client.company !== null && (
            <p className="break-words text-muted-foreground">{client.company}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={editClientPath(client.id)}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Link>
          </Button>
          <DeleteClientButton client={client} />
        </div>
      </header>
      <ClientDetails client={client} />
    </article>
  );
}

function ClientState({ id }: { readonly id: string }): React.JSX.Element {
  const client = useClient(id);
  // First: a failed refetch keeps the cached client in data, and a deleted one must not show.
  if (isNotFound(client.error)) {
    return <ClientNotFound />;
  }
  if (client.data !== undefined) {
    return <ClientCard client={client.data} />;
  }
  if (client.isPending) {
    return <ClientDetailsSkeleton />;
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

export function ClientView({ id }: { readonly id: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={CLIENTS_PATH}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
        Clients
      </Link>
      <ClientState id={id} />
    </div>
  );
}
