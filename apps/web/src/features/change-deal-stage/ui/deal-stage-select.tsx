'use client';

import { useEffect, useRef } from 'react';
import type * as React from 'react';

import { useMoveDeal, useStages } from '@/entities/deal';
import { isFocusStranded } from '@/shared/lib/is-focus-stranded';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import type { Deal, Stage } from '@clientry/shared/deals';

interface DealStageSelectProps {
  readonly deal: Deal;
  readonly labelId: string;
}

// A select without the chosen value shows blank, and a cached list may predate the deal's stage.
function withCurrentStage(stages: readonly Stage[], current: Stage): readonly Stage[] {
  return stages.some((stage) => stage.id === current.id) ? stages : [...stages, current];
}

// Moves the deal to the top of the chosen stage, as the card menu does.
export function DealStageSelect({ deal, labelId }: DealStageSelectProps): React.JSX.Element {
  const stages = useStages();
  const move = useMoveDeal('page');
  const { isPending } = move;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shouldRefocusRef = useRef(false);
  const options = withCurrentStage(stages.data?.items ?? [], deal.stage);

  // Disabling the trigger drops its focus; it comes back unless the user has moved on.
  useEffect(() => {
    if (isPending || !shouldRefocusRef.current) {
      return;
    }
    shouldRefocusRef.current = false;
    if (isFocusStranded()) {
      triggerRef.current?.focus();
    }
  }, [isPending]);

  const handleChange = (stageId: string): void => {
    if (stageId !== deal.stage.id) {
      shouldRefocusRef.current = true;
      move.mutate({ dealId: deal.id, stageId, afterId: null });
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Select value={deal.stage.id} disabled={isPending} onValueChange={handleChange}>
        <SelectTrigger ref={triggerRef} aria-labelledby={labelId} className="w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Without its own status role: a live region mounted with its label is not announced. */}
      {isPending && <Spinner isDecorative />}
      <p role="status" className="sr-only">
        {isPending ? 'Moving the deal…' : ''}
      </p>
    </div>
  );
}
