import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

import type { Permission } from '@clientry/shared/auth';

export const PERMISSION_KEY = 'auth:permission';

// Lets the OpenAPI test find every restricted operation; the 403 response is declared beside it.
export const PERMISSION_OPERATION_EXTENSION = 'x-permission';

// Who holds the permission is the matrix's call, so moving it between roles touches no route.
export function RequirePermission(permission: Permission): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(PERMISSION_KEY, permission),
    ApiExtension(PERMISSION_OPERATION_EXTENSION, permission),
  );
}
