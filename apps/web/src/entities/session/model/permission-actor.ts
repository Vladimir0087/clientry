import type { PermissionActor, SessionResponse } from '@clientry/shared/auth';

// What the role table and the demo lock read from a session.
export function permissionActor(session: SessionResponse): PermissionActor {
  return { role: session.role, isDemo: session.workspace.isDemo };
}
