import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  memberIdParamsSchema,
  memberListResponseSchema,
  memberSchema,
  removeMemberQuerySchema,
  TRANSFER_TO_MESSAGE,
  updateMemberRequestSchema,
} from '@clientry/shared/workspaces';
import type {
  Member,
  MemberIdParams,
  MemberListResponse,
  RemoveMemberQuery,
  UpdateMemberRequest,
} from '@clientry/shared/workspaces';

import { LastOwnerError, MemberNotFoundError } from './errors.js';
import { MembersService } from './members.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { RequirePermission } from '../../common/auth/require-permission.decorator.js';
import { UntrustedOriginError } from '../../common/guards/untrusted-origin.error.js';
import {
  ApiErrorResponse,
  ApiInvalidRequest,
  invalidRequestExample,
} from '../../common/http/api-error-response.decorator.js';
import { ApiProblemResponse } from '../../common/http/api-problem-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError, InsufficientRoleError } from '../auth/errors.js';

const COLLECTION = '/api/members';
const ITEM = '/api/members/0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f';

// One 403 entry for both causes: a second 403 decorator would replace the first.
function ManageMembers(instance: string): MethodDecorator {
  return applyDecorators(
    RequirePermission('team.manage'),
    ApiErrorResponse(
      HttpStatus.FORBIDDEN,
      instance,
      new UntrustedOriginError(),
      new InsufficientRoleError(),
    ),
    ApiErrorResponse(HttpStatus.NOT_FOUND, instance, new MemberNotFoundError()),
    ApiErrorResponse(HttpStatus.CONFLICT, instance, new LastOwnerError()),
  );
}

@ApiTags('members')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, COLLECTION, new AuthenticationRequiredError())
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'Members of the workspace in join order' })
  @ResponseSchema(HttpStatus.OK, memberListResponseSchema)
  list(@CurrentUser() user: AuthUser): Promise<MemberListResponse> {
    return this.members.list(user);
  }

  @Patch(':id')
  @ManageMembers(ITEM)
  @ApiOperation({ summary: 'Change the role of a member; the last owner cannot be demoted' })
  @ResponseSchema(HttpStatus.OK, memberSchema)
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param({ schema: memberIdParamsSchema }) { id }: MemberIdParams,
    @Body({ schema: updateMemberRequestSchema }) input: UpdateMemberRequest,
  ): Promise<Member> {
    return this.members.updateRole(user, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ManageMembers(ITEM)
  @ApiOperation({ summary: 'Remove a member, handing their open deals and tasks to another one' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Removed' })
  @ApiProblemResponse(
    HttpStatus.BAD_REQUEST,
    invalidRequestExample(ITEM, 'id', 'Invalid UUID'),
    invalidRequestExample(ITEM, 'transferTo', TRANSFER_TO_MESSAGE),
  )
  remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: memberIdParamsSchema }) { id }: MemberIdParams,
    @Query({ schema: removeMemberQuerySchema }) query: RemoveMemberQuery,
  ): Promise<void> {
    return this.members.remove(user, id, query);
  }
}
