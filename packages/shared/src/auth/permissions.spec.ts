import { describe, expect, it } from 'vitest';

import { canDeleteRecord } from './permissions.js';

const ANN = '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
const MAX = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';

describe('canDeleteRecord', () => {
  it('should allow the owner when the record was created by someone else', () => {
    expect(canDeleteRecord({ userId: ANN, role: 'owner' }, MAX)).toBe(true);
  });

  it('should allow a manager when they created the record', () => {
    expect(canDeleteRecord({ userId: MAX, role: 'manager' }, MAX)).toBe(true);
  });

  it('should deny a manager when someone else created the record', () => {
    expect(canDeleteRecord({ userId: MAX, role: 'manager' }, ANN)).toBe(false);
  });
});
