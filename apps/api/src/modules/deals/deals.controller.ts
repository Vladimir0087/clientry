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
  boardQuerySchema,
  boardResponseSchema,
  createDealRequestSchema,
  dealHistoryResponseSchema,
  dealIdParamsSchema,
  dealListQuerySchema,
  dealListResponseSchema,
  dealSchema,
  moveDealRequestSchema,
  updateDealRequestSchema,
} from '@clientry/shared/deals';
import type {
  Board,
  BoardQuery,
  CreateDealRequest,
  Deal,
  DealHistoryResponse,
  DealIdParams,
  DealListQuery,
  DealListResponse,
  MoveDealRequest,
  UpdateDealRequest,
} from '@clientry/shared/deals';

import { DealMovesService } from './deal-moves.service.js';
import { DealsService } from './deals.service.js';
import {
  BoardChangedError,
  DealChangedError,
  DealDeleteForbiddenError,
  DealNotFoundError,
} from './errors.js';
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

const COLLECTION = '/api/deals';
const BOARD = '/api/deals/board';
const ITEM = '/api/deals/0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b';
const MOVE = `${ITEM}/move`;
const RESTORE = `${ITEM}/restore`;
const HISTORY = `${ITEM}/history`;

function ApiDealNotFound(instance: string): MethodDecorator {
  return ApiErrorResponse(HttpStatus.NOT_FOUND, instance, new DealNotFoundError());
}

function ApiDeleteForbidden(instance: string): MethodDecorator {
  return ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    instance,
    new UntrustedOriginError(),
    new DealDeleteForbiddenError(),
  );
}

// The delete rule runs in the service after the deal is found, so no route carries
// @RequirePermission.
@ApiTags('deals')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, COLLECTION, new AuthenticationRequiredError())
@Controller('deals')
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly moves: DealMovesService,
  ) {}

  @Get('board')
  @ApiOperation({ summary: 'Every stage as a column with its first deals, count and totals' })
  @ResponseSchema(HttpStatus.OK, boardResponseSchema)
  @ApiInvalidRequest(BOARD, 'assignee', 'Invalid input')
  board(
    @CurrentUser() user: AuthUser,
    @Query({ schema: boardQuerySchema }) query: BoardQuery,
  ): Promise<Board> {
    return this.moves.board(user, query);
  }

  @Get()
  @ApiOperation({ summary: "A client's deals, newest first" })
  @ResponseSchema(HttpStatus.OK, dealListResponseSchema)
  @ApiInvalidRequest(COLLECTION, 'clientId', 'Invalid UUID')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dealListQuerySchema }) query: DealListQuery,
  ): Promise<DealListResponse> {
    return this.deals.listByClient(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a deal at the top of its stage' })
  @ResponseSchema(HttpStatus.CREATED, dealSchema)
  @ApiInvalidRequest(COLLECTION, 'clientId', 'Choose a client')
  @ApiUntrustedOrigin(COLLECTION)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createDealRequestSchema }) input: CreateDealRequest,
  ): Promise<Deal> {
    return this.deals.create(user, input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A deal' })
  @ResponseSchema(HttpStatus.OK, dealSchema)
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  @ApiDealNotFound(ITEM)
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: dealIdParamsSchema }) { id }: DealIdParams,
  ): Promise<Deal> {
    return this.deals.get(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change the given fields of a deal at the version it was read' })
  @ResponseSchema(HttpStatus.OK, dealSchema)
  @ApiInvalidRequest(ITEM, 'amount', 'Amount cannot be negative')
  @ApiUntrustedOrigin(ITEM)
  @ApiDealNotFound(ITEM)
  @ApiErrorResponse(HttpStatus.CONFLICT, ITEM, new DealChangedError())
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: dealIdParamsSchema }) { id }: DealIdParams,
    @Body({ schema: updateDealRequestSchema }) input: UpdateDealRequest,
  ): Promise<Deal> {
    return this.deals.update(user, id, input);
  }

  @Post(':id/move')
  @ApiOperation({ summary: 'Move a deal right after another card, or to the top of a stage' })
  @ResponseSchema(HttpStatus.OK, dealSchema)
  @ApiInvalidRequest(MOVE, 'afterId', 'Invalid UUID')
  @ApiUntrustedOrigin(MOVE)
  @ApiDealNotFound(MOVE)
  @ApiErrorResponse(HttpStatus.CONFLICT, MOVE, new DealChangedError(), new BoardChangedError())
  move(
    @CurrentUser() user: AuthUser,
    @Param({ schema: dealIdParamsSchema }) { id }: DealIdParams,
    @Body({ schema: moveDealRequestSchema }) input: MoveDealRequest,
  ): Promise<Deal> {
    return this.moves.move(user, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a deal; managers only their own' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  @ApiDeleteForbidden(ITEM)
  @ApiDealNotFound(ITEM)
  delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: dealIdParamsSchema }) { id }: DealIdParams,
  ): Promise<void> {
    return this.deals.delete(user, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Undo a delete; an active deal is returned unchanged' })
  @ResponseSchema(HttpStatus.OK, dealSchema)
  @ApiInvalidRequest(RESTORE, 'id', 'Invalid UUID')
  @ApiDeleteForbidden(RESTORE)
  @ApiDealNotFound(RESTORE)
  restore(
    @CurrentUser() user: AuthUser,
    @Param({ schema: dealIdParamsSchema }) { id }: DealIdParams,
  ): Promise<Deal> {
    return this.deals.restore(user, id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'The newest history entries of a deal' })
  @ResponseSchema(HttpStatus.OK, dealHistoryResponseSchema)
  @ApiInvalidRequest(HISTORY, 'id', 'Invalid UUID')
  @ApiDealNotFound(HISTORY)
  history(
    @CurrentUser() user: AuthUser,
    @Param({ schema: dealIdParamsSchema }) { id }: DealIdParams,
  ): Promise<DealHistoryResponse> {
    return this.deals.history(user, id);
  }
}
