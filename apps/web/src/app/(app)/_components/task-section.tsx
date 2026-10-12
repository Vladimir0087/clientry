'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import type * as React from 'react';

import { newTaskPath, TaskListSkeleton, useTasks } from '@/entities/task';
import { Button } from '@/shared/ui/button';
import { RetryMessage } from '@/shared/ui/retry-message';

import { TaskRows } from './task-rows';
import { taskSectionFilters } from '../_lib/task-section-filters';
import type { TaskSectionOwner } from '../_lib/task-section-filters';

const SKELETON_ROWS = 2;

interface SectionBodyProps {
  readonly owner: TaskSectionOwner;
  readonly headingId: string;
}

function SectionBody({ owner, headingId }: SectionBodyProps): React.JSX.Element {
  const list = useTasks(taskSectionFilters(owner));
  if (list.data === undefined) {
    if (list.isError) {
      const handleRetry = (): void => {
        void list.refetch();
      };
      return (
        <RetryMessage
          message="We could not load the tasks."
          focusTargetId={headingId}
          onRetry={handleRetry}
        />
      );
    }
    return <TaskListSkeleton rows={SKELETON_ROWS} />;
  }
  if (list.data.pages.every((page) => page.items.length === 0)) {
    return <p className="text-sm text-muted-foreground">No open tasks</p>;
  }
  return (
    <TaskRows
      list={list}
      data={list.data}
      place={'clientId' in owner ? 'client' : 'deal'}
      isAssigneeShown
    />
  );
}

// The open tasks of a client card or a deal page.
export function TaskSection({ owner }: { readonly owner: TaskSectionOwner }): React.JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold outline-none">
          Tasks
        </h2>
        <Button variant="outline" asChild>
          <Link href={newTaskPath(owner)}>
            <PlusIcon aria-hidden="true" />
            New task
          </Link>
        </Button>
      </div>
      <SectionBody owner={owner} headingId={headingId} />
    </section>
  );
}
