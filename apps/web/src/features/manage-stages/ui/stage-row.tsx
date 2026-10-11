'use client';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';

import { pluralizeDeals, StageKindBadge } from '@/entities/deal';
import { Button } from '@/shared/ui/button';
import type { StageListItem } from '@clientry/shared/deals';

import { RenameStageForm } from './rename-stage-form';
import type { MoveDirection } from '../model/stage-order';

const LAST_OPEN_STAGE_HINT = 'A pipeline needs at least one open stage.';

export interface MoveFocusRequest {
  readonly stageId: string;
  readonly direction: MoveDirection;
}

export interface StageRowControls {
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly isLastOpen: boolean;
}

interface StageRowProps {
  readonly stage: StageListItem;
  // Null for a manager: the list is read-only.
  readonly controls: StageRowControls | null;
  readonly focusRequest: MoveFocusRequest | null;
  readonly onFocusDone: () => void;
  readonly onMove: (stage: StageListItem, direction: MoveDirection) => void;
  // The pressed button comes along: focus goes back to it when the dialog closes.
  readonly onDelete: (stage: StageListItem, trigger: HTMLButtonElement) => void;
  // The stage turned out deleted elsewhere: its row is about to go.
  readonly onStageGone: () => void;
}

function StageSummary({ stage }: { readonly stage: StageListItem }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 font-medium break-words">{stage.name}</span>
      <StageKindBadge kind={stage.kind} />
      <span className="text-sm text-muted-foreground">{pluralizeDeals(stage.dealCount)}</span>
    </div>
  );
}

// The pressed button keeps focus; at the end of the list it is disabled, so the other one takes it.
function useMoveFocus(
  stageId: string,
  { canMoveUp, canMoveDown }: StageRowControls,
  request: MoveFocusRequest | null,
  onDone: () => void,
): {
  readonly up: React.RefObject<HTMLButtonElement | null>;
  readonly down: React.RefObject<HTMLButtonElement | null>;
} {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (request?.stageId !== stageId) {
      return;
    }
    const isUp = request.direction === 'up' ? canMoveUp : !canMoveDown;
    (isUp ? up : down).current?.focus();
    onDone();
  }, [request, stageId, canMoveUp, canMoveDown, onDone]);
  return { up, down };
}

interface MoveButtonsProps {
  readonly stage: StageListItem;
  readonly controls: StageRowControls;
  readonly focusRequest: MoveFocusRequest | null;
  readonly onFocusDone: () => void;
  readonly onMove: (stage: StageListItem, direction: MoveDirection) => void;
}

function MoveButtons({
  stage,
  controls,
  focusRequest,
  onFocusDone,
  onMove,
}: MoveButtonsProps): React.JSX.Element {
  const { up, down } = useMoveFocus(stage.id, controls, focusRequest, onFocusDone);
  return (
    <>
      <Button
        ref={up}
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${stage.name} up`}
        disabled={!controls.canMoveUp}
        onClick={() => {
          onMove(stage, 'up');
        }}
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        ref={down}
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${stage.name} down`}
        disabled={!controls.canMoveDown}
        onClick={() => {
          onMove(stage, 'down');
        }}
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
    </>
  );
}

interface Renaming {
  readonly isRenaming: boolean;
  readonly renameRef: React.RefObject<HTMLButtonElement | null>;
  readonly handleStart: () => void;
  readonly handleFinish: () => void;
}

// After the form closes, focus goes back to the Rename button that opened it.
function useRenaming(): Renaming {
  const [isRenaming, setIsRenaming] = useState(false);
  const renameRef = useRef<HTMLButtonElement>(null);
  const shouldFocusRef = useRef(false);
  useEffect(() => {
    if (!isRenaming && shouldFocusRef.current) {
      shouldFocusRef.current = false;
      renameRef.current?.focus();
    }
  }, [isRenaming]);
  return {
    isRenaming,
    renameRef,
    handleStart: () => {
      setIsRenaming(true);
    },
    handleFinish: () => {
      shouldFocusRef.current = true;
      setIsRenaming(false);
    },
  };
}

interface DeleteButtonProps {
  readonly stage: StageListItem;
  // Set for the last open stage, which cannot be deleted.
  readonly hintId: string | undefined;
  // The pressed button comes along: focus goes back to it when the dialog closes.
  readonly onDelete: (stage: StageListItem, trigger: HTMLButtonElement) => void;
}

function DeleteButton({ stage, hintId, onDelete }: DeleteButtonProps): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={hintId !== undefined}
      aria-label={`Delete ${stage.name}`}
      aria-describedby={hintId}
      onClick={(event) => {
        onDelete(stage, event.currentTarget);
      }}
    >
      Delete
    </Button>
  );
}

export function StageRow({
  stage,
  controls,
  focusRequest,
  onFocusDone,
  onMove,
  onDelete,
  onStageGone,
}: StageRowProps): React.JSX.Element {
  const hintId = useId();
  const { isRenaming, renameRef, handleStart, handleFinish } = useRenaming();
  // A role refetched as manager takes the controls away, an open rename form included.
  if (isRenaming && controls !== null) {
    return (
      <li className="p-3">
        <RenameStageForm stage={stage} onDone={handleFinish} onGone={onStageGone} />
      </li>
    );
  }
  const isOpen = stage.kind === 'open';
  const hasHint = controls?.isLastOpen === true && isOpen;
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <StageSummary stage={stage} />
      {controls !== null && (
        <div className="flex flex-wrap items-center gap-1">
          {isOpen && (
            <MoveButtons
              stage={stage}
              controls={controls}
              focusRequest={focusRequest}
              onFocusDone={onFocusDone}
              onMove={onMove}
            />
          )}
          <Button
            ref={renameRef}
            variant="outline"
            size="sm"
            aria-label={`Rename ${stage.name}`}
            onClick={handleStart}
          >
            Rename
          </Button>
          {isOpen && (
            <DeleteButton stage={stage} hintId={hasHint ? hintId : undefined} onDelete={onDelete} />
          )}
        </div>
      )}
      {hasHint && (
        <p id={hintId} className="text-xs text-muted-foreground sm:basis-full">
          {LAST_OPEN_STAGE_HINT}
        </p>
      )}
    </li>
  );
}
