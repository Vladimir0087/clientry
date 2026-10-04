import { Controller, Get, HttpStatus } from '@nestjs/common';
import { z } from 'zod';

import { memberRoleSchema } from '@clientry/shared/auth';

import type { AuthUser } from '../../src/common/auth/auth-user.js';
import { CurrentUser } from '../../src/common/auth/current-user.decorator.js';
import { Roles } from '../../src/common/auth/roles.decorator.js';
import { ResponseSchema } from '../../src/common/http/response-schema.decorator.js';

const authUserSchema = z.object({ id: z.uuid(), workspaceId: z.uuid(), role: memberRoleSchema });

// No @Public(): these routes check that the guards deny by default and enforce roles.
@Controller('test/protected')
export class ProtectedTestController {
  @Get()
  @ResponseSchema(HttpStatus.OK, authUserSchema)
  getCurrentUser(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Get('owner')
  @Roles('owner')
  @ResponseSchema(HttpStatus.OK, authUserSchema)
  getForOwner(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
