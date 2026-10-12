import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';

export interface JobFailure {
  readonly isFinal: boolean;
  readonly context: Readonly<Record<string, unknown>>;
}

// Ids only: job data may also hold times, which log lines never carry.
function jobIds(job: Job | undefined): Record<string, string> {
  const data: unknown = job?.data;
  if (typeof data !== 'object' || data === null) {
    return {};
  }
  const ids = ['taskId', 'workspaceId'].map((key) => [key, Reflect.get(data, key)] as const);
  return Object.fromEntries(ids.filter(([, value]) => typeof value === 'string'));
}

export function describeJobFailure(queue: string, job: Job | undefined, error: Error): JobFailure {
  const isFinal =
    job === undefined ||
    error instanceof UnrecoverableError ||
    job.attemptsMade >= (job.opts.attempts ?? 0);
  return {
    isFinal,
    context: { err: error, queue, job: job?.name, attemptsMade: job?.attemptsMade, ...jobIds(job) },
  };
}
