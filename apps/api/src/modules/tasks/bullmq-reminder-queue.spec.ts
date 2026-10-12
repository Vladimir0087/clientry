import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { BullmqReminderQueue, toReminderJob } from './bullmq-reminder-queue.js';
import type { PendingReminder } from './reminder-queue.js';

const NOW = new Date('2026-10-14T10:00:00.000Z');

const REMINDER: PendingReminder = {
  workspaceId: '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e',
  taskId: '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a',
  remindAt: '2026-10-14T10:15:00.000Z',
};

describe('BullmqReminderQueue', () => {
  let addBulk: Mock<Queue['addBulk']>;
  let reminderQueue: BullmqReminderQueue;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    addBulk = vi.fn<Queue['addBulk']>().mockResolvedValue([]);
    reminderQueue = new BullmqReminderQueue({ addBulk } as unknown as Queue);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should build the job id from the task and the reminder time in ms when a job is built', () => {
    expect(toReminderJob(REMINDER, NOW).opts.jobId).toBe(
      `reminder-${REMINDER.taskId}-${String(Date.parse(REMINDER.remindAt))}`,
    );
  });

  it('should delay the job until the reminder time when it lies ahead', () => {
    expect(toReminderJob(REMINDER, NOW).opts.delay).toBe(15 * 60_000);
  });

  it('should not delay the job when the reminder time has passed', () => {
    const late = { ...REMINDER, remindAt: '2026-10-14T09:00:00.000Z' };

    expect(toReminderJob(late, NOW).opts.delay).toBe(0);
  });

  it('should retry five times with backoff and keep no finished job when a job is built', () => {
    expect(toReminderJob(REMINDER, NOW)).toMatchObject({
      name: 'deliver-reminder',
      data: REMINDER,
      opts: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  });

  it('should add every reminder in one call when several are scheduled', async () => {
    const other = { ...REMINDER, taskId: '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5b' };

    await reminderQueue.schedule([REMINDER, other]);

    expect(addBulk).toHaveBeenCalledOnce();
    expect(addBulk.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('should not call Valkey when there is nothing to schedule', async () => {
    await reminderQueue.schedule([]);

    expect(addBulk).not.toHaveBeenCalled();
  });
});
