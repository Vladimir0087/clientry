import type { Currency, DealChange, DealEvent, Stage } from '@clientry/shared/deals';

import type { DealChangeRow, DealStory, StageCode } from './data/deals.js';
import { DEAL_STORIES, DEAL_UPDATES } from './data/deals.js';
import type { PersonKey } from './data/people.js';
import type { DemoBuildContext } from './demo-build-context.js';
import {
  activityRow,
  assertAfter,
  assertHappened,
  DAY_MS,
  daysBefore,
  personRef,
  requireEntry,
  splitPeople,
} from './demo-build-context.js';
import type { DemoActivityRow, DemoClientRow, DemoDealRow, DemoStageRow } from './demo-rows.js';
import { uuidV7At } from './uuid-v7.js';
import { positionsAfter } from '../deals/deal-position.js';

// The index of each code's stage in DEFAULT_STAGES.
const STAGE_POSITIONS: Readonly<Record<StageCode, number>> = { N: 0, C: 1, P: 2, K: 3, W: 4, L: 5 };

const STEP = /^([NCPKWL])(\d+(?:\.\d+)?)$/;

type TimelineEntry =
  | { readonly time: Date; readonly move: Stage }
  | { readonly time: Date; readonly change: DealChangeRow };

interface DealState {
  readonly stage: Stage;
  readonly assignee: PersonKey;
  readonly amount: number;
}

// The deal as its creator entered it, in New.
interface DealStart {
  readonly key: string;
  readonly id: string;
  readonly clientId: string;
  readonly title: string;
  readonly creatorId: string;
  readonly currency: Currency;
  readonly createdAt: Date;
  readonly state: DealState;
}

interface DealHistory {
  readonly state: DealState;
  readonly activities: readonly DemoActivityRow[];
}

type DealDraft = Omit<DemoDealRow, 'position'>;

interface BuiltStory {
  readonly key: string;
  readonly deal: DealDraft;
  readonly activities: readonly DemoActivityRow[];
}

export interface DemoDeals {
  readonly deals: readonly DemoDealRow[];
  readonly activities: readonly DemoActivityRow[];
  // Deal rows by their story key, for the tasks linked to them.
  readonly byKey: ReadonlyMap<string, DemoDealRow>;
}

function isStageCode(value: string): value is StageCode {
  return Object.hasOwn(STAGE_POSITIONS, value);
}

function stageFor(stages: readonly DemoStageRow[], code: StageCode): Stage {
  const stage = stages.find(({ position }) => position === STAGE_POSITIONS[code]);
  if (!stage) {
    throw new Error(`Stage ${code} is missing from the demo stages`);
  }
  return { id: stage.id, name: stage.name, kind: stage.kind };
}

function moves(stages: readonly DemoStageRow[], steps: string, createdAt: Date): TimelineEntry[] {
  let time = createdAt;
  return steps
    .split(' ')
    .filter((step) => step !== '')
    .map((step) => {
      const [, code = '', days = ''] = STEP.exec(step) ?? [];
      if (!isStageCode(code)) {
        throw new Error(`Invalid step "${step}" in the demo deal stories`);
      }
      time = new Date(time.getTime() + Number(days) * DAY_MS);
      return { time, move: stageFor(stages, code) };
    });
}

function updates(context: DemoBuildContext, key: string): TimelineEntry[] {
  return DEAL_UPDATES.filter(([deal]) => deal === key).map(([, days, change]) => ({
    time: daysBefore(context.now, days),
    change,
  }));
}

function changeFor(state: DealState, change: DealChangeRow, currency: Currency): DealChange {
  if ('amount' in change) {
    return {
      field: 'amount',
      from: { amount: state.amount, currency },
      to: { amount: change.amount * 100, currency },
    };
  }
  return { field: 'assignee', from: personRef(state.assignee), to: personRef(change.assignee) };
}

function eventFor(state: DealState, entry: TimelineEntry, currency: Currency): DealEvent {
  if ('move' in entry) {
    return { type: 'deal_moved', payload: { from: state.stage, to: entry.move } };
  }
  return { type: 'deal_updated', payload: { changes: [changeFor(state, entry.change, currency)] } };
}

function apply(state: DealState, entry: TimelineEntry): DealState {
  if ('move' in entry) {
    return { ...state, stage: entry.move };
  }
  const { change } = entry;
  return 'amount' in change
    ? { ...state, amount: change.amount * 100 }
    : { ...state, assignee: change.assignee };
}

// A deal is closed by its move into Paid or Lost, so no move may follow that one.
function assertClosedLast(timeline: readonly TimelineEntry[], key: string): void {
  const stages = timeline.flatMap((entry) => ('move' in entry ? [entry.move] : []));
  const closing = stages.findIndex(({ kind }) => kind !== 'open');
  if (closing !== -1 && closing !== stages.length - 1) {
    throw new Error(`Deal "${key}" moves after it closed in the demo data`);
  }
}

