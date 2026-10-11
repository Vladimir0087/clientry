import { describe, expect, it } from 'vitest';

import { idSchema } from './id.js';

const ID = '0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c';

describe('idSchema', () => {
  it('should lowercase the id when it is sent in uppercase', () => {
    expect(idSchema().parse(ID.toUpperCase())).toBe(ID);
  });

  it('should reject the value with the given message when it is not a UUID', () => {
    const result = idSchema('Choose a client').safeParse('romashka');

    expect(result.error?.issues[0]?.message).toBe('Choose a client');
  });
});
