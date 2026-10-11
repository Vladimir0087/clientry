'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { PencilIcon } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import type * as React from 'react';

import { clientPath } from '@/entities/client';
import {
  DealDetails,
  DealDetailsSkeleton,
  DealHistoryList,
  DealHistorySkeleton,
  DealNotFound,
  DEALS_PATH,
  editDealPath,
  useDeal,
  useDealHistory,
} from '@/entities/deal';
import { DealStageSelect } from '@/features/change-deal-stage';
import { DeleteDealButton } from '@/features/delete-deal';
import { isNotFound } from '@/shared/api/api-status';
import { BackLink } from '@/shared/ui/back-link';
import { Button } from '@/shared/ui/button';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryFocusBox } from '@/shared/ui/retry-focus-box';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { Deal } from '@clientry/shared/deals';

function DealHistorySection({ id }: { readonly id: string }): React.JSX.Element {
  const headingId = useId();
  const history = useDealHistory(id);
  const handleRetry = (): void => {
    void history.refetch();
  };
  let body: React.JSX.Element;
  if (history.data !== undefined) {
    body = <DealHistoryList history={history.data} />;
  } else if (history.isError) {
    body = (
      <RetryMessage
        message="We could not load the history."
        focusTargetId={headingId}
        onRetry={handleRetry}
      />
    );
  } else {
    body = <DealHistorySkeleton />;
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold outline-none">
        History
      </h2>
      {body}
    </section>
  );
}

function DealArticle({ deal }: { readonly deal: Deal }): React.JSX.Element {
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <PageHeading className="break-words">{deal.title}</PageHeading>
          <Link
            href={clientPath(deal.client.id)}
            className="w-fit max-w-full break-words text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {deal.client.name}
          </Link>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={editDealPath(deal.id)}>
              <PencilIcon aria-hidden="true" />
              Edit
            </Link>
          </Button>
          <DeleteDealButton deal={deal} />
        </div>
      </header>
      <DealDetails
        deal={deal}
        stageControl={(labelId) => <DealStageSelect deal={deal} labelId={labelId} />}
      />
      <DealHistorySection id={deal.id} />
    </article>
  );
}

interface DealStateProps {
  readonly deal: UseQueryResult<Deal>;
  readonly focusTargetId: string;
}

function DealState({ deal, focusTargetId }: DealStateProps): React.JSX.Element {
  // First: a failed refetch keeps the cached deal in data, and a deleted one must not show.
  if (isNotFound(deal.error)) {
    return <DealNotFound />;
  }
  if (deal.data !== undefined) {
    return <DealArticle deal={deal.data} />;
  }
  if (deal.isPending) {
    return <DealDetailsSkeleton />;
  }
  const handleRetry = (): void => {
    void deal.refetch();
  };
  return (
    <RetryMessage
      message="We could not load the deal."
      focusTargetId={focusTargetId}
      onRetry={handleRetry}
    />
  );
}

export function DealView({ id }: { readonly id: string }): React.JSX.Element {
  const stateId = useId();
  const deal = useDeal(id);
  const hasLoaded = deal.data !== undefined || isNotFound(deal.error);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={DEALS_PATH}>Deals</BackLink>
      <RetryFocusBox id={stateId} hasLoaded={hasLoaded}>
        <DealState deal={deal} focusTargetId={stateId} />
      </RetryFocusBox>
    </div>
  );
}
