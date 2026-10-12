import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';

import { DELIVER_REMINDER_JOB, REMINDERS_QUEUE_TOKEN } from './reminder-jobs.js';
import type { PendingReminder, ReminderQueue } from './reminder-queue.js';

const ATTEMPTS = 5;
const BACKOFF_MS = 10_000;

export interface ReminderJob {
  readonly name: string;
  readonly data: PendingReminder;
  readonly opts: JobsOptions;
}

// BullMQ ignores an add whose id exists, and custom ids must not hold ":". A changed reminder gets a
// new id; its old job finds remind_at changed and does nothing.
export function reminderJobId({ taskId, remindAt }: PendingReminder): string {
  return `reminder-${taskId}-${String(Date.parse(remindAt))}`;
}

export function toReminderJob(reminder: PendingReminder, now: Date): ReminderJob {
  const { workspaceId, taskId, remindAt } = reminder;
  return {
    name: DELIVER_REMINDER_JOB,
    data: { workspaceId, taskId, remindAt },
    opts: {
      jobId: reminderJobId(reminder),
      delay: Math.max(0, Date.parse(remindAt) - now.getTime()),
      attempts: ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: true,
    },
  };
}

@Injectable()
export class BullmqReminderQueue implements ReminderQueue {
  constructor(@Inject(REMINDERS_QUEUE_TOKEN) private readonly queue: Queue) {}

  async schedule(reminders: readonly PendingReminder[]): Promise<void> {
    if (reminders.length === 0) {
      return;
    }
    const now = new Date();
    await this.queue.addBulk(reminders.map((reminder) => toReminderJob(reminder, now)));
  }
}
