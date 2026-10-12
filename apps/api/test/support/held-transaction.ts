import { expect, onTestFinished } from 'vitest';

import type { Prisma } from '../../src/infra/prisma/generated/client.js';
import type { PrismaService } from '../../src/infra/prisma/prisma.service.js';

export interface HeldTransaction {
  commit(): Promise<void>;
}

interface WaiterCount {
  readonly count: number;
}

// Under a full parallel run a blocked request can take longer than the 1 s default to show up.
const WAITER_TIMEOUT_MS = 5000;

// The work's row locks stay held until commit, so a test can run a request against them.
export async function holdTransaction(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<HeldTransaction> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markHeld: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const done = prisma.$transaction(
    async (tx) => {
      await work(tx);
      markHeld();
      await released;
    },
    { timeout: 20_000 },
  );
  // A test that fails before its commit would leave the locks to block the next test's reset.
  onTestFinished(async () => {
    release();
    await Promise.allSettled([done]);
  });
  await Promise.race([held, done]);
  return {
    commit: async () => {
      release();
      await done;
    },
  };
}

export async function waitForLockWaiter(prisma: PrismaService): Promise<void> {
  await expect
    .poll(
      async () => {
        const [row] = await prisma.$queryRaw<WaiterCount[]>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        return row?.count ?? 0;
      },
      { timeout: WAITER_TIMEOUT_MS },
    )
    .toBe(1);
}
