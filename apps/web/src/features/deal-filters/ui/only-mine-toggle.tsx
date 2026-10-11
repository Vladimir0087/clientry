'use client';

import { CheckIcon } from 'lucide-react';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';

import type { BoardFiltersState } from '../model/use-board-filters';

interface OnlyMineToggleProps {
  readonly state: BoardFiltersState;
  readonly ref?: React.Ref<HTMLButtonElement>;
}

export function OnlyMineToggle({ state, ref }: OnlyMineToggleProps): React.JSX.Element {
  const { isMine } = state.filters;
  const handleClick = (): void => {
    state.setMine(!isMine);
  };
  return (
    <Button
      ref={ref}
      variant={isMine ? 'secondary' : 'outline'}
      aria-pressed={isMine}
      onClick={handleClick}
    >
      {isMine && <CheckIcon aria-hidden="true" />}
      Only mine
    </Button>
  );
}
