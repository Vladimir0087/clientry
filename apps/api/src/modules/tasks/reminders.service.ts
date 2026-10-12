import { Injectable, Logger } from '@nestjs/common';

import type { Task } from '@clientry/shared/tasks';

import { ReminderQueue } from './reminder-queue.js';
import type { PendingReminder } from './reminder-queue.js';
import { isTooLate, reminderWindow } from './reminder-window.js';
import { RemindersRepository } from './reminders.repository.js';
import type { RemindersTransaction } from './reminders.repository.js';

export type SkipReason = 'not_found' | 'done' | 'changed' | 'sent' | 'too_late' | 'not_member';

export type DeliveryOutcome =
  | { readonly isDelivered: true; readonly userId: string }
  | { readonly isDelivered: false; readonly reason: SkipReason };

function skip(reason: SkipReason): DeliveryOutcome {
  return { isDelivered: false, reason };
}

// The job's reminder must still be the task's pending one; times compare in milliseconds.
function skipReason(task: Task, job: PendingReminder, now: Date): SkipReason | null {
  if (task.doneAt !== null) {
    return 'done';
  }
  if (task.remindAt === null || Date.parse(task.remindAt) !== Date.parse(job.remindAt)) {
    return 'changed';
  }
  if (task.reminderSentAt !== null) {
    return 'sent';
  }
  return isTooLate(task.remindAt, now) ? 'too_late' : null;
}

async function deliverLocked(
  reminders: RemindersTransaction,
  job: PendingReminder,
  now: Date,
): Promise<DeliveryOutcome> {
  const { workspaceId, taskId } = job;
  const task = await reminders.findTask(workspaceId, taskId);
  if (!task) {
    return skip('not_found');
  }
  const reason = skipReason(task, job, now);
  if (reason !== null) {
    return skip(reason);
  }
  // The assignee at delivery, not when the job was queued.
  const userId = task.assignee.id;
  if (!(await reminders.isMember(workspaceId, userId))) {
    return skip('not_member');
  }
  await reminders.markSent(workspaceId, taskId, now);
  await reminders.insertNotification({
    workspaceId,
    userId,
    taskId,
    event: {
      type: 'task_reminder',
      payload: { task: { id: task.id, title: task.title }, dueAt: task.dueAt },
    },
  });
  return { isDelivered: true, userId };
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly reminders: RemindersRepository,
    private readonly queue: ReminderQueue,
  ) {}

  // Exactly once: the task row stays locked from the check to the write, so a second run of the
  // job, or a second job for the reminder, finds it sent. A skip writes nothing.
  async deliver(job: PendingReminder): Promise<DeliveryOutcome> {
    const { workspaceId, taskId } = job;
    const now = new Date();
    const outcome = await this.reminders.inTransaction((reminders) =>
      deliverLocked(reminders, job, now),
    );
    if (outcome.isDelivered) {
      this.logger.log({ taskId, workspaceId, userId: outcome.userId }, 'Reminder delivered');
    } else {
      this.logger.log({ taskId, workspaceId, reason: outcome.reason }, 'Reminder skipped');
    }
    return outcome;
  }

  // Queues every pending reminder; ones already queued are ignored by their job ids.
  async sweep(): Promise<number> {
    const pending = await this.reminders.findPending(reminderWindow(new Date()));
    await this.queue.schedule(pending);
    this.logger.log({ count: pending.length }, 'Reminder sweep done');
    return pending.length;
  }
}
