import type { PrismaService } from '../src/infra/prisma/prisma.service.js';

interface TableRow {
  readonly name: string;
}

// Tables come from the catalog, so a new migration never needs this list updated.
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT tablename AS name FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) {
    return;
  }
  const list = tables.map(({ name }) => `"${name}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
