import { onTestFinished } from 'vitest';

import type { PrismaService } from '../../src/infra/prisma/prisma.service.js';

// Collects the SQL of every Prisma query until the test ends; Prisma cannot remove a listener.
export function recordStatements(prisma: PrismaService): string[] {
  const statements: string[] = [];
  let isRecording = true;
  onTestFinished(() => {
    isRecording = false;
  });
  prisma.$on('query', (event) => {
    if (isRecording) {
      statements.push(event.query);
    }
  });
  return statements;
}
