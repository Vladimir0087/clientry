import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  closedDealsQuerySchema,
  closedDealsResponseSchema,
  dashboardSummaryResponseSchema,
} from '@clientry/shared/dashboard';
import type { ClosedDeals, ClosedDealsQuery, DashboardSummary } from '@clientry/shared/dashboard';

import { DashboardService } from './dashboard.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import {
  ApiErrorResponse,
  ApiInvalidRequest,
} from '../../common/http/api-error-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError } from '../auth/errors.js';

const SUMMARY = '/api/dashboard/summary';
const CLOSED_DEALS = '/api/dashboard/closed-deals';

@ApiTags('dashboard')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, SUMMARY, new AuthenticationRequiredError())
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Open deals by stage, open and overdue tasks, and work per member' })
  @ResponseSchema(HttpStatus.OK, dashboardSummaryResponseSchema)
  summary(@CurrentUser() user: AuthUser): Promise<DashboardSummary> {
    return this.dashboard.summary(user);
  }

  @Get('closed-deals')
  @ApiOperation({
    summary: 'Won and lost deals per period; the bounds are instants in ascending order',
  })
  @ResponseSchema(HttpStatus.OK, closedDealsResponseSchema)
  @ApiInvalidRequest(CLOSED_DEALS, 'bounds', 'Use 2 to 13 bounds in ascending order')
  closedDeals(
    @CurrentUser() user: AuthUser,
    @Query({ schema: closedDealsQuerySchema }) query: ClosedDealsQuery,
  ): Promise<ClosedDeals> {
    return this.dashboard.closedDeals(user, query);
  }
}
