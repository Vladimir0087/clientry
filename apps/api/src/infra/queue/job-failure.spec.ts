import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { describeJobFailure } from './job-failure.js';

const TASK_ID = '0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a';
const WORKSPACE_ID = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';

function failedJob(attemptsMade: number, attempts: number): Job {
  return {
    name: 'deliver-reminder',
    attemptsMade,
    opts: { attempts },
    data: { taskId: TASK_ID, workspaceId: WORKSPACE_ID, remindAt: '2026-10-15T06:00:00.000Z' },
  } as unknown as Job;
}

describe('describeJobFailure', () => {
  it('should be final when the last attempt failed', () => {
    const failure = describeJobFailure('reminders', failedJob(5, 5), new Error('Timed out'));

    expect(failure.isFinal).toBe(true);
  });

  it('should not be final when attempts remain', () => {
    const failure = describeJobFailure('reminders', failedJob(2, 5), new Error('Timed out'));

    expect(failure.isFinal).toBe(false);
  });

  it('should be final when the error is unrecoverable whatever attempts remain', () => {
    const error = new UnrecoverableError('Reminder job data does not parse');

    const failure = describeJobFailure('reminders', failedJob(1, 5), error);

    expect(failure.isFinal).toBe(true);
  });

  it('should be final when the job has no retries', () => {
    const failure = describeJobFailure('reminders', failedJob(1, 0), new Error('Timed out'));

    expect(failure.isFinal).toBe(true);
  });

  it('should be final when the failed job is missing', () => {
    const failure = describeJobFailure('reminders', undefined, new Error('Missing lock'));

    expect(failure.isFinal).toBe(true);
  });

  it('should carry the ids and leave out the rest of the job data when it describes a failure', () => {
    const error = new Error('Timed out');

    const { context } = describeJobFailure('reminders', failedJob(2, 5), error);

    expect(context).toEqual({
      err: error,
      queue: 'reminders',
      job: 'deliver-reminder',
      attemptsMade: 2,
      taskId: TASK_ID,
      workspaceId: WORKSPACE_ID,
    });
  });
});
