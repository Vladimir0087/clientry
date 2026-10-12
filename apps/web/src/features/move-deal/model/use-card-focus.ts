import { notifyManager } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type * as React from 'react';

import type { MoveDealVariables } from '@/entities/deal';

export interface CardFocusRequest {
  readonly dealId: string;
  readonly target: 'menu' | 'handle';
  // The column a moving card leaves, waited out until it mounts in another; null after a failure.
  readonly leaving: string | null;
  // False after a pointer drag: the board stays where the user scrolled it.
  readonly shouldScroll: boolean;
}

export interface CardFocus {
  readonly focusRequest: CardFocusRequest | null;
  readonly handleMenuMove: (dealId: string, fromStageId: string, toStageId: string) => void;
  readonly handleDragStart: (activatorEvent: Event | null) => void;
  readonly handleDragEnd: () => void;
  readonly handleDrop: (move: MoveDealVariables) => void;
  readonly handleFocusDone: () => void;
}

type ReturnedFocus = Pick<CardFocusRequest, 'target' | 'shouldScroll'>;

const MENU_FOCUS: ReturnedFocus = { target: 'menu', shouldScroll: true };
const KEYBOARD_DROP_FOCUS: ReturnedFocus = { target: 'handle', shouldScroll: true };
const POINTER_DROP_FOCUS: ReturnedFocus = { target: 'handle', shouldScroll: false };

// A pointer drag gives focus back only when the card, the `li` around the pressed handle, had it.
function dropFocusOf(activatorEvent: Event | null): ReturnedFocus | null {
  if (activatorEvent instanceof KeyboardEvent) {
    return KEYBOARD_DROP_FOCUS;
  }
  const pressed = activatorEvent?.target;
  const card = pressed instanceof Element ? pressed.closest('li') : null;
  return card?.contains(document.activeElement) === true ? POINTER_DROP_FOCUS : null;
}

type MoveAsync = (move: MoveDealVariables) => Promise<unknown>;
type SendMove = (move: MoveDealVariables, focus: ReturnedFocus | null) => void;

// The promise, not a mutate callback: those fire only for the latest of several moves.
function useSendMove(
  moveAsync: MoveAsync,
  isDraggingRef: React.RefObject<boolean>,
  requestFocus: (request: CardFocusRequest) => void,
): SendMove {
  return useCallback(
    (move, focus) => {
      void moveAsync(move).catch(() => {
        if (focus === null) {
          return;
        }
        // Queued behind the board's pending notifications, so it renders with the settled board.
        notifyManager.schedule(() => {
          // A drag under way means the user has moved on to another card.
          if (!isDraggingRef.current) {
            requestFocus({ dealId: move.dealId, leaving: null, ...focus });
          }
        });
      });
    },
    [moveAsync, isDraggingRef, requestFocus],
  );
}

// A moved card mounts again in another column. After a failure the request waits for the move's
// refetch, so focus finds the card where the board settled, or the heading when it is gone.
export function useCardFocus(moveAsync: MoveAsync): CardFocus {
  const [focusRequest, setFocusRequest] = useState<CardFocusRequest | null>(null);
  const dropFocusRef = useRef<ReturnedFocus | null>(null);
  const isDraggingRef = useRef(false);
  const handleFocusDone = useCallback(() => {
    setFocusRequest(null);
  }, []);
  const send = useSendMove(moveAsync, isDraggingRef, setFocusRequest);
  // Stable, so the memoized card menus do not render again with the board.
  const handleMenuMove = useCallback(
    (dealId: string, fromStageId: string, toStageId: string): void => {
      setFocusRequest({ dealId, leaving: fromStageId, ...MENU_FOCUS });
      send({ dealId, stageId: toStageId, afterId: null }, MENU_FOCUS);
    },
    [send],
  );
  return {
    focusRequest,
    handleMenuMove,
    // A request left over from a failed move must not pull focus away mid-drag.
    handleDragStart: (activatorEvent) => {
      isDraggingRef.current = true;
      setFocusRequest(null);
      dropFocusRef.current = dropFocusOf(activatorEvent);
    },
    handleDragEnd: () => {
      isDraggingRef.current = false;
    },
    handleDrop: (move) => {
      send(move, dropFocusRef.current);
    },
    handleFocusDone,
  };
}
