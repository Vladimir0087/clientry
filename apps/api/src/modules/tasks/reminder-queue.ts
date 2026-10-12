// The job data too: delivery reads the task by both ids, since it runs outside a request.
export interface PendingReminder {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly remindAt: string;
}

export abstract class ReminderQueue {
  // One add for all of them; a reminder whose job is already queued is ignored.
  abstract schedule(reminders: readonly PendingReminder[]): Promise<void>;
}