function timelineOf(
  context: DemoBuildContext,
  stages: readonly DemoStageRow[],
  [key, , , , , , steps]: DealStory,
  createdAt: Date,
): TimelineEntry[] {
  const timeline = [...moves(stages, steps, createdAt), ...updates(context, key)].toSorted(
    (left, right) => left.time.getTime() - right.time.getTime(),
  );
  assertClosedLast(timeline, key);
  for (const { time } of timeline) {
    assertAfter(time, createdAt, `An event of deal "${key}"`);
    assertHappened(context, time, `An event of deal "${key}"`);
  }
  return timeline;
}

function storyStart(
  context: DemoBuildContext,
  stages: readonly DemoStageRow[],
  clients: ReadonlyMap<string, DemoClientRow>,
  story: DealStory,
): DealStart {
  const [key, clientKey, title, amount, people, startedDaysAgo, , currency = 'USD'] = story;
  const client = requireEntry(clients, clientKey, 'client');
  const { createdBy, assignee } = splitPeople(people);
  const createdAt = daysBefore(context.now, startedDaysAgo);
  assertAfter(createdAt, client.createdAt, `Deal "${key}"`);
  return {
    key,
    id: uuidV7At(createdAt),
    clientId: client.id,
    title,
    creatorId: personRef(createdBy).id,
    currency,
    createdAt,
    state: { stage: stageFor(stages, 'N'), assignee, amount: amount * 100 },
  };
}

function replayHistory(
  context: DemoBuildContext,
  start: DealStart,
  timeline: readonly TimelineEntry[],
): DealHistory {
  const { id, creatorId, currency, createdAt } = start;
  let { state } = start;
  const created: DealEvent = {
    type: 'deal_created',
    payload: { stage: state.stage, amount: state.amount, currency },
  };
  const activities = [activityRow(context, creatorId, id, created, createdAt)];
  for (const entry of timeline) {
    // A move is made by whoever holds the deal; an edit by its creator.
    const actorId = 'move' in entry ? personRef(state.assignee).id : creatorId;
    activities.push(
      activityRow(context, actorId, id, eventFor(state, entry, currency), entry.time),
    );
    state = apply(state, entry);
  }
  return { state, activities };
}

function dealDraft(
  context: DemoBuildContext,
  start: DealStart,
  timeline: readonly TimelineEntry[],
  state: DealState,
): DealDraft {
  const lastTime = timeline.at(-1)?.time ?? start.createdAt;
  return {
    id: start.id,
    workspaceId: context.workspaceId,
    clientId: start.clientId,
    stageId: state.stage.id,
    assigneeId: personRef(state.assignee).id,
    createdById: start.creatorId,
    title: start.title,
    amount: state.amount,
    currency: start.currency,
    version: 1 + timeline.length,
    closedAt: state.stage.kind === 'open' ? null : lastTime,
    createdAt: start.createdAt,
    updatedAt: lastTime,
  };
}

function buildStory(
  context: DemoBuildContext,
  stages: readonly DemoStageRow[],
  clients: ReadonlyMap<string, DemoClientRow>,
  story: DealStory,
): BuiltStory {
  const start = storyStart(context, stages, clients, story);
  const timeline = timelineOf(context, stages, story, start.createdAt);
  const { state, activities } = replayHistory(context, start, timeline);
  return { key: start.key, deal: dealDraft(context, start, timeline, state), activities };
}

// Within each stage positions follow story order, as a script appending cards to a column would.
function withPositions(stories: readonly BuiltStory[]): (readonly [string, DemoDealRow])[] {
  const lastPositions = new Map<string, string>();
  return stories.map(({ key, deal }) => {
    const [position] = positionsAfter(lastPositions.get(deal.stageId) ?? null, 1);
    if (position === undefined) {
      throw new Error('No position was generated for a demo deal');
    }
    lastPositions.set(deal.stageId, position);
    return [key, { ...deal, position }];
  });
}

export function buildDemoDeals(
  context: DemoBuildContext,
  stages: readonly DemoStageRow[],
  clients: ReadonlyMap<string, DemoClientRow>,
): DemoDeals {
  const built = DEAL_STORIES.map((story) => buildStory(context, stages, clients, story));
  const byKey = new Map(withPositions(built));
  if (byKey.size !== built.length) {
    throw new Error('Two demo deal stories share a key');
  }
  return {
    deals: [...byKey.values()],
    activities: built.flatMap(({ activities }) => activities),
    byKey,
  };
}
