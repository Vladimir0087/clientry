import type { StageKind } from '@clientry/shared/deals';

export function isClosedStage(kind: StageKind): boolean {
  return kind !== 'open';
}
