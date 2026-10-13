import { hasPermission } from '@clientry/shared/auth';
import type { MemberRole, Permission } from '@clientry/shared/auth';

import { InsufficientRoleError } from '../auth/errors.js';

// The guard read the role before the workspace lock; this is the re-read inside it, so an owner
// demoted or removed while the request waited cannot act with the old role.
export function assertCallerPermission(role: MemberRole | null, permission: Permission): void {
  if (role === null || !hasPermission(role, permission)) {
    throw new InsufficientRoleError();
  }
}
