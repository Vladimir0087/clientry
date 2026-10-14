import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { activityFeedQuerySchema, activityFeedResponseSchema } from '@clientry/shared/activity';
import type { ActivityFeedQuery, ActivityFeedResponse } from '@clientry/shared/activity';

import { ActivityService } from './activity.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import {
  ApiErrorResponse,
  ApiInvalidRequest,
} from '../../common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError } from '../auth/errors.js';

const FEED = '/api/activity';

@ApiTags('activity')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, FEED, new AuthenticationRequiredError())
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({ summary: "The workspace's activity, newest first, with a cursor" })
  @ResponseSchema(HttpStatus.OK, activityFeedResponseSchema)
  @ApiInvalidRequest(FEED, 'cursor', 'Invalid cursor')
  feed(
    @CurrentUser() user: AuthUser,
    @Query({ schema: activityFeedQuerySchema }) query: ActivityFeedQuery,
  ): Promise<ActivityFeedResponse> {
    return this.activity.feed(user, query);
  }
}
