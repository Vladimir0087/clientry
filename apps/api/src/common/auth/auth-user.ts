import type { Request } from 'express';

import type { MemberRole } from '@clientry/shared/auth';

export interface AuthUser {
  readonly id: string;
  readonly workspaceId: string;
  readonly role: MemberRole;
  readonly isDemo: boolean;
}

// A WeakMap rather than a request property: no global Express type augmentation is needed.
const authUsers = new WeakMap<Request, AuthUser>();

export function setAuthUser(request: Request, user: AuthUser): void {
  authUsers.set(request, Object.freeze({ ...user }));
}

export function getAuthUser(request: Request): AuthUser | undefined {
  return authUsers.get(request);
}
