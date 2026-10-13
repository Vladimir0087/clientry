import { Controller, Get, HttpStatus } from '@nestjs/common';
import { z } from 'zod';

import { memberRoleSchema } from '@clientry/shared/auth';

import type { AuthUser } from '../../src/common/auth/auth-user.js';
import { CurrentUser } from '../../src/common/auth/current-user.decorator.js';
import { RequirePermission } from '../../src/common/auth/require-permission.decorator.js';
import { ApiErrorResponse } from '../../src/common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../src/common/http/response-schema.decorator.js';
import { InsufficientRoleError } from '../../src/modules/auth/errors.js';

const authUserSchema = z.object({ id: z.uuid(), workspaceId: z.uuid(), role: memberRoleSchema });

// No @Public(): these routes check that the guards deny by default and enforce permissions.
@Controller('test/protected')
export class ProtectedTestController {
  @Get()
  @ResponseSchema(HttpStatus.OK, authUserSchema)
  getCurrentUser(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Get('owner')
  @RequirePermission('workspace.manage')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, '/api/test/protected/owner', new InsufficientRoleError())
  @ResponseSchema(HttpStatus.OK, authUserSchema)
  getForOwner(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
