import { Body, Controller, HttpStatus, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { renameWorkspaceRequestSchema, workspaceResponseSchema } from '@clientry/shared/workspaces';
import type { RenameWorkspaceRequest, WorkspaceResponse } from '@clientry/shared/workspaces';

import { WorkspaceService } from './workspace.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { RequirePermission } from '../../common/auth/require-permission.decorator.js';
import { UntrustedOriginError } from '../../common/guards/untrusted-origin.error.js';
import {
  ApiErrorResponse,
  ApiInvalidRequest,
} from '../../common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError, InsufficientRoleError } from '../auth/errors.js';

const WORKSPACE = '/api/workspace';

// No id in the path: the workspace is always the caller's.
@ApiTags('workspace')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, WORKSPACE, new AuthenticationRequiredError())
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Patch()
  @RequirePermission('workspace.manage')
  @ApiOperation({ summary: 'Rename the workspace' })
  @ResponseSchema(HttpStatus.OK, workspaceResponseSchema)
  @ApiInvalidRequest(WORKSPACE, 'name', 'Enter a workspace name')
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    WORKSPACE,
    new UntrustedOriginError(),
    new InsufficientRoleError(),
  )
  rename(
    @CurrentUser() user: AuthUser,
    @Body({ schema: renameWorkspaceRequestSchema }) input: RenameWorkspaceRequest,
  ): Promise<WorkspaceResponse> {
    return this.workspace.rename(user, input);
  }
}
