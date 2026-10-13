import { describe, expect, it } from 'vitest';

import { canDeleteRecord, hasPermission, PERMISSIONS } from './permissions.js';
import type { Permission } from './permissions.js';

const ANN = '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
const MAX = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';

const ALL_PERMISSIONS: readonly Permission[] = [
  'team.manage',
  'workspace.manage',
  'stages.manage',
  'records.delete_any',
];

describe('PERMISSIONS', () => {
  it('should grant every permission to owners and none to managers when the table is read', () => {
    expect(PERMISSIONS).toEqual({
      'team.manage': { owner: true, manager: false },
      'workspace.manage': { owner: true, manager: false },
      'stages.manage': { owner: true, manager: false },
      'records.delete_any': { owner: true, manager: false },
    });
  });
});

describe('hasPermission', () => {
  it.each(ALL_PERMISSIONS)('should grant %s when the role is owner', (permission) => {
    expect(hasPermission('owner', permission)).toBe(true);
  });

  it.each(ALL_PERMISSIONS)('should deny %s when the role is manager', (permission) => {
    expect(hasPermission('manager', permission)).toBe(false);
  });
});

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
