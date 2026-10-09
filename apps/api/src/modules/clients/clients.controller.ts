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
  clientIdParamsSchema,
  clientListQuerySchema,
  clientListResponseSchema,
  clientResponseSchema,
  clientTagsResponseSchema,
  createClientRequestSchema,
  updateClientRequestSchema,
} from '@clientry/shared/clients';
import type {
  Client,
  ClientIdParams,
  ClientListQuery,
  ClientListResponse,
  ClientTagsResponse,
  CreateClientRequest,
  UpdateClientRequest,
} from '@clientry/shared/clients';

import { ClientsService } from './clients.service.js';
import { ClientDeleteForbiddenError, ClientNotFoundError } from './errors.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { UntrustedOriginError } from '../../common/guards/untrusted-origin.error.js';
import {
  ApiErrorResponse,
  ApiUntrustedOrigin,
} from '../../common/http/api-error-response.decorator.js';
import { ApiProblemResponse } from '../../common/http/api-problem-response.decorator.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';
import { AuthenticationRequiredError } from '../auth/errors.js';

const COLLECTION = '/api/clients';
const ITEM = '/api/clients/0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b';
const RESTORE = `${ITEM}/restore`;

function ApiInvalidRequest(instance: string, path: string, message: string): MethodDecorator {
  return ApiProblemResponse(HttpStatus.BAD_REQUEST, {
    code: 'VALIDATION_FAILED',
    detail: 'Request validation failed',
    instance,
    errors: [{ path, message }],
  });
}

function ApiClientNotFound(instance: string): MethodDecorator {
  return ApiErrorResponse(HttpStatus.NOT_FOUND, instance, new ClientNotFoundError());
}

function ApiDeleteForbidden(instance: string): MethodDecorator {
  return ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    instance,
    new UntrustedOriginError(),
    new ClientDeleteForbiddenError(),
  );
}

// The role rule runs in the service after the client is found, so no route carries @Roles.
@ApiTags('clients')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, COLLECTION, new AuthenticationRequiredError())
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'List clients with search, filters and a cursor' })
  @ResponseSchema(HttpStatus.OK, clientListResponseSchema)
  @ApiInvalidRequest(COLLECTION, 'cursor', 'Invalid cursor')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: clientListQuerySchema }) query: ClientListQuery,
  ): Promise<ClientListResponse> {
    return this.clients.list(user, query);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Tags of active clients with their counts' })
  @ResponseSchema(HttpStatus.OK, clientTagsResponseSchema)
  listTags(@CurrentUser() user: AuthUser): Promise<ClientTagsResponse> {
    return this.clients.listTags(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a client' })
  @ResponseSchema(HttpStatus.CREATED, clientResponseSchema)
  @ApiInvalidRequest(COLLECTION, 'name', 'Enter a name')
  @ApiUntrustedOrigin(COLLECTION)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createClientRequestSchema }) input: CreateClientRequest,
  ): Promise<Client> {
    return this.clients.create(user, input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A client with notes' })
  @ResponseSchema(HttpStatus.OK, clientResponseSchema)
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  @ApiClientNotFound(ITEM)
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: clientIdParamsSchema }) { id }: ClientIdParams,
  ): Promise<Client> {
    return this.clients.get(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change the given fields of a client' })
  @ResponseSchema(HttpStatus.OK, clientResponseSchema)
  @ApiInvalidRequest(ITEM, 'email', 'Enter a valid email')
  @ApiUntrustedOrigin(ITEM)
  @ApiClientNotFound(ITEM)
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: clientIdParamsSchema }) { id }: ClientIdParams,
    @Body({ schema: updateClientRequestSchema }) input: UpdateClientRequest,
  ): Promise<Client> {
    return this.clients.update(user, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a client; managers only their own' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted' })
  @ApiInvalidRequest(ITEM, 'id', 'Invalid UUID')
  @ApiDeleteForbidden(ITEM)
  @ApiClientNotFound(ITEM)
  delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: clientIdParamsSchema }) { id }: ClientIdParams,
  ): Promise<void> {
    return this.clients.delete(user, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Undo a delete; an active client is returned unchanged' })
  @ResponseSchema(HttpStatus.OK, clientResponseSchema)
  @ApiInvalidRequest(RESTORE, 'id', 'Invalid UUID')
  @ApiDeleteForbidden(RESTORE)
  @ApiClientNotFound(RESTORE)
  restore(
    @CurrentUser() user: AuthUser,
    @Param({ schema: clientIdParamsSchema }) { id }: ClientIdParams,
  ): Promise<Client> {
    return this.clients.restore(user, id);
  }
}
