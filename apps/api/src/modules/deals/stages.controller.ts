import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  applyDecorators,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  createStageRequestSchema,
  deleteStageQuerySchema,
  renameStageRequestSchema,
  reorderStagesRequestSchema,
  stageIdParamsSchema,
  stageListResponseSchema,
  stageSchema,
} from '@clientry/shared/deals';
import type {
  CreateStageRequest,
  DeleteStageQuery,
  RenameStageRequest,
  ReorderStagesRequest,
  Stage,
  StageIdParams,
  StageListResponse,
} from '@clientry/shared/deals';

import {
  LastOpenStageError,
  StageLimitReachedError,
  StageNameTakenError,
  StageNotDeletableError,
  StageNotFoundError,
  StagesChangedError,
} from './errors.js';
import { StagesService } from './stages.service.js';
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

const COLLECTION = '/api/stages';
const ORDER = '/api/stages/order';
const ITEM = '/api/stages/0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c';

// The permission guard answers a manager with 403 before the handler runs.
function ManageStages(instance: string): MethodDecorator {
  return applyDecorators(
    RequirePermission('stages.manage'),
    ApiErrorResponse(
      HttpStatus.FORBIDDEN,
      instance,
      new UntrustedOriginError(),
      new InsufficientRoleError(),
    ),
  );
}

function ApiStageNotFound(instance: string): MethodDecorator {
  return ApiErrorResponse(HttpStatus.NOT_FOUND, instance, new StageNotFoundError());
}

@ApiTags('stages')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, COLLECTION, new AuthenticationRequiredError())
@Controller('stages')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  @Get()
  @ApiOperation({ summary: 'Stages in board order with their number of deals' })
  @ResponseSchema(HttpStatus.OK, stageListResponseSchema)
  list(@CurrentUser() user: AuthUser): Promise<StageListResponse> {
    return this.stages.list(user);
  }

  @Post()
  @ManageStages(COLLECTION)
  @ApiOperation({ summary: 'Add an open stage before won and lost' })
  @ResponseSchema(HttpStatus.CREATED, stageSchema)
  @ApiInvalidRequest(COLLECTION, 'name', 'Enter a stage name')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    COLLECTION,
    new StageNameTakenError(),
    new StageLimitReachedError(),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createStageRequestSchema }) input: CreateStageRequest,
  ): Promise<Stage> {
    return this.stages.create(user, input);
  }

  @Put('order')
  @ManageStages(ORDER)
  @ApiOperation({ summary: 'Reorder the open stages; the list must hold every one of them' })
  @ResponseSchema(HttpStatus.OK, stageListResponseSchema)
  @ApiInvalidRequest(ORDER, 'ids.1', 'Stages must be unique')
  @ApiErrorResponse(HttpStatus.CONFLICT, ORDER, new StagesChangedError())
  reorder(
    @CurrentUser() user: AuthUser,
    @Body({ schema: reorderStagesRequestSchema }) input: ReorderStagesRequest,
  ): Promise<StageListResponse> {
    return this.stages.reorder(user, input);
  }

  @Patch(':id')
  @ManageStages(ITEM)
  @ApiOperation({ summary: 'Rename a stage' })
  @ResponseSchema(HttpStatus.OK, stageSchema)
  @ApiInvalidRequest(ITEM, 'name', 'Use at most 50 characters')
  @ApiStageNotFound(ITEM)
  @ApiErrorResponse(HttpStatus.CONFLICT, ITEM, new StageNameTakenError())
  rename(
    @CurrentUser() user: AuthUser,
    @Param({ schema: stageIdParamsSchema }) { id }: StageIdParams,
    @Body({ schema: renameStageRequestSchema }) input: RenameStageRequest,
  ): Promise<Stage> {
    return this.stages.rename(user, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ManageStages(ITEM)
  @ApiOperation({ summary: 'Delete an open stage, moving its deals to another open stage' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiInvalidRequest(ITEM, 'moveDealsTo', 'Choose another open stage')
  @ApiStageNotFound(ITEM)
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ITEM,
    new StageNotDeletableError(),
    new LastOpenStageError(),
  )
  delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: stageIdParamsSchema }) { id }: StageIdParams,
    @Query({ schema: deleteStageQuerySchema }) query: DeleteStageQuery,
  ): Promise<void> {
    return this.stages.delete(user, id, query);
  }
}
