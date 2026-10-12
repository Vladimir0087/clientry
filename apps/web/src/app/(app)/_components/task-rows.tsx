'use client';

import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { cn } from 'cn';
import { useRef } from 'react';
import type * as React from 'react';

import { TASK_LINK_ATTRIBUTE, TaskRowBody } from '@/entities/task';
import type { TaskListData } from '@/entities/task';
import { CompleteTaskCheckbox } from '@/features/complete-task';
import { useLoadMoreFocus } from '@/shared/lib/use-load-more-focus';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';

import { TaskRelatedLinks } from './task-related';
import type { TaskRowPlace } from './task-related';

type TaskListQuery = UseInfiniteQueryResult<TaskListData>;

interface LoadMoreProps {
  readonly list: TaskListQuery;
  readonly onPress: () => void;
}

function LoadMore({ list, onPress }: LoadMoreProps): React.JSX.Element | null {
  if (!list.hasNextPage) {
    return null;
  }
  // aria-disabled rather than disabled: a disabled button would drop the focus it holds.
  const handleClick = (): void => {
    if (!list.isFetchingNextPage) {
      onPress();
      void list.fetchNextPage();
    }
  };
  return (
    <div className="flex flex-col items-center gap-2">
      {list.isFetchNextPageError && <p className="text-sm text-destructive">Could not load more</p>}
      <Button variant="outline" aria-disabled={list.isFetchingNextPage} onClick={handleClick}>
        {list.isFetchingNextPage && <Spinner data-icon="inline-start" aria-hidden="true" />}
        {list.isFetchNextPageError ? 'Try again' : 'Load more'}
      </Button>
    </div>
  );
}

interface TaskRowsProps {
  readonly list: TaskListQuery;
  readonly data: TaskListData;
  readonly place: TaskRowPlace;
  readonly isAssigneeShown: boolean;
}

export function TaskRows({ list, data, place, isAssigneeShown }: TaskRowsProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = data.pages.flatMap((page) => page.items);
  const handleLoadMore = useLoadMoreFocus(
    containerRef,
    TASK_LINK_ATTRIBUTE,
    items.length,
    list.hasNextPage,
  );
  return (
    <div
      ref={containerRef}
      aria-busy={list.isPlaceholderData}
      className={cn(
        'flex flex-col gap-4 transition-opacity',
        list.isPlaceholderData && 'opacity-60',
      )}
    >
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.map((task, index) => (
          <li key={task.id} className="flex items-start gap-3 p-3">
            <CompleteTaskCheckbox task={task} />
            <TaskRowBody
              task={task}
              index={index}
              isAssigneeShown={isAssigneeShown}
              related={<TaskRelatedLinks related={task.related} place={place} />}
            />
          </li>
        ))}
      </ul>
      <LoadMore list={list} onPress={handleLoadMore} />
    </div>
  );
}
