import { SetMetadata } from '@nestjs/common';

import type { MemberRole } from '@clientry/shared/auth';

export const ROLES_KEY = 'auth:roles';

export function Roles(...roles: readonly MemberRole[]): MethodDecorator & ClassDecorator {
  return SetMetadata(ROLES_KEY, roles);
}
