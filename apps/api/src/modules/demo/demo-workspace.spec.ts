import { describe, expect, it } from 'vitest';

import { activityEventSchema } from '@clientry/shared/activity';
import { createClientRequestSchema } from '@clientry/shared/clients';
import { createDealRequestSchema } from '@clientry/shared/deals';
import { notificationEventSchema } from '@clientry/shared/notifications';
import { createTaskRequestSchema } from '@clientry/shared/tasks';

import { PEOPLE } from './data/people.js';
import type { DemoDealRow, DemoTaskRow, DemoWorkspace } from './demo-rows.js';
import { buildDemoWorkspace } from './demo-workspace.js';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

const NOWS = [
  ['an ordinary day', new Date('2026-10-18T09:41:27.512Z')],
  ['the first day of a month', new Date('2026-11-01T00:20:00.000Z')],
  ["New Year's Eve", new Date('2026-12-31T23:50:00.000Z')],
] as const;

function uuidTime(id: string): number {
  return Number.parseInt(id.replace('-', '').slice(0, 12), 16);
}

describe.each(NOWS)('buildDemoWorkspace on %s', (_case, now) => {
  const demo: DemoWorkspace = buildDemoWorkspace(now);
  const stageKind = new Map(demo.stages.map(({ id, kind }) => [id, kind]));
  const stageName = new Map(demo.stages.map(({ id, name }) => [id, name]));
  const ann = PEOPLE.ann.id;
  const max = PEOPLE.max.id;

  function isOpen(deal: DemoDealRow): boolean {
    return stageKind.get(deal.stageId) === 'open';
  }

  function hoursUntil(time: Date): number {
    return (time.getTime() - now.getTime()) / HOUR_MS;
  }

  function openTasksOf(userId: string): DemoTaskRow[] {
    return demo.tasks.filter((task) => task.assigneeId === userId && task.doneAt === null);
  }

  function dealActivities(dealId: string): DemoWorkspace['activities'] {
    return demo.activities.filter((activity) => activity.dealId === dealId);
  }

  describe('people and stages', () => {
    it('should hold five members with one owner when the demo is built', () => {
      expect(demo.users).toHaveLength(5);
      expect(demo.memberships.map(({ role }) => role).toSorted()).toEqual([
        'manager',
        'manager',
        'manager',
        'manager',
        'owner',
      ]);
    });

    it('should make Max the earliest-joined manager when join dates are built', () => {
      const managers = demo.memberships
        .filter(({ role }) => role === 'manager')
        .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

      expect(managers[0]?.userId).toBe(max);
    });

    it('should date every join at least 30 days before the oldest record when the demo is built', () => {
      const records = [...demo.clients, ...demo.deals, ...demo.tasks, ...demo.activities];
      const oldest = Math.min(...records.map(({ createdAt }) => createdAt.getTime()));

      for (const { createdAt } of demo.memberships) {
        expect(createdAt.getTime()).toBeLessThanOrEqual(oldest - 30 * DAY_MS);
      }
    });

    it('should use the default stages in order when the stages are built', () => {
      expect(demo.stages.map(({ name, position, kind }) => [name, position, kind])).toEqual([
        ['New', 0, 'open'],
        ['Call', 1, 'open'],
        ['Proposal sent', 2, 'open'],
        ['Contract', 3, 'open'],
        ['Paid', 4, 'won'],
        ['Lost', 5, 'lost'],
      ]);
    });
  });

  describe('counts', () => {
    it('should build 40 clients from all five people with every source when the demo is built', () => {
      expect(demo.clients).toHaveLength(40);
      expect(new Set(demo.clients.map(({ createdById }) => createdById)).size).toBe(5);
      expect(new Set(demo.clients.map(({ source }) => source))).toEqual(
        new Set(['website', 'telegram', 'referral', 'other', null]),
      );
    });

    it('should spread clients over the last 200 days with up to three tags when the demo is built', () => {
      for (const client of demo.clients) {
        expect(now.getTime() - client.createdAt.getTime()).toBeLessThanOrEqual(200 * DAY_MS);
        expect(client.tags.length).toBeLessThanOrEqual(3);
      }
      expect(demo.clients.filter(({ notes }) => notes !== null).length).toBeGreaterThanOrEqual(12);
    });

    it('should put 5, 5, 4 and 4 open deals in the open stages when the demo is built', () => {
      const open = demo.deals.filter(isOpen).map(({ stageId }) => stageName.get(stageId));

      expect(open.filter((name) => name === 'New')).toHaveLength(5);
      expect(open.filter((name) => name === 'Call')).toHaveLength(5);
      expect(open.filter((name) => name === 'Proposal sent')).toHaveLength(4);
      expect(open.filter((name) => name === 'Contract')).toHaveLength(4);
    });

    it('should close 19 won and 8 lost deals within 180 days when the demo is built', () => {
      const won = demo.deals.filter(({ stageId }) => stageKind.get(stageId) === 'won');
      const lost = demo.deals.filter(({ stageId }) => stageKind.get(stageId) === 'lost');

      expect(won).toHaveLength(19);
      expect(lost).toHaveLength(8);
      for (const { closedAt } of [...won, ...lost]) {
        expect(now.getTime() - (closedAt?.getTime() ?? 0)).toBeLessThanOrEqual(180 * DAY_MS);
      }
    });

    it('should hold 6 EUR deals, 3 of them won, and amounts from 800 to 15,000 when built', () => {
      const eur = demo.deals.filter(({ currency }) => currency === 'EUR');

      expect(demo.deals).toHaveLength(45);
      expect(eur).toHaveLength(6);
      expect(eur.filter(({ stageId }) => stageKind.get(stageId) === 'won')).toHaveLength(3);
      expect(Math.min(...demo.deals.map(({ amount }) => amount))).toBe(800_00);
      expect(Math.max(...demo.deals.map(({ amount }) => amount))).toBe(15_000_00);
    });

    it('should include the Romashka landing page at $1,500 when the deals are built', () => {
      expect(demo.deals).toContainEqual(
        expect.objectContaining({
          title: 'Landing page for Romashka',
          amount: 1500_00,
          currency: 'USD',
        }),
      );
    });

    it('should build 36 tasks, 20 open, about two thirds linked when the demo is built', () => {
      const linked = demo.tasks.filter(({ clientId, dealId }) => clientId ?? dealId);

      expect(demo.tasks).toHaveLength(36);
      expect(demo.tasks.filter(({ doneAt }) => doneAt === null)).toHaveLength(20);
      expect(linked.length).toBeGreaterThanOrEqual(22);
      expect(linked.length).toBeLessThanOrEqual(26);
    });

    it('should give Ann 2 overdue tasks, 2 due within 8 hours and 4 within 7 days when built', () => {
      const due = openTasksOf(ann).map(({ dueAt }) => hoursUntil(dueAt));

      expect(due).toHaveLength(8);
      expect(due.filter((hours) => hours < 0)).toHaveLength(2);
      expect(due.filter((hours) => hours > 0 && hours <= 8)).toHaveLength(2);
      expect(due.filter((hours) => hours > 8 && hours <= 7 * 24)).toHaveLength(4);
    });

    it('should give Max 1 overdue task, 1 due within 8 hours and 3 within 7 days when built', () => {
      const due = openTasksOf(max).map(({ dueAt }) => hoursUntil(dueAt));

      expect(due).toHaveLength(5);
      expect(due.filter((hours) => hours < 0)).toHaveLength(1);
      expect(due.filter((hours) => hours > 0 && hours <= 8)).toHaveLength(1);
      expect(due.filter((hours) => hours > 8 && hours <= 7 * 24)).toHaveLength(3);
    });

    it('should hold one activity per event of the histories, about 230, when the demo is built', () => {
      const moves = demo.deals.reduce((sum, { version }) => sum + version - 1, 0);
      const done = demo.tasks.filter(({ doneAt }) => doneAt !== null).length;

      expect(demo.activities).toHaveLength(40 + 45 + moves + 36 + done);
      expect(demo.activities.length).toBeGreaterThanOrEqual(220);
      expect(demo.activities.length).toBeLessThanOrEqual(250);
    });
  });

  describe('reminders and notifications', () => {
    function futureReminders(userId: string): number[] {
      return demo.tasks
        .filter((task) => task.assigneeId === userId && task.reminderSentAt === null)
        .flatMap(({ remindAt }) => (remindAt ? [hoursUntil(remindAt)] : []));
    }

    it('should set 13 reminders, all on tasks of Ann and Max, when the demo is built', () => {
      const reminded = demo.tasks.filter(({ remindAt }) => remindAt !== null);

      expect(reminded).toHaveLength(13);
      expect(new Set(reminded.map(({ assigneeId }) => assigneeId))).toEqual(new Set([ann, max]));
    });

    it.each([
      ['Ann', 'ann', 4],
      ['Max', 'max', 2],
    ] as const)(
      "should put %s's future reminders ahead with the first within 3 hours when built",
      (_name, key, count) => {
        const hours = futureReminders(PEOPLE[key].id);

        expect(hours).toHaveLength(count);
        expect(Math.min(...hours)).toBeGreaterThan(0);
        expect(Math.min(...hours)).toBeLessThanOrEqual(3);
      },
    );

    it.each([
      ['Ann', 'ann', 5, 2],
      ['Max', 'max', 2, 1],
    ] as const)(
      'should give %s %i sent reminders with notifications, %i unread, when built',
      (_name, key, sent, unread) => {
        const notifications = demo.notifications.filter(({ userId }) => userId === PEOPLE[key].id);

        expect(notifications).toHaveLength(sent);
        expect(notifications.filter(({ readAt }) => readAt === null)).toHaveLength(unread);
      },
    );

    it('should pair each sent reminder with one notification at that moment when built', () => {
      for (const task of demo.tasks) {
        const notifications = demo.notifications.filter(({ taskId }) => taskId === task.id);
        if (task.reminderSentAt === null) {
          expect(notifications).toEqual([]);
          continue;
        }
        expect(task.reminderSentAt).toEqual(task.remindAt);
        expect(notifications).toHaveLength(1);
        expect(notifications[0]?.createdAt).toEqual(task.reminderSentAt);
        expect(notifications[0]?.userId).toBe(task.assigneeId);
      }
    });

    it('should leave every future reminder unsent when the demo is built', () => {
      const future = demo.tasks.filter(({ remindAt }) => remindAt !== null && remindAt > now);

      expect(future).toHaveLength(6);
      expect(future.every(({ reminderSentAt }) => reminderSentAt === null)).toBe(true);
    });
  });

  describe('time', () => {
    it('should put nothing that happened after now when the demo is built', () => {
      const happened = [
        ...demo.users.map(({ createdAt }) => createdAt),
        ...demo.memberships.map(({ createdAt }) => createdAt),
        ...demo.stages.flatMap(({ createdAt, updatedAt }) => [createdAt, updatedAt]),
        ...demo.clients.flatMap(({ createdAt, updatedAt }) => [createdAt, updatedAt]),
        ...demo.deals.flatMap(({ createdAt, updatedAt, closedAt }) => [
          createdAt,
          updatedAt,
          closedAt,
        ]),
        ...demo.tasks.flatMap(({ createdAt, updatedAt, doneAt, reminderSentAt }) => [
          createdAt,
          updatedAt,
          doneAt,
          reminderSentAt,
        ]),
        ...demo.activities.map(({ createdAt }) => createdAt),
        ...demo.notifications.flatMap(({ createdAt, readAt }) => [createdAt, readAt]),
      ].flatMap((time) => (time === null ? [] : [time.getTime()]));

      expect(Math.max(...happened)).toBeLessThanOrEqual(now.getTime());
    });

    it('should hold at least two won deals in each of the last six 30-day spans when built', () => {
      const closed = demo.deals
        .filter(({ stageId }) => stageKind.get(stageId) === 'won')
        .map(({ closedAt }) => now.getTime() - (closedAt?.getTime() ?? 0));

      const counts = Array.from(
        { length: 6 },
        (_, span) =>
          closed.filter((age) => age >= span * 30 * DAY_MS && age < (span + 1) * 30 * DAY_MS)
            .length,
      );

      expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
    });

    it('should build ids as UUIDv7 holding each record row created_at when the demo is built', () => {
      const rows = [
        ...demo.memberships,
        ...demo.stages,
        ...demo.clients,
        ...demo.deals,
        ...demo.tasks,
        ...demo.activities,
        ...demo.notifications,
      ];

      for (const { id, createdAt } of rows) {
        expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
        expect(uuidTime(id)).toBe(createdAt.getTime());
      }
    });
  });

  describe('payloads and request shapes', () => {
    it('should parse every activity and notification payload when the demo is built', () => {
      for (const { type, payload } of demo.activities) {
        expect(activityEventSchema.safeParse({ type, payload }).success).toBe(true);
      }
      for (const { type, payload } of demo.notifications) {
        expect(notificationEventSchema.safeParse({ type, payload }).success).toBe(true);
      }
    });

    it('should pass the create request schema for every client when the demo is built', () => {
      for (const { name, company, email, phone, source, notes, tags } of demo.clients) {
        const request = { name, company, email, phone, source, notes, tags };

        expect(createClientRequestSchema.safeParse(request).error).toBeUndefined();
      }
    });

    it('should pass the create request schema for every deal when the demo is built', () => {
      for (const { title, clientId, stageId, amount, currency, assigneeId } of demo.deals) {
        const request = { title, clientId, stageId, amount, currency, assigneeId };

        expect(createDealRequestSchema.safeParse(request).error).toBeUndefined();
      }
    });

    it('should pass the create request schema for every task when the demo is built', () => {
      for (const task of demo.tasks) {
        const related =
          task.clientId === null
            ? task.dealId === null
              ? null
              : { kind: 'deal', id: task.dealId }
            : { kind: 'client', id: task.clientId };
        const request = {
          title: task.title,
          dueAt: task.dueAt.toISOString(),
          remindAt: task.remindAt?.toISOString() ?? null,
          assigneeId: task.assigneeId,
          related,
        };

        expect(createTaskRequestSchema.safeParse(request).error).toBeUndefined();
      }
    });
  });

  describe('deal histories', () => {
    it('should set closed_at exactly on won and lost deals, at their last move, when built', () => {
      for (const deal of demo.deals) {
        const lastMove = dealActivities(deal.id)
          .filter(({ type }) => type === 'deal_moved')
          .at(-1);

        if (isOpen(deal)) {
          expect(deal.closedAt).toBeNull();
        } else {
          expect(deal.closedAt).toEqual(lastMove?.createdAt);
        }
      }
    });

    it('should count 1 plus moves and updates in each version when the deals are built', () => {
      for (const deal of demo.deals) {
        const events = dealActivities(deal.id);

        expect(events[0]?.type).toBe('deal_created');
        expect(deal.version).toBe(events.length);
        expect(deal.updatedAt).toEqual(events.at(-1)?.createdAt);
      }
    });

    it('should hold four updates of an amount or an assignee when the deals are built', () => {
      const updates = demo.activities.filter(({ type }) => type === 'deal_updated');

      expect(updates).toHaveLength(4);
    });

    it('should start each deal in New after its client when the deals are built', () => {
      const clients = new Map(demo.clients.map((client) => [client.id, client]));

      for (const deal of demo.deals) {
        const [created] = dealActivities(deal.id);

        expect(created?.payload).toMatchObject({ stage: { name: 'New' } });
        expect(deal.createdAt.getTime()).toBeGreaterThan(
          clients.get(deal.clientId)?.createdAt.getTime() ?? Infinity,
        );
      }
    });

    it('should ascend positions within each stage in story order when the deals are built', () => {
      for (const stage of demo.stages) {
        const positions = demo.deals
          .filter(({ stageId }) => stageId === stage.id)
          .map(({ position }) => position);

        expect(positions).toEqual(positions.toSorted());
        expect(new Set(positions).size).toBe(positions.length);
      }
    });

    it('should give every member open deals and open tasks when the demo is built', () => {
      for (const { id } of demo.users) {
        const openDeals = demo.deals.filter((deal) => isOpen(deal) && deal.assigneeId === id);

        expect(openDeals.length).toBeGreaterThan(0);
        expect(openTasksOf(id).length).toBeGreaterThan(0);
      }
    });

    it('should let Max create clients, deals and tasks when the demo is built', () => {
      for (const records of [demo.clients, demo.deals, demo.tasks]) {
        expect(records.some(({ createdById }) => createdById === max)).toBe(true);
        expect(records.some(({ createdById }) => createdById !== max)).toBe(true);
      }
    });
  });

  describe('task histories', () => {
    it('should link at most one of a client and a deal, after it, when the tasks are built', () => {
      const created = new Map(
        [...demo.clients, ...demo.deals].map(({ id, createdAt }) => [id, createdAt.getTime()]),
      );

      for (const task of demo.tasks) {
        expect(task.clientId === null || task.dealId === null).toBe(true);
        const link = task.clientId ?? task.dealId;
        if (link !== null) {
          expect(task.createdAt.getTime()).toBeGreaterThan(created.get(link) ?? Infinity);
        }
      }
    });

    it('should record task_created with the assignee and due time when the tasks are built', () => {
      for (const task of demo.tasks) {
        const created = demo.activities.find(
          ({ taskId, type }) => taskId === task.id && type === 'task_created',
        );

        expect(created?.createdAt).toEqual(task.createdAt);
        expect(created?.payload).toMatchObject({
          assignee: { id: task.assigneeId },
          dueAt: task.dueAt.toISOString(),
        });
      }
    });

    it('should record task_completed at done_at for done tasks only when built', () => {
      for (const task of demo.tasks) {
        const completed = demo.activities.filter(
          ({ taskId, type }) => taskId === task.id && type === 'task_completed',
        );

        expect(completed.map(({ createdAt }) => createdAt)).toEqual(
          task.doneAt === null ? [] : [task.doneAt],
        );
      }
    });
  });
});
