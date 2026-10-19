import { activityEventSchema, SUBJECT_KIND_BY_TYPE } from '@clientry/shared/activity';
import type { ActivityEvent } from '@clientry/shared/activity';

import { PEOPLE } from './data/people.js';
import type { People, PersonKey } from './data/people.js';
import type { DemoActivityRow } from './demo-rows.js';
import { uuidV7At } from './uuid-v7.js';

export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;

export interface DemoBuildContext {
  readonly now: Date;
  readonly workspaceId: string;
}

export interface PersonRef {
  readonly id: string;
  readonly name: string;
}

export interface Participants {
  readonly createdBy: PersonKey;
  readonly assignee: PersonKey;
}

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export function hoursAfter(time: Date, hours: number): Date {
  return new Date(time.getTime() + hours * HOUR_MS);
}

export function personRef(key: PersonKey): PersonRef {
  const { id, name } = PEOPLE[key];
  return { id, name };
}

export function isPersonKey(value: string): value is PersonKey {
  return Object.hasOwn(PEOPLE, value);
}

export function splitPeople(people: People): Participants {
  const [createdBy = '', assignee = createdBy] = people.split('>');
  if (!isPersonKey(createdBy) || !isPersonKey(assignee)) {
    throw new Error(`Unknown people "${people}" in the demo data`);
  }
  return { createdBy, assignee };
}

// Data files never put an event after the reset; a slip would show up as a future history entry.
export function assertHappened(context: DemoBuildContext, time: Date, what: string): void {
  if (time.getTime() > context.now.getTime()) {
    throw new Error(`${what} lies after the reset in the demo data`);
  }
}

export function assertAfter(time: Date, earlier: Date, what: string): void {
  if (time.getTime() <= earlier.getTime()) {
    throw new Error(`${what} does not follow the record it belongs to in the demo data`);
  }
}

// Parsed as it is built, so a broken story fails the builder instead of the feed.
export function activityRow(
  context: DemoBuildContext,
  actorId: string,
  subjectId: string,
  event: ActivityEvent,
  createdAt: Date,
): DemoActivityRow {
  const { type, payload } = activityEventSchema.parse(event);
  const kind = SUBJECT_KIND_BY_TYPE[type];
  return {
    id: uuidV7At(createdAt),
    workspaceId: context.workspaceId,
    actorId,
    dealId: kind === 'deal' ? subjectId : null,
    clientId: kind === 'client' ? subjectId : null,
    taskId: kind === 'task' ? subjectId : null,
    type,
    payload,
    createdAt,
  };
}

export function requireEntry<T>(entries: ReadonlyMap<string, T>, key: string, what: string): T {
  const entry = entries.get(key);
  if (entry === undefined) {
    throw new Error(`Unknown ${what} "${key}" in the demo data`);
  }
  return entry;
}
