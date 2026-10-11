import type { StageListItem } from '@clientry/shared/deals';

export type MoveDirection = 'up' | 'down';

export function openStagesOf(stages: readonly StageListItem[]): readonly StageListItem[] {
  return stages.filter((stage) => stage.kind === 'open');
}

// The open stage ids with one stage swapped with its neighbour, or null at the end of the list.
export function reorderedIds(
  stages: readonly StageListItem[],
  stageId: string,
  direction: MoveDirection,
): readonly string[] | null {
  const ids = openStagesOf(stages).map((stage) => stage.id);
  const index = ids.indexOf(stageId);
  const target = direction === 'up' ? index - 1 : index + 1;
  const neighbour = ids[target];
  if (index === -1 || neighbour === undefined) {
    return null;
  }
  const next = [...ids];
  next[target] = stageId;
  next[index] = neighbour;
  return next;
}

// Where a deleted stage's deals go by default: the previous open stage, the next one for the first.
export function defaultTargetId(
  stages: readonly StageListItem[],
  stageId: string,
): string | undefined {
  const open = openStagesOf(stages);
  const index = open.findIndex((stage) => stage.id === stageId);
  return (index > 0 ? open[index - 1] : open[index + 1])?.id;
}
