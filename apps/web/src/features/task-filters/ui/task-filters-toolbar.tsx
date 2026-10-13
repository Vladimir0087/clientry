'use client';

import type * as React from 'react';

import { MemberFilterMenu } from '@/entities/member';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import type { TaskStatus } from '@clientry/shared/tasks';

import type { TaskFiltersState } from '../model/use-task-filters';

const STATUSES: readonly { readonly value: TaskStatus; readonly label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
];

interface TaskFiltersToolbarProps {
  readonly state: TaskFiltersState;
  readonly assigneeRef?: React.Ref<HTMLButtonElement>;
}

export function TaskFiltersToolbar({
  state,
  assigneeRef,
}: TaskFiltersToolbarProps): React.JSX.Element {
  const { assignee, status } = state.filters;
  const session = useSession();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MemberFilterMenu
        ref={assigneeRef}
        label="Assignee"
        value={assignee}
        currentUserId={session.data?.user.id}
        onChange={state.setAssignee}
      />
      <div role="group" aria-label="Status" className="flex">
        {STATUSES.map(({ value, label }) => {
          const isPressed = status === value;
          return (
            <Button
              key={value}
              variant={isPressed ? 'secondary' : 'outline'}
              aria-pressed={isPressed}
              className="first:rounded-r-none last:-ml-px last:rounded-l-none"
              onClick={() => {
                state.setStatus(value);
              }}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
