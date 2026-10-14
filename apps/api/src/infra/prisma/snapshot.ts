import { Prisma } from './generated/client.js';
import type { PrismaService } from './prisma.service.js';

// Every statement of the work reads the same snapshot, so numbers read one after another agree.
export function inSnapshot<T>(
  db: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
