'use client';

import { useRouter } from 'next/navigation';
import type * as React from 'react';

import { useClient } from '@/entities/client';
import type { PickedClient } from '@/entities/client';
import { DEALS_PATH, dealPath, useStages } from '@/entities/deal';
import { useMembers } from '@/entities/member';
import { useSession } from '@/entities/session';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { SessionResponse } from '@clientry/shared/auth';
import type { StageListItem } from '@clientry/shared/deals';
import type { Member } from '@clientry/shared/workspaces';

import { DealForm } from './deal-form';
import { DealFormSkeleton } from './deal-form-skeleton';
import { emptyDealValues } from '../model/deal-form-values';
import type { DealFormOutput } from '../model/deal-form-values';
import { useCreateDeal } from '../model/use-save-deal';

interface CreateDealFormProps {
  // From the URL; an id that is not a stage or a client of the workspace is ignored.
  readonly stageId?: string;
  readonly clientId?: string;
  // The page heading, which takes focus when Try again reloads the form.
  readonly headingId: string;
}

interface LoadedCreateFormProps {
  readonly stages: readonly StageListItem[];
  readonly members: readonly Member[];
  readonly session: SessionResponse;
  readonly stageId: string | undefined;
  readonly client: PickedClient | null;
}

function defaultStageId(stages: readonly StageListItem[], requested: string | undefined): string {
  const requestedStage = stages.find((stage) => stage.id === requested);
  return (requestedStage ?? stages.find((stage) => stage.kind === 'open') ?? stages[0])?.id ?? '';
}

function LoadedCreateForm({
  stages,
  members,
  session,
  stageId,
  client,
}: LoadedCreateFormProps): React.JSX.Element {
  const router = useRouter();
  const create = useCreateDeal();
  const handleSave = async (values: DealFormOutput): Promise<void> => {
    const deal = await create.mutateAsync(values);
    requestHeadingFocus();
    // Replace, so Back does not return to a filled form.
    router.replace(dealPath(deal.id));
  };
  return (
    <DealForm
      source={{
        values: emptyDealValues({
          stageId: defaultStageId(stages, stageId),
          assigneeId: session.user.id,
          clientId: client?.id,
        }),
        client,
      }}
      stageOptions={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
      assigneeOptions={members.map((member) => ({ value: member.id, label: member.name }))}
      submitLabel="Create deal"
      cancelHref={DEALS_PATH}
      isEdit={false}
      isSaved={create.isSuccess}
      onSave={handleSave}
    />
  );
}

interface CreateStateProps {
  readonly stageId: string | undefined;
  readonly client: PickedClient | null;
  readonly headingId: string;
}

function CreateState({ stageId, client, headingId }: CreateStateProps): React.JSX.Element {
  const stages = useStages();
  const members = useMembers();
  const session = useSession();
  if (stages.data !== undefined && members.data !== undefined && session.data !== undefined) {
    return (
      <LoadedCreateForm
        stages={stages.data.items}
        members={members.data.items}
        session={session.data}
        stageId={stageId}
        client={client}
      />
    );
  }
  const queries = [stages, members, session];
  if (queries.some((query) => query.isPending)) {
    return <DealFormSkeleton />;
  }
  const handleRetry = (): void => {
    for (const query of queries.filter((item) => item.isError)) {
      void query.refetch();
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

interface CreateWithClientProps extends Omit<CreateStateProps, 'client'> {
  readonly clientId: string;
}

function CreateWithClient({ clientId, ...state }: CreateWithClientProps): React.JSX.Element {
  const client = useClient(clientId);
  if (client.isPending) {
    return <DealFormSkeleton />;
  }
  // An unknown client is ignored, as a malformed id is; a failed load is not dropped silently.
  if (client.data === undefined && !isNotFound(client.error)) {
    const handleRetry = (): void => {
      void client.refetch();
    };
    return (
      <RetryMessage
        message="We could not load the form."
        focusTargetId={state.headingId}
        onRetry={handleRetry}
      />
    );
  }
  const picked = client.data === undefined ? null : { id: client.data.id, name: client.data.name };
  return <CreateState {...state} client={picked} />;
}

export function CreateDealForm({
  stageId,
  clientId,
  headingId,
}: CreateDealFormProps): React.JSX.Element {
  return clientId === undefined ? (
    <CreateState stageId={stageId} client={null} headingId={headingId} />
  ) : (
    <CreateWithClient stageId={stageId} clientId={clientId} headingId={headingId} />
  );
}
