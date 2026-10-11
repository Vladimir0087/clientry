import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { memberListResponseSchema } from '@clientry/shared/workspaces';
import type { MemberListResponse } from '@clientry/shared/workspaces';

import { MembersService } from './members.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ApiErrorResponse } from '../../common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError } from '../auth/errors.js';

@ApiTags('members')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, '/api/members', new AuthenticationRequiredError())
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'Members of the workspace in join order' })
  @ResponseSchema(HttpStatus.OK, memberListResponseSchema)
  list(@CurrentUser() user: AuthUser): Promise<MemberListResponse> {
    return this.members.list(user);
  }
}
