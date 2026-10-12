import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  markAllReadRequestSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  unreadCountResponseSchema,
} from '@clientry/shared/notifications';
import type {
  MarkAllReadRequest,
  NotificationIdParams,
  NotificationListQuery,
  NotificationListResponse,
  UnreadCountResponse,
} from '@clientry/shared/notifications';

import { NotificationNotFoundError } from './errors.js';
import { NotificationsService } from './notifications.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import {
  ApiErrorResponse,
  ApiInvalidRequest,
  ApiUntrustedOrigin,
} from '../../common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError } from '../auth/errors.js';

const COLLECTION = '/api/notifications';
const READ = '/api/notifications/0199c3b0-1a2b-7c3d-8e4f-5a6b7c8d9e0f/read';
const READ_ALL = '/api/notifications/read-all';

@ApiTags('notifications')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, COLLECTION, new AuthenticationRequiredError())
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "The caller's notifications, newest first, with a cursor" })
  @ResponseSchema(HttpStatus.OK, notificationListResponseSchema)
  @ApiInvalidRequest(COLLECTION, 'cursor', 'Invalid cursor')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: notificationListQuerySchema }) query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    return this.notifications.list(user, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: "The caller's unread notifications, counted up to 100" })
  @ResponseSchema(HttpStatus.OK, unreadCountResponseSchema)
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountResponse> {
    return this.notifications.unreadCount(user);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark the unread notifications created at or before a time as read' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Marked as read' })
  @ApiInvalidRequest(READ_ALL, 'before', 'Invalid ISO datetime')
  @ApiUntrustedOrigin(READ_ALL)
  markAllRead(
    @CurrentUser() user: AuthUser,
    @Body({ schema: markAllReadRequestSchema }) input: MarkAllReadRequest,
  ): Promise<void> {
    return this.notifications.markAllRead(user, input);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as read; a read one keeps its read time' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Marked as read' })
  @ApiInvalidRequest(READ, 'id', 'Invalid UUID')
  @ApiUntrustedOrigin(READ)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, READ, new NotificationNotFoundError())
  markRead(
    @CurrentUser() user: AuthUser,
    @Param({ schema: notificationIdParamsSchema }) { id }: NotificationIdParams,
  ): Promise<void> {
    return this.notifications.markRead(user, id);
  }
}
