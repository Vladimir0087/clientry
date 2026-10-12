'use client';

import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';
import type * as React from 'react';

import { newTaskPath, TaskListSkeleton, useTasks } from '@/entities/task';
import type { TaskFilters, TaskListData } from '@/entities/task';
import { TaskFiltersToolbar, useTaskFilters } from '@/features/task-filters';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';

import { TaskRows } from '../../_components/task-rows';

const HEADING_ID = 'tasks-heading';

interface EmptyStateProps {
  readonly filters: TaskFilters;
  readonly onShowEveryone: () => void;
}

function EmptyState({ filters, onShowEveryone }: EmptyStateProps): React.JSX.Element {
  if (filters.status === 'done') {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No completed tasks yet.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!filters.isMine) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No open tasks. Add one with New task.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No open tasks are assigned to you.</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onShowEveryone}>
          Show everyone&apos;s tasks
        </Button>
      </EmptyContent>
    </Empty>
  );
}

interface ListBodyProps extends EmptyStateProps {
  readonly list: UseInfiniteQueryResult<TaskListData>;
}

function ListBody({ list, filters, onShowEveryone }: ListBodyProps): React.JSX.Element {
  if (list.data === undefined) {
    if (!list.isError) {
      return <TaskListSkeleton />;
    }
    const handleRetry = (): void => {
      void list.refetch();
    };
    return (
      <RetryMessage
        message="We could not load tasks."
        focusTargetId={HEADING_ID}
        onRetry={handleRetry}
      />
    );
  }
  const hasItems = list.data.pages.some((page) => page.items.length > 0);
  if (hasItems) {
    return <TaskRows list={list} data={list.data} place="list" isAssigneeShown={!filters.isMine} />;
  }
  // An empty list of the old filters says nothing about the new ones.
  return list.isPlaceholderData ? (
    <TaskListSkeleton />
  ) : (
    <EmptyState filters={filters} onShowEveryone={onShowEveryone} />
  );
}

export function TasksView(): React.JSX.Element {
  const state = useTaskFilters();
  const list = useTasks(state.filters);
  const mineRef = useRef<HTMLButtonElement>(null);
  // The button goes with the empty state, so "Only mine", now off, takes its focus.
  const handleShowEveryone = (): void => {
    state.setMine(false);
    mineRef.current?.focus();
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading id={HEADING_ID}>Tasks</PageHeading>
        <Button asChild>
          <Link href={newTaskPath()}>
            <PlusIcon aria-hidden="true" />
            New task
          </Link>
        </Button>
      </div>
      <TaskFiltersToolbar state={state} mineRef={mineRef} />
      <ListBody list={list} filters={state.filters} onShowEveryone={handleShowEveryone} />
    </div>
  );
}
