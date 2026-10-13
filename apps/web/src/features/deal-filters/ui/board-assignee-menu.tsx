'use client';

import type * as React from 'react';

import { MemberFilterMenu } from '@/entities/member';
import { useSession } from '@/entities/session';

import type { BoardFiltersState } from '../model/use-board-filters';

interface BoardAssigneeMenuProps {
  readonly state: BoardFiltersState;
  readonly ref?: React.Ref<HTMLButtonElement>;
}

export function BoardAssigneeMenu({ state, ref }: BoardAssigneeMenuProps): React.JSX.Element {
  const session = useSession();
  return (
    <MemberFilterMenu
      ref={ref}
      label="Assignee"
      value={state.filters.assignee}
      currentUserId={session.data?.user.id}
      onChange={state.setAssignee}
    />
  );
}
