import type { MemberRole } from './member-role.js';

// The role table: the API guard and the web both read it, so they cannot drift apart.
export const PERMISSIONS = {
  'team.manage': { owner: true, manager: false },
  'workspace.manage': { owner: true, manager: false },
  'stages.manage': { owner: true, manager: false },
  'records.delete_any': { owner: true, manager: false },
} as const satisfies Readonly<Record<string, Readonly<Record<MemberRole, boolean>>>>;

export type Permission = keyof typeof PERMISSIONS;

// Off for every role in the shared demo: with them a visitor could take the workspace over.
export const DEMO_LOCKED_PERMISSIONS: readonly Permission[] = Object.freeze([
  'team.manage',
  'workspace.manage',
]);

export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return PERMISSIONS[permission][role];
}

export interface PermissionActor {
  readonly role: MemberRole;
  readonly isDemo: boolean;
}

export function can({ role, isDemo }: PermissionActor, permission: Permission): boolean {
  return (
    hasPermission(role, permission) && !(isDemo && DEMO_LOCKED_PERMISSIONS.includes(permission))
  );
}

export interface RecordActor {
  readonly userId: string;
  readonly role: MemberRole;
}

export function canDeleteRecord(actor: RecordActor, createdById: string): boolean {
  return hasPermission(actor.role, 'records.delete_any') || actor.userId === createdById;
}
