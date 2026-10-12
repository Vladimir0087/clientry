'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { PencilIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import type * as React from 'react';

import {
  ClientDetails,
  ClientDetailsSkeleton,
  ClientNotFound,
  CLIENTS_PATH,
  editClientPath,
  useClient,
} from '@/entities/client';
import { ClientDealList, ClientDealsSkeleton, newDealPath, useClientDeals } from '@/entities/deal';
import { DeleteClientButton } from '@/features/delete-client';
import { isNotFound } from '@/shared/api/api-status';
import { BackLink } from '@/shared/ui/back-link';
import { Button } from '@/shared/ui/button';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryFocusBox } from '@/shared/ui/retry-focus-box';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { Client } from '@clientry/shared/clients';

import { TaskSection } from '../../../_components/task-section';

interface ClientDealsBodyProps {
  readonly clientId: string;
  readonly headingId: string;
}

function ClientDealsBody({ clientId, headingId }: ClientDealsBodyProps): React.JSX.Element {
  const deals = useClientDeals(clientId);
  if (deals.data !== undefined) {
    return deals.data.items.length === 0 ? (
      <p className="text-sm text-muted-foreground">No deals yet</p>
    ) : (
      <ClientDealList deals={deals.data} />
    );
  }
  if (deals.isPending) {
    return <ClientDealsSkeleton />;
  }
  const handleRetry = (): void => {
    void deals.refetch();
  };
  return (
    <RetryMessage
      message="We could not load the deals."
      focusTargetId={headingId}
      onRetry={handleRetry}
    />
  );
}

function ClientDeals({ clientId }: { readonly clientId: string }): React.JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold outline-none">
          Deals
        </h2>
        <Button variant="outline" asChild>
          <Link href={newDealPath({ clientId })}>
            <PlusIcon aria-hidden="true" />
            New deal
          </Link>
        </Button>
      </div>
      <ClientDealsBody clientId={clientId} headingId={headingId} />
    </section>
  );
}

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
      <ClientDeals clientId={client.id} />
      <TaskSection owner={{ clientId: client.id }} />
    </article>
  );
}

interface ClientStateProps {
  readonly client: UseQueryResult<Client>;
  readonly focusTargetId: string;
}

function ClientState({ client, focusTargetId }: ClientStateProps): React.JSX.Element {
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
    <RetryMessage
      message="We could not load the client."
      focusTargetId={focusTargetId}
      onRetry={handleRetry}
    />
  );
}

export function ClientView({ id }: { readonly id: string }): React.JSX.Element {
  const stateId = useId();
  const client = useClient(id);
  const hasLoaded = client.data !== undefined || isNotFound(client.error);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={CLIENTS_PATH}>Clients</BackLink>
      <RetryFocusBox id={stateId} hasLoaded={hasLoaded}>
        <ClientState client={client} focusTargetId={stateId} />
      </RetryFocusBox>
    </div>
  );
}
