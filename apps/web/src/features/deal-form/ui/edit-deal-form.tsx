'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import type * as React from 'react';

import { DealNotFound, dealPath, useDeal } from '@/entities/deal';
import { useMembers } from '@/entities/member';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { Deal } from '@clientry/shared/deals';
import type { Member } from '@clientry/shared/workspaces';

import { DealForm } from './deal-form';
import type { DealFormSource } from './deal-form';
import { DealFormSkeleton } from './deal-form-skeleton';
import { changedDealFields, toDealFormValues } from '../model/deal-form-values';
import type { DealFormApi, DealFormOutput } from '../model/deal-form-values';
import { useUpdateDeal } from '../model/use-save-deal';

interface LoadedEditFormProps {
  readonly deal: Deal;
  readonly members: readonly Member[];
  readonly refetchDeal: () => Promise<UseQueryResult<Deal>>;
}

interface EditSource extends DealFormSource {
  readonly version: number;
}

function sourceOf(deal: Deal): EditSource {
  return { values: toDealFormValues(deal), client: deal.client, version: deal.version };
}

function LoadedEditForm({ deal, members, refetchDeal }: LoadedEditFormProps): React.JSX.Element {
  const router = useRouter();
  const update = useUpdateDeal();

  // The version of the values on screen, not the cache's: a background refetch must not hide a
  // conflict.
  const handleSave = async (
    values: DealFormOutput,
    form: DealFormApi,
    shown: EditSource,
  ): Promise<void> => {
    const changes = changedDealFields(values, form.formState.dirtyFields, shown.version);
    await update.mutateAsync({ id: deal.id, changes });
    requestHeadingFocus();
    router.replace(dealPath(deal.id));
  };

  const handleReload = async (): Promise<EditSource | undefined> => {
    const result = await refetchDeal();
    // A deal gone meanwhile replaces the form with its not found state, whose heading takes focus.
    if (isNotFound(result.error)) {
      requestHeadingFocus();
    }
    return result.isError || result.data === undefined ? undefined : sourceOf(result.data);
  };

  return (
    <DealForm
      source={sourceOf(deal)}
      assigneeOptions={members.map((member) => ({ value: member.id, label: member.name }))}
      submitLabel="Save changes"
      cancelHref={dealPath(deal.id)}
      isEdit
      isSaved={update.isSuccess}
      onSave={handleSave}
      onReload={handleReload}
    />
  );
}

interface EditStateProps {
  readonly id: string;
  readonly headingId: string;
}

// A deal gone meanwhile swaps the heading Try again focused for the not found state's heading.
function retryDeal(deal: UseQueryResult<Deal>, headingId: string): void {
  void deal.refetch().then((result) => {
    if (isNotFound(result.error) && document.activeElement?.id === headingId) {
      requestHeadingFocus();
    }
  });
}

function EditState({ id, headingId }: EditStateProps): React.JSX.Element {
  const deal = useDeal(id);
  const members = useMembers();
  if (deal.data !== undefined && members.data !== undefined) {
    return (
      <LoadedEditForm deal={deal.data} members={members.data.items} refetchDeal={deal.refetch} />
    );
  }
  if (deal.isPending || members.isPending) {
    return <DealFormSkeleton isEdit />;
  }
  const handleRetry = (): void => {
    if (deal.isError) {
      retryDeal(deal, headingId);
    }
    if (members.isError) {
      void members.refetch();
    }
  };
  return (
    <RetryMessage
      message="We could not load the form."
      focusTargetId={headingId}
      onRetry={handleRetry}
    />
  );
}

// A deal that is gone shows the deal page's not found state, which brings its own heading.
export function EditDealForm({ id }: { readonly id: string }): React.JSX.Element {
  const deal = useDeal(id);
  const headingId = useId();
  if (isNotFound(deal.error)) {
    return <DealNotFound />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeading id={headingId}>Edit deal</PageHeading>
      <EditState id={id} headingId={headingId} />
    </div>
  );
}
