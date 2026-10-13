import { Injectable, Logger } from '@nestjs/common';

import { canDeleteRecord } from '@clientry/shared/auth';
import type {
  Client,
  ClientListQuery,
  ClientListResponse,
  ClientSummary,
  ClientTagsResponse,
  CreateClientRequest,
  UpdateClientRequest,
} from '@clientry/shared/clients';

import { decodeClientCursor, encodeClientCursor, isDateSort } from './client-cursor.js';
import type { ClientCursor } from './client-cursor.js';
import { ClientsRepository } from './clients.repository.js';
import type { ClientChanges, ClientListFilter, NewClient } from './clients.repository.js';
import { ClientDeleteForbiddenError, ClientNotFoundError } from './errors.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

// The schema has already trimmed the value, so '' is a blank input: stored as NULL.
function storedText<T extends string | null | undefined>(value: T): T | null {
  return value === '' ? null : value;
}

function toNewClient(input: CreateClientRequest): NewClient {
  return {
    name: input.name,
    company: storedText(input.company) ?? null,
    email: storedText(input.email) ?? null,
    phone: storedText(input.phone) ?? null,
    source: input.source ?? null,
    notes: storedText(input.notes) ?? null,
    tags: input.tags ?? [],
  };
}

function toChanges(input: UpdateClientRequest): ClientChanges {
  return {
    name: input.name,
    company: storedText(input.company),
    email: storedText(input.email),
    phone: storedText(input.phone),
    source: input.source,
    notes: storedText(input.notes),
    tags: input.tags,
  };
}

function hasChanges(changes: ClientChanges): boolean {
  return Object.values<unknown>(changes).some((value) => value !== undefined);
}

function toList<T>(value: T | readonly T[] | undefined): readonly T[] | undefined {
  return value === undefined ? undefined : ([] as T[]).concat(value);
}

function toFilter(user: AuthUser, query: ClientListQuery): ClientListFilter {
  return {
    search: query.q === '' ? undefined : query.q,
    sources: toList(query.source),
    tags: toList(query.tag),
    createdById: query.createdBy === 'me' ? user.id : query.createdBy,
  };
}

function cursorAfter(item: ClientSummary, sort: ClientCursor['sort']): ClientCursor {
  return { sort, value: isDateSort(sort) ? item.createdAt : item.name, id: item.id };
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly clients: ClientsRepository) {}

  async create(user: AuthUser, input: CreateClientRequest): Promise<Client> {
    const client = await this.clients.create(user.workspaceId, user.id, toNewClient(input));
    this.logger.log(this.logContext(user, client.id), 'Client created');
    return client;
  }

  async get(user: AuthUser, id: string): Promise<Client> {
    const client = await this.clients.findById(user.workspaceId, id);
    if (!client) {
      throw new ClientNotFoundError();
    }
    return client;
  }

  async list(user: AuthUser, query: ClientListQuery): Promise<ClientListResponse> {
    const after = this.decodeCursor(query);
    const page = await this.clients.list(user.workspaceId, toFilter(user, query), {
      sort: query.sort,
      after,
      limit: query.limit,
    });
    const last = page.items.at(-1);
    const nextCursor =
      page.hasMore && last ? encodeClientCursor(cursorAfter(last, query.sort)) : null;
    return { items: [...page.items], nextCursor };
  }

  async listTags(user: AuthUser): Promise<ClientTagsResponse> {
    return { items: await this.clients.listTags(user.workspaceId) };
  }

  // An empty body reads the client instead of writing, so updated_at stays.
  async update(user: AuthUser, id: string, input: UpdateClientRequest): Promise<Client> {
    const changes = toChanges(input);
    const client = hasChanges(changes)
      ? await this.clients.update(user.workspaceId, id, changes)
      : await this.clients.findById(user.workspaceId, id);
    if (!client) {
      throw new ClientNotFoundError();
    }
    return client;
  }

  async delete(user: AuthUser, id: string): Promise<void> {
    const ownership = await this.clients.findOwnership(user.workspaceId, id);
    if (!ownership || ownership.isDeleted) {
      throw new ClientNotFoundError();
    }
    this.assertCanDelete(user, ownership.createdById);
    const isDeleted = await this.clients.softDelete(user.workspaceId, id, new Date());
    if (!isDeleted) {
      throw new ClientNotFoundError();
    }
    this.logger.log(this.logContext(user, id), 'Client deleted');
  }

  // Restoring an active client returns it unchanged, so a repeated undo is harmless.
  async restore(user: AuthUser, id: string): Promise<Client> {
    const ownership = await this.clients.findOwnership(user.workspaceId, id);
    if (!ownership) {
      throw new ClientNotFoundError();
    }
    this.assertCanDelete(user, ownership.createdById);
    const client = await this.clients.restore(user.workspaceId, id);
    if (!client) {
      throw new ClientNotFoundError();
    }
    if (ownership.isDeleted) {
      this.logger.log(this.logContext(user, id), 'Client restored');
    }
    return client;
  }

  private decodeCursor(query: ClientListQuery): ClientCursor | null {
    if (query.cursor === undefined) {
      return null;
    }
    const cursor = decodeClientCursor(query.cursor, query.sort);
    if (!cursor) {
      throw new RequestValidationError([{ path: 'cursor', message: 'Invalid cursor' }]);
    }
    return cursor;
  }

  private assertCanDelete(user: AuthUser, createdById: string): void {
    if (!canDeleteRecord({ userId: user.id, role: user.role }, createdById)) {
      throw new ClientDeleteForbiddenError();
    }
  }

  private logContext(user: AuthUser, clientId: string): Record<string, string> {
    return { clientId, workspaceId: user.workspaceId, userId: user.id };
  }
}
