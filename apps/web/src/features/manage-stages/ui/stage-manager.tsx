'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type * as React from 'react';

import { useStages } from '@/entities/deal';
import { useSession } from '@/entities/session';
import { RetryMessage } from '@/shared/ui/retry-message';
import type { MemberRole } from '@clientry/shared/auth';
import type { StageListItem } from '@clientry/shared/deals';

import { AddStageForm } from './add-stage-form';
import { DeleteStageDialog } from './delete-stage-dialog';
import { StageListSkeleton } from './stage-list-skeleton';
import { StageRow } from './stage-row';
import type { MoveFocusRequest, StageRowControls } from './stage-row';
import { handleStageError, toastGenericStageError } from '../model/stage-errors';
import { openStagesOf, reorderedIds } from '../model/stage-order';
import type { MoveDirection } from '../model/stage-order';
import { useReorderStages } from '../model/use-stage-mutations';

interface OrderedFocusRequest extends MoveFocusRequest {
  // The open stage ids the request waits for, joined.
  readonly ids: string;
}

function controlsFor(stage: StageListItem, openStages: readonly StageListItem[]): StageRowControls {
  const index = openStages.findIndex((item) => item.id === stage.id);
  return {
    canMoveUp: index > 0,
    canMoveDown: index !== -1 && index < openStages.length - 1,
    isLastOpen: openStages.length === 1,
  };
}

interface StageListProps {
  readonly stages: readonly StageListItem[];
  // Undefined while the session loads: neither the controls nor the note show yet.
  readonly role: MemberRole | undefined;
  readonly headingId: string;
}

interface StageReorder {
  readonly rowFocusRequest: MoveFocusRequest | null;
  readonly handleFocusDone: () => void;
  readonly handleMove: (stage: StageListItem, direction: MoveDirection) => void;
}

function useStageReorder(stages: readonly StageListItem[]): StageReorder {
  const queryClient = useQueryClient();
  const reorder = useReorderStages();
  const [focusRequest, setFocusRequest] = useState<OrderedFocusRequest | null>(null);
  const openIds = openStagesOf(stages)
    .map((stage) => stage.id)
    .join();
  const handleFocusDone = useCallback(() => {
    setFocusRequest(null);
  }, []);
  const handleMove = (stage: StageListItem, direction: MoveDirection): void => {
    const ids = reorderedIds(stages, stage.id, direction);
    if (ids === null || reorder.isPending) {
      return;
    }
    reorder.mutate(ids, {
      onSuccess: () => {
        setFocusRequest({ stageId: stage.id, direction, ids: ids.join() });
      },
      onError: (error) => {
        if (!handleStageError(error, { queryClient })) {
          toastGenericStageError();
        }
      },
    });
  };
  // The list may still show the old order: the cache notifies its readers a tick later.
  const rowFocusRequest = focusRequest?.ids === openIds ? focusRequest : null;
  return { rowFocusRequest, handleFocusDone, handleMove };
}

interface StageDeleting {
  readonly deleting: StageListItem | null;
  readonly focusHeading: () => void;
  readonly handleDelete: (stage: StageListItem, trigger: HTMLButtonElement) => void;
  readonly handleClose: () => void;
  readonly handleReturnFocus: (shouldFocusHeading: boolean) => void;
}

function useStageDeleting(headingId: string): StageDeleting {
  const [deleting, setDeleting] = useState<StageListItem | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const focusHeading = useCallback(() => {
    document.getElementById(headingId)?.focus();
  }, [headingId]);
  return {
    deleting,
    focusHeading,
    handleDelete: (stage, trigger) => {
      deleteTriggerRef.current = trigger;
      setDeleting(stage);
    },
    handleClose: () => {
      setDeleting(null);
    },
    // Back to the row's Delete button, or to the page heading once the row is gone.
    handleReturnFocus: (shouldFocusHeading) => {
      const trigger = deleteTriggerRef.current;
      if (!shouldFocusHeading && trigger?.isConnected === true) {
        trigger.focus();
        return;
      }
      focusHeading();
    },
  };
}

// A refetch while the delete dialog is open updates its stage; one gone from the list keeps the last.
function liveStage(stages: readonly StageListItem[], stage: StageListItem): StageListItem {
  return stages.find((item) => item.id === stage.id) ?? stage;
}

function StageList({ stages, role, headingId }: StageListProps): React.JSX.Element {
  const { rowFocusRequest, handleFocusDone, handleMove } = useStageReorder(stages);
  const { deleting, focusHeading, handleDelete, handleClose, handleReturnFocus } =
    useStageDeleting(headingId);
  const openStages = openStagesOf(stages);
  const isOwner = role === 'owner';

  return (
    <div className="flex flex-col gap-6">
      {role === 'manager' && (
        <p className="text-sm text-muted-foreground">Only owners can change stages.</p>
      )}
      <ol className="flex max-w-3xl flex-col divide-y rounded-lg border">
        {stages.map((stage) => (
          <StageRow
            key={stage.id}
            stage={stage}
            controls={isOwner ? controlsFor(stage, openStages) : null}
            focusRequest={rowFocusRequest}
            onFocusDone={handleFocusDone}
            onMove={handleMove}
            onDelete={handleDelete}
            onStageGone={focusHeading}
          />
        ))}
      </ol>
      {isOwner && <AddStageForm openCount={openStages.length} onLimitReached={focusHeading} />}
      {deleting !== null && (
        <DeleteStageDialog
          stage={liveStage(stages, deleting)}
          stages={stages}
          onClose={handleClose}
          onReturnFocus={handleReturnFocus}
        />
      )}
    </div>
  );
}

// Controls appear once the session says the viewer is the owner; the API checks the role again.
export function StageManager({ headingId }: { readonly headingId: string }): React.JSX.Element {
  const stages = useStages();
  const session = useSession();
  if (stages.data !== undefined) {
    return <StageList stages={stages.data.items} role={session.data?.role} headingId={headingId} />;
  }
  if (stages.isPending) {
    return <StageListSkeleton />;
  }
  const handleRetry = (): void => {
    void stages.refetch();
  };
  return (
    <RetryMessage
      message="We could not load the stages."
      focusTargetId={headingId}
      onRetry={handleRetry}
    />
  );
}
