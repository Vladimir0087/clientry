import { describe, expect, it } from 'vitest';

import {
  can,
  canDeleteRecord,
  DEMO_LOCKED_PERMISSIONS,
  hasPermission,
  PERMISSIONS,
} from './permissions.js';
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

describe('DEMO_LOCKED_PERMISSIONS', () => {
  it('should hold exactly the team and workspace permissions when the list is read', () => {
    expect([...DEMO_LOCKED_PERMISSIONS].toSorted()).toEqual(['team.manage', 'workspace.manage']);
  });
});

describe('can', () => {
  const UNLOCKED: readonly Permission[] = ['stages.manage', 'records.delete_any'];

  it.each(ALL_PERMISSIONS)('should grant %s when an owner is outside the demo', (permission) => {
    expect(can({ role: 'owner', isDemo: false }, permission)).toBe(true);
  });

  it.each(ALL_PERMISSIONS)('should deny %s when a manager is outside the demo', (permission) => {
    expect(can({ role: 'manager', isDemo: false }, permission)).toBe(false);
  });

  it.each(UNLOCKED)('should grant %s when an owner is in the demo', (permission) => {
    expect(can({ role: 'owner', isDemo: true }, permission)).toBe(true);
  });

  it.each(DEMO_LOCKED_PERMISSIONS)('should deny %s when an owner is in the demo', (permission) => {
    expect(can({ role: 'owner', isDemo: true }, permission)).toBe(false);
  });

  it.each(ALL_PERMISSIONS)('should deny %s when a manager is in the demo', (permission) => {
    expect(can({ role: 'manager', isDemo: true }, permission)).toBe(false);
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
