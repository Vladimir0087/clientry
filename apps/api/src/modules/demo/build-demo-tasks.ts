import { notificationEventSchema } from '@clientry/shared/notifications';

import type { PersonKey } from './data/people.js';
import { TASKS } from './data/tasks.js';
import type { Offset, TaskLink, TaskRow } from './data/tasks.js';
import {
  activityRow,
  assertAfter,
  assertHappened,
  DAY_MS,
  HOUR_MS,
  hoursAfter,
  personRef,
  requireEntry,
  splitPeople,
} from './demo-build-context.js';
import type { DemoBuildContext, Participants } from './demo-build-context.js';
import type {
  DemoActivityRow,
  DemoClientRow,
  DemoDealRow,
  DemoNotificationRow,
  DemoTaskRow,
} from './demo-rows.js';
import { uuidV7At } from './uuid-v7.js';

const OFFSET = /^([+-])(\d+(?:\.\d+)?)([dh])$/;
const QUARTER_HOUR_MS = 15 * 60_000;

export interface DemoTasks {
  readonly tasks: readonly DemoTaskRow[];
  readonly activities: readonly DemoActivityRow[];
  readonly notifications: readonly DemoNotificationRow[];
}

export interface TaskLinkTargets {
  readonly clients: ReadonlyMap<string, DemoClientRow>;
  readonly deals: ReadonlyMap<string, DemoDealRow>;
}

interface LinkedRecord {
  readonly clientId: string | null;
  readonly dealId: string | null;
  readonly createdAt: Date | null;
}

interface BuiltTask {
  readonly task: DemoTaskRow;
  readonly activities: readonly DemoActivityRow[];
  readonly notification: DemoNotificationRow | null;
}

function fromReset(now: Date, offset: Offset): Date {
  const [, sign = '', amount = '', unit = ''] = OFFSET.exec(offset) ?? [];
  if (sign === '') {
    throw new Error(`Invalid offset "${offset}" in the demo tasks`);
  }
  const ms = Number(amount) * (unit === 'd' ? DAY_MS : HOUR_MS);
  return new Date(now.getTime() + (sign === '-' ? -ms : ms));
}

// Due times on the quarter hour read like ones a person picked.
function roundToQuarterHour(time: Date): Date {
  return new Date(Math.round(time.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
}

function linkedRecord(targets: TaskLinkTargets, link: TaskLink | null): LinkedRecord {
  if (link === null) {
    return { clientId: null, dealId: null, createdAt: null };
  }
  const [kind, key = ''] = link.split(':');
  if (kind === 'client') {
    const client = requireEntry(targets.clients, key, 'client');
    return { clientId: client.id, dealId: null, createdAt: client.createdAt };
  }
  const deal = requireEntry(targets.deals, key, 'deal');
  return { clientId: null, dealId: deal.id, createdAt: deal.createdAt };
}

interface TaskTimes {
  readonly createdAt: Date;
  readonly dueAt: Date;
  readonly remindAt: Date | null;
  readonly doneAt: Date | null;
}

function timesOf(context: DemoBuildContext, row: TaskRow): TaskTimes {
  const [title, , , created, due, remind = null, done = null] = row;
  const createdAt = fromReset(context.now, created);
  const dueAt = roundToQuarterHour(fromReset(context.now, due));
  const remindAt = remind === null ? null : hoursAfter(dueAt, -remind);
  const doneAt = done === null ? null : hoursAfter(dueAt, done);
  assertHappened(context, createdAt, `Task "${title}"`);
  for (const time of [remindAt, doneAt]) {
    if (time !== null) {
      assertAfter(time, createdAt, `An event of task "${title}"`);
    }
  }
  if (doneAt !== null) {
    assertHappened(context, doneAt, `Completion of task "${title}"`);
  }
  return { createdAt, dueAt, remindAt, doneAt };
}

function notificationFor(
  context: DemoBuildContext,
  task: DemoTaskRow,
  sentAt: Date,
  read: number | undefined,
): DemoNotificationRow {
  const readAt = read === undefined ? null : hoursAfter(sentAt, read);
  if (readAt !== null) {
    assertHappened(context, readAt, `Reading the reminder of task "${task.title}"`);
  }
  const { type, payload } = notificationEventSchema.parse({
    type: 'task_reminder',
    payload: { task: { id: task.id, title: task.title }, dueAt: task.dueAt.toISOString() },
  });
  return {
    id: uuidV7At(sentAt),
    workspaceId: context.workspaceId,
    userId: task.assigneeId,
    taskId: task.id,
    type,
    payload,
    readAt,
    createdAt: sentAt,
  };
}

function taskRow(
  context: DemoBuildContext,
  targets: TaskLinkTargets,
  row: TaskRow,
  { createdBy, assignee }: Participants,
): DemoTaskRow {
  const [title, , link] = row;
  const times = timesOf(context, row);
  const linked = linkedRecord(targets, link);
  if (linked.createdAt !== null) {
    assertAfter(times.createdAt, linked.createdAt, `Task "${title}"`);
  }
  // A reminder due before the reset was delivered then, as the worker would have.
  const sentAt = times.remindAt !== null && times.remindAt <= context.now ? times.remindAt : null;
  return {
    id: uuidV7At(times.createdAt),
    workspaceId: context.workspaceId,
    createdById: personRef(createdBy).id,
    assigneeId: personRef(assignee).id,
    clientId: linked.clientId,
    dealId: linked.dealId,
    title,
    ...times,
    reminderSentAt: sentAt,
    updatedAt: times.doneAt ?? times.createdAt,
  };
}

function taskActivities(
  context: DemoBuildContext,
  task: DemoTaskRow,
  assignee: PersonKey,
): DemoActivityRow[] {
  const created = activityRow(
    context,
    task.createdById,
    task.id,
    {
      type: 'task_created',
      payload: { assignee: personRef(assignee), dueAt: task.dueAt.toISOString() },
    },
    task.createdAt,
  );
  if (task.doneAt === null) {
    return [created];
  }
  const completed = activityRow(
    context,
    task.assigneeId,
    task.id,
    { type: 'task_completed', payload: {} },
    task.doneAt,
  );
  return [created, completed];
}

function buildTask(context: DemoBuildContext, targets: TaskLinkTargets, row: TaskRow): BuiltTask {
  const [title, people, , , , , , read] = row;
  const participants = splitPeople(people);
  const task = taskRow(context, targets, row, participants);
  const sentAt = task.reminderSentAt;
  if (read !== undefined && sentAt === null) {
    throw new Error(`Task "${title}" has a read time but no sent reminder in the demo data`);
  }
  return {
    task,
    activities: taskActivities(context, task, participants.assignee),
    notification: sentAt === null ? null : notificationFor(context, task, sentAt, read),
  };
}

export function buildDemoTasks(context: DemoBuildContext, targets: TaskLinkTargets): DemoTasks {
  const built = TASKS.map((row) => buildTask(context, targets, row));
  return {
    tasks: built.map(({ task }) => task),
    activities: built.flatMap(({ activities }) => activities),
    notifications: built.flatMap(({ notification }) => (notification ? [notification] : [])),
  };
}
