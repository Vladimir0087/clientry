import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

const ROOT_ENV_FILE = new URL('../../.env', import.meta.url);

// Variables already set in the process win over the file; CI has no file at all.
if (existsSync(ROOT_ENV_FILE)) {
  process.loadEnvFile(ROOT_ENV_FILE);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Not env(): it throws when the variable is missing, and generate needs no database.
  datasource: { url: process.env.DATABASE_URL },
});
