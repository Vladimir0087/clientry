'use client';

import { EllipsisVerticalIcon } from 'lucide-react';
import { useId, useRef } from 'react';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { Stage } from '@clientry/shared/deals';

interface DealActionsMenuProps {
  readonly title: string;
  readonly stages: readonly Stage[];
  readonly currentStageId: string;
  readonly isDisabled: boolean;
  readonly triggerRef: React.Ref<HTMLButtonElement>;
  readonly onMove: (stageId: string) => void;
}

// The one-tap alternative to dragging.
export function DealActionsMenu({
  title,
  stages,
  currentStageId,
  isDisabled,
  triggerRef,
  onMove,
}: DealActionsMenuProps): React.JSX.Element {
  const labelId = useId();
  const hasMovedRef = useRef(false);
  const handleChange = (stageId: string): void => {
    if (stageId !== currentStageId) {
      hasMovedRef.current = true;
      onMove(stageId);
    }
  };
  // The moved card's own trigger takes focus in the new column instead.
  const handleCloseAutoFocus = (event: Event): void => {
    if (hasMovedRef.current) {
      hasMovedRef.current = false;
      event.preventDefault();
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-sm"
          disabled={isDisabled}
          aria-label={`Actions for ${title}`}
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={handleCloseAutoFocus}>
        <DropdownMenuLabel id={labelId}>Move to</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-labelledby={labelId}
          value={currentStageId}
          onValueChange={handleChange}
        >
          {stages.map((stage) => (
            <DropdownMenuRadioItem key={stage.id} value={stage.id}>
              <span className="truncate">{stage.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
