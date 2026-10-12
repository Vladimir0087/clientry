import { stdSerializers } from 'pino';

// ioredis puts the failed command's arguments on its errors; for a queue add they hold job data.
// pino-http hands over errors already serialized, so both forms are cleaned.
export function serializeError(error: unknown): unknown {
  const serialized: unknown = error instanceof Error ? stdSerializers.err(error) : error;
  if (typeof serialized !== 'object' || serialized === null || !('command' in serialized)) {
    return serialized;
  }
  const cleaned: Record<string, unknown> = { ...serialized };
  delete cleaned.command;
  return cleaned;
}
