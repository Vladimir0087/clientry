import { describe, expect, it } from 'vitest';

import { createPoolOptions } from './pool-options.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';

describe('createPoolOptions', () => {
  it('should set every timeout when built from the config', () => {
    const options = createPoolOptions(createUnitConfig());

    expect(options).toMatchObject({
      connectionTimeoutMillis: 5000,
      statement_timeout: 10_000,
      query_timeout: 15_000,
      idleTimeoutMillis: 10_000,
    });
  });

  it('should start every session in UTC when built', () => {
    const options = createPoolOptions(createUnitConfig());

    expect(options.options).toBe('-c TimeZone=UTC');
  });

  it('should take the connection string from the config when built', () => {
    const databaseUrl = 'postgresql://clientry:clientry@db.example:5432/clientry';

    const options = createPoolOptions(createUnitConfig({ DATABASE_URL: databaseUrl }));

    expect(options.connectionString).toBe(databaseUrl);
  });
});
