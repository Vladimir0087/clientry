'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import type * as React from 'react';

import { clientPath, useClient } from '@/entities/client';
import type { PickedClient } from '@/entities/client';
import { dealPath, useDeal } from '@/entities/deal';
import { useMembers } from '@/entities/member';
import { useSession } from '@/entities/session';
import { TASKS_PATH, taskPath } from '@/entities/task';
import { isNotFound } from '@/shared/api/api-status';
import { requestHeadingFocus } from '@/shared/lib/heading-focus';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { SessionResponse } from '@clientry/shared/auth';
import type { Member } from '@clientry/shared/workspaces';

import type { LinkedDeal } from './related-fields';
import { TaskForm } from './task-form';
import { TaskFormSkeleton } from './task-form-skeleton';
import { emptyTaskValues, toCreateTaskRequest } from '../model/task-form-values';
import type { TaskFormOutput, TaskInstants } from '../model/task-form-values';
import { useCreateTask } from '../model/use-save-task';

// What the URL's client or deal fills in, and where Cancel goes back to.
interface Preset {
  readonly client: PickedClient | null;
  readonly linkedDeal: LinkedDeal | null;
  readonly cancelHref: Route;
}

const NO_PRESET: Preset = { client: null, linkedDeal: null, cancelHref: TASKS_PATH };

interface CreateTaskFormProps {
  // From the URL; an id that is not a client or a deal of the workspace is ignored.
  readonly clientId?: string;
  readonly dealId?: string;
  // The page heading, which takes focus when Try again reloads the form.
  readonly headingId: string;
}

interface LoadedCreateFormProps {
  readonly preset: Preset;
  readonly members: readonly Member[];
  readonly session: SessionResponse;
}

function LoadedCreateForm({ preset, members, session }: LoadedCreateFormProps): React.JSX.Element {
  const router = useRouter();
  const create = useCreateTask();
  const handleSave = async (values: TaskFormOutput, instants: TaskInstants): Promise<void> => {
    const task = await create.mutateAsync(toCreateTaskRequest(values, instants));
    requestHeadingFocus();
    // Replace, so Back does not return to a filled form.
    router.replace(taskPath(task.id));
  };
  return (
    <TaskForm
      source={{
        values: emptyTaskValues({
          assigneeId: session.user.id,
          clientId: preset.client?.id,
          dealId: preset.linkedDeal?.id,
        }),
        client: preset.client,
        linkedDeal: preset.linkedDeal,
        remindAt: null,
        reminderSentAt: null,
      }}
      assigneeOptions={members.map((member) => ({ value: member.id, label: member.name }))}
      submitLabel="Create task"
      cancelHref={preset.cancelHref}
      isEdit={false}
      isSaved={create.isSuccess}
      onSave={handleSave}
    />
  );
}

interface CreateStateProps {
  readonly preset: Preset;
  readonly headingId: string;
}

function CreateState({ preset, headingId }: CreateStateProps): React.JSX.Element {
  const members = useMembers();
  const session = useSession();
  if (members.data !== undefined && session.data !== undefined) {
    return <LoadedCreateForm preset={preset} members={members.data.items} session={session.data} />;
  }
  const queries = [members, session];
  if (queries.some((query) => query.isPending)) {
    return <TaskFormSkeleton />;
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

interface PresetStateProps<T> {
  readonly query: UseQueryResult<T>;
  readonly toPreset: (data: T) => Preset;
  readonly headingId: string;
}

// An unknown record is ignored, as a malformed id is; a failed load is not dropped silently.
function PresetState<T>({ query, toPreset, headingId }: PresetStateProps<T>): React.JSX.Element {
  if (query.isPending) {
    return <TaskFormSkeleton />;
  }
  if (query.data === undefined && !isNotFound(query.error)) {
    const handleRetry = (): void => {
      void query.refetch();
    };
    return (
      <RetryMessage
        message="We could not load the form."
        focusTargetId={headingId}
        onRetry={handleRetry}
      />
    );
  }
  const preset = query.data === undefined ? NO_PRESET : toPreset(query.data);
  return <CreateState preset={preset} headingId={headingId} />;
}

function CreateWithClient({
  clientId,
  headingId,
}: {
  readonly clientId: string;
  readonly headingId: string;
}): React.JSX.Element {
  const client = useClient(clientId);
  return (
    <PresetState
      query={client}
      headingId={headingId}
      toPreset={({ id, name }) => ({
        client: { id, name },
        linkedDeal: null,
        cancelHref: clientPath(id),
      })}
    />
  );
}

function CreateWithDeal({
  dealId,
  headingId,
}: {
  readonly dealId: string;
  readonly headingId: string;
}): React.JSX.Element {
  const deal = useDeal(dealId);
  return (
    <PresetState
      query={deal}
      headingId={headingId}
      toPreset={({ id, title, client }) => ({
        client,
        linkedDeal: { id, title, clientId: client.id },
        cancelHref: dealPath(id),
      })}
    />
  );
}

export function CreateTaskForm({
  clientId,
  dealId,
  headingId,
}: CreateTaskFormProps): React.JSX.Element {
  if (dealId !== undefined) {
    return <CreateWithDeal dealId={dealId} headingId={headingId} />;
  }
  if (clientId !== undefined) {
    return <CreateWithClient clientId={clientId} headingId={headingId} />;
  }
  return <CreateState preset={NO_PRESET} headingId={headingId} />;
}
