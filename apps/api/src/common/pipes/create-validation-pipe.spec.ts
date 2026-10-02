import { describe, expect, it } from 'vitest';

import { toFieldErrors } from './create-validation-pipe.js';

describe('toFieldErrors', () => {
  it('should use an empty path when the issue is about the root', () => {
    const errors = toFieldErrors([{ message: 'Expected object' }]);

    expect(errors).toEqual([{ path: '', message: 'Expected object' }]);
  });

  it('should join keys and indexes with dots when the issue is nested', () => {
    const errors = toFieldErrors([{ message: 'Required', path: ['items', 0, 'name'] }]);

    expect(errors).toEqual([{ path: 'items.0.name', message: 'Required' }]);
  });

  it('should read the key when a path segment is an object', () => {
    const errors = toFieldErrors([
      { message: 'Invalid email', path: [{ key: 'contact' }, 'email'] },
    ]);

    expect(errors).toEqual([{ path: 'contact.email', message: 'Invalid email' }]);
  });

  it('should keep one entry per issue when several fields fail', () => {
    const errors = toFieldErrors([
      { message: 'Too short', path: ['name'] },
      { message: 'Invalid email', path: ['email'] },
    ]);

    expect(errors.map(({ path }) => path)).toEqual(['name', 'email']);
  });
});
