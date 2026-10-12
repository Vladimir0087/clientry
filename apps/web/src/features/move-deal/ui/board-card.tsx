'use client';

import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'cn';
import { GripVerticalIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type * as React from 'react';

import { DealCardBody } from '@/entities/deal';
import { isFocusStranded } from '@/shared/lib/is-focus-stranded';
import type { DealCard, Stage } from '@clientry/shared/deals';

import { DealActionsMenu } from './deal-actions-menu';
import type { CardFocusRequest } from '../model/use-card-focus';

// Every card renders again whenever the dragged one passes over another; its content does not.
const CardBody = memo(DealCardBody);
const ActionsMenu = memo(DealActionsMenu);

interface BoardCardProps {
  readonly deal: DealCard;
  readonly stageId: string;
  readonly stages: readonly Stage[];
  readonly isStale: boolean;
  readonly keyboardDragId: string | null;
  readonly focusRequest: CardFocusRequest | null;
  readonly onFocusDone: () => void;
  readonly onMenuMove: (dealId: string, fromStageId: string, toStageId: string) => void;
}

const CARD_CLASS =
  'flex min-w-0 gap-1 rounded-lg border bg-card pr-1 text-card-foreground shadow-xs';

function DragHandleIcon(): React.JSX.Element {
  return <GripVerticalIcon aria-hidden="true" className="size-4" />;
}

interface DragHandleProps {
  readonly title: string;
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
  readonly handleRef: (node: HTMLButtonElement | null) => void;
}

function DragHandle({
  title,
  attributes,
  listeners,
  handleRef,
}: DragHandleProps): React.JSX.Element {
  return (
    <button
      ref={handleRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag ${title}`}
      className="flex w-7 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-l-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
    >
      <DragHandleIcon />
    </button>
  );
}

interface CardFocusOptions extends Pick<
  BoardCardProps,
  'stageId' | 'focusRequest' | 'onFocusDone'
> {
  readonly dealId: string;
  readonly shouldHoldFocus: boolean;
  readonly setActivatorNodeRef: (node: HTMLElement | null) => void;
}

interface CardFocusTargets {
  readonly menuRef: React.RefObject<HTMLButtonElement | null>;
  readonly setHandleRef: (node: HTMLButtonElement | null) => void;
}

// Focus follows the card when it mounts again in another column.
function useCardFocusTargets({
  dealId,
  stageId,
  focusRequest,
  onFocusDone,
  shouldHoldFocus,
  setActivatorNodeRef,
}: CardFocusOptions): CardFocusTargets {
  const menuRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const setHandleRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setActivatorNodeRef(node);
      handleRef.current = node;
    },
    [setActivatorNodeRef],
  );

  // A move made or undone: taken only when focus went down with the old card.
  useEffect(() => {
    if (focusRequest?.dealId !== dealId || focusRequest.leaving === stageId) {
      return;
    }
    if (isFocusStranded()) {
      const target = focusRequest.target === 'menu' ? menuRef : handleRef;
      target.current?.focus({ preventScroll: !focusRequest.shouldScroll });
    }
    onFocusDone();
  }, [focusRequest, dealId, stageId, onFocusDone]);

  // A keyboard drag into another column mounts the card anew; before paint, so no frame lacks focus.
  useLayoutEffect(() => {
    if (shouldHoldFocus && isFocusStranded()) {
      handleRef.current?.focus({ preventScroll: true });
    }
  }, [shouldHoldFocus]);

  return { menuRef, setHandleRef };
}

export function BoardCard({
  deal,
  stageId,
  stages,
  isStale,
  keyboardDragId,
  focusRequest,
  onFocusDone,
  onMenuMove,
}: BoardCardProps): React.JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id, disabled: isStale });
  const { menuRef, setHandleRef } = useCardFocusTargets({
    dealId: deal.id,
    stageId,
    focusRequest,
    onFocusDone,
    shouldHoldFocus: keyboardDragId === deal.id,
    setActivatorNodeRef,
  });

  const handleMove = useCallback(
    (targetStageId: string): void => {
      onMenuMove(deal.id, stageId, targetStageId);
    },
    [onMenuMove, deal.id, stageId],
  );

  return (
    <li
      ref={setNodeRef}
      // dnd-kit places the card by an inline transform while it is dragged.
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      // The handle stays opaque: during a keyboard drag its focus ring must stay visible.
      className={cn(CARD_CLASS, isDragging && '*:not-first:opacity-40')}
    >
      <DragHandle
        title={deal.title}
        attributes={attributes}
        listeners={listeners}
        handleRef={setHandleRef}
      />
      <CardBody deal={deal} />
      <div className="pt-1">
        <ActionsMenu
          title={deal.title}
          stages={stages}
          currentStageId={stageId}
          isDisabled={isStale}
          triggerRef={menuRef}
          onMove={handleMove}
        />
      </div>
    </li>
  );
}

// What follows the pointer: the same card, without links or controls.
export function BoardCardOverlay({ deal }: { readonly deal: DealCard }): React.JSX.Element {
  return (
    // A copy of the lifted card: the live region already says what is dragged.
    <div aria-hidden="true" className={cn(CARD_CLASS, 'w-full cursor-grabbing shadow-lg')}>
      <span className="flex w-7 shrink-0 items-center justify-center text-muted-foreground">
        <DragHandleIcon />
      </span>
      <DealCardBody deal={deal} isStatic />
      {/* The menu button's room, so the title wraps as on the card. */}
      <span aria-hidden="true" className="w-7 shrink-0" />
    </div>
  );
}
