'use client';

import { CheckIcon } from 'lucide-react';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import type { TaskStatus } from '@clientry/shared/tasks';

import type { TaskFiltersState } from '../model/use-task-filters';

const STATUSES: readonly { readonly value: TaskStatus; readonly label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
];

interface TaskFiltersToolbarProps {
  readonly state: TaskFiltersState;
  readonly mineRef?: React.Ref<HTMLButtonElement>;
}

export function TaskFiltersToolbar({ state, mineRef }: TaskFiltersToolbarProps): React.JSX.Element {
  const { isMine, status } = state.filters;
  const handleMineClick = (): void => {
    state.setMine(!isMine);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        ref={mineRef}
        variant={isMine ? 'secondary' : 'outline'}
        aria-pressed={isMine}
        onClick={handleMineClick}
      >
        {isMine && <CheckIcon aria-hidden="true" />}
        Only mine
      </Button>
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
