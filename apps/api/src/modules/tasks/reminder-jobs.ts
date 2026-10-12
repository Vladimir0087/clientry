import { z } from 'zod';

export const REMINDERS_QUEUE = 'reminders';
// The injection token of the one bullmq Queue the producer and the clock share.
export const REMINDERS_QUEUE_TOKEN = Symbol('RemindersQueue');
export const DELIVER_REMINDER_JOB = 'deliver-reminder';
export const SWEEP_REMINDERS_JOB = 'sweep-reminders';

export const reminderJobDataSchema = z.object({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
  remindAt: z.iso.datetime(),
});
