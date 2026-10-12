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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  createTaskRequestSchema,
  taskIdParamsSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskSchema,
  updateTaskRequestSchema,
} from '@clientry/shared/tasks';
import type {
  CreateTaskRequest,
  Task,
  TaskIdParams,
  TaskListQuery,
  TaskListResponse,
  UpdateTaskRequest,
} from '@clientry/shared/tasks';

import { TaskDeleteForbiddenError, TaskNotFoundError } from './errors.js';
import { TasksService } from './tasks.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { UntrustedOriginError } from '../../common/guards/untrusted-origin.error.js';
import {
  ApiErrorResponse,
  ApiInvalidRequest,
  ApiUntrustedOrigin,
} from '../../common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError } from '../auth/errors.js';

const COLLECTION = '/api/tasks';
const ITEM = '/api/tasks/0199c2a1-4b5c-7d6e-8f9a-0b1c2d3e4f5a';
const COMPLETE = `${ITEM}/complete`;
const REOPEN = `${ITEM}/reopen`;
const RESTORE = `${ITEM}/restore`;

function ApiTaskNotFound(instance: string): MethodDecorator {
  return ApiErrorResponse(HttpStatus.NOT_FOUND, instance, new TaskNotFoundError());
}

function ApiDeleteForbidden(instance: string): MethodDecorator {
  return ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    instance,
    new UntrustedOriginError(),
    new TaskDeleteForbiddenError(),
  );
}

// The delete rule runs in the service after the task is found, so no route carries @Roles.
@ApiTags('tasks')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, COLLECTION, new AuthenticationRequiredError())
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Open tasks by due time or done tasks by completion, with a cursor' })
  @ResponseSchema(HttpStatus.OK, taskListResponseSchema)
  @ApiInvalidRequest(COLLECTION, 'cursor', 'Invalid cursor')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: taskListQuerySchema }) query: TaskListQuery,
  ): Promise<TaskListResponse> {
    return this.tasks.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  @ResponseSchema(HttpStatus.CREATED, taskSchema)
  @ApiInvalidRequest(COLLECTION, 'remindAt', 'Choose a time in the future')
  @ApiUntrustedOrigin(COLLECTION)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTaskRequestSchema }) input: CreateTaskRequest,
  ): Promise<Task> {
    return this.tasks.create(user, input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A task' })
  @ResponseSchema(HttpStatus.OK, taskSchema)
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  @ApiTaskNotFound(ITEM)
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskIdParamsSchema }) { id }: TaskIdParams,
  ): Promise<Task> {
    return this.tasks.get(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change the given fields of a task; a new reminder time re-arms it' })
  @ResponseSchema(HttpStatus.OK, taskSchema)
  @ApiInvalidRequest(ITEM, 'related.id', 'Choose a deal')
  @ApiUntrustedOrigin(ITEM)
  @ApiTaskNotFound(ITEM)
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskIdParamsSchema }) { id }: TaskIdParams,
    @Body({ schema: updateTaskRequestSchema }) input: UpdateTaskRequest,
  ): Promise<Task> {
    return this.tasks.update(user, id, input);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark a task as done; a done task keeps its completion time' })
  @ResponseSchema(HttpStatus.OK, taskSchema)
  @ApiInvalidRequest(COMPLETE, 'id', 'Invalid UUID')
  @ApiUntrustedOrigin(COMPLETE)
  @ApiTaskNotFound(COMPLETE)
  complete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskIdParamsSchema }) { id }: TaskIdParams,
  ): Promise<Task> {
    return this.tasks.complete(user, id);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Mark a done task as open again' })
  @ResponseSchema(HttpStatus.OK, taskSchema)
  @ApiInvalidRequest(REOPEN, 'id', 'Invalid UUID')
  @ApiUntrustedOrigin(REOPEN)
  @ApiTaskNotFound(REOPEN)
  reopen(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskIdParamsSchema }) { id }: TaskIdParams,
  ): Promise<Task> {
    return this.tasks.reopen(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a task; managers only their own' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  @ApiDeleteForbidden(ITEM)
  @ApiTaskNotFound(ITEM)
  delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskIdParamsSchema }) { id }: TaskIdParams,
  ): Promise<void> {
    return this.tasks.delete(user, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Undo a delete; an active task is returned unchanged' })
  @ResponseSchema(HttpStatus.OK, taskSchema)
  @ApiInvalidRequest(RESTORE, 'id', 'Invalid UUID')
  @ApiDeleteForbidden(RESTORE)
  @ApiTaskNotFound(RESTORE)
  restore(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskIdParamsSchema }) { id }: TaskIdParams,
  ): Promise<Task> {
    return this.tasks.restore(user, id);
  }
}
