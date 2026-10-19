import {
  applyDecorators,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  createdInviteResponseSchema,
  inviteIdParamsSchema,
  inviteListResponseSchema,
} from '@clientry/shared/workspaces';
import type {
  CreatedInviteResponse,
  InviteIdParams,
  InviteListResponse,
} from '@clientry/shared/workspaces';

import { InviteLimitReachedError, InviteNotFoundError } from './errors.js';
import { InvitesService } from './invites.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { RequirePermission } from '../../common/auth/require-permission.decorator.js';
import { UntrustedOriginError } from '../../common/guards/untrusted-origin.error.js';
import {
  ApiErrorResponse,
  ApiInvalidRequest,
} from '../../common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import {
  AuthenticationRequiredError,
  DemoLockedError,
  InsufficientRoleError,
} from '../auth/errors.js';

const COLLECTION = '/api/invites';
const ITEM = '/api/invites/0199b0d2-1a2b-7c3d-8e4f-5a6b7c8d9e0f';

// A read is never checked for the origin, so its 403 has no UNTRUSTED_ORIGIN.
function ManageInvites(instance: string, access: 'read' | 'write'): MethodDecorator {
  const forbidden =
    access === 'write'
      ? ApiErrorResponse(
          HttpStatus.FORBIDDEN,
          instance,
          new UntrustedOriginError(),
          new InsufficientRoleError(),
          new DemoLockedError(),
        )
      : ApiErrorResponse(
          HttpStatus.FORBIDDEN,
          instance,
          new InsufficientRoleError(),
          new DemoLockedError(),
        );
  return applyDecorators(RequirePermission('team.manage'), forbidden);
}

@ApiTags('invites')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, COLLECTION, new AuthenticationRequiredError())
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  @ManageInvites(COLLECTION, 'read')
  @ApiOperation({ summary: 'Pending invites of the workspace, newest first, without tokens' })
  @ResponseSchema(HttpStatus.OK, inviteListResponseSchema)
  list(@CurrentUser() user: AuthUser): Promise<InviteListResponse> {
    return this.invites.list(user);
  }

  @Post()
  @ManageInvites(COLLECTION, 'write')
  @ApiOperation({ summary: 'Create a one-time invite link; the token is returned only here' })
  @ResponseSchema(HttpStatus.CREATED, createdInviteResponseSchema)
  @ApiErrorResponse(HttpStatus.CONFLICT, COLLECTION, new InviteLimitReachedError())
  create(@CurrentUser() user: AuthUser): Promise<CreatedInviteResponse> {
    return this.invites.create(user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ManageInvites(ITEM, 'write')
  @ApiOperation({ summary: 'Revoke a pending invite; its link stops working at once' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Revoked' })
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ITEM, new InviteNotFoundError())
  revoke(
    @CurrentUser() user: AuthUser,
    @Param({ schema: inviteIdParamsSchema }) { id }: InviteIdParams,
  ): Promise<void> {
    return this.invites.revoke(user, id);
  }
}
