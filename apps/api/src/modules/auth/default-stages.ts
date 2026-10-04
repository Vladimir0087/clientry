export type StageKind = 'open' | 'won' | 'lost';

export interface DefaultStage {
  readonly name: string;
  readonly position: number;
  readonly kind: StageKind;
}

const STAGES: readonly (readonly [string, StageKind])[] = [
  ['New', 'open'],
  ['Call', 'open'],
  ['Proposal sent', 'open'],
  ['Contract', 'open'],
  ['Paid', 'won'],
  ['Lost', 'lost'],
];

export const DEFAULT_STAGES: readonly DefaultStage[] = Object.freeze(
  STAGES.map(([name, kind], position) => Object.freeze({ name, position, kind })),
);
