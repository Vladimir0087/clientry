import type {
  Client,
  ClientSort,
  ClientSource,
  ClientSummary,
  ClientTagCount,
} from '@clientry/shared/clients';

import type { ClientCursor } from './client-cursor.js';

export interface NewClient {
  readonly name: string;
  readonly company: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly source: ClientSource | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
}

// A field left undefined is not changed.
export type ClientChanges = Partial<NewClient>;

export interface ClientListFilter {
  readonly search?: string;
  readonly sources?: readonly ClientSource[];
  // A client must carry every one of them.
  readonly tags?: readonly string[];
  readonly createdById?: string;
}

export interface ClientPageRequest {
  readonly sort: ClientSort;
  readonly after: ClientCursor | null;
  readonly limit: number;
}

export interface ClientPage {
  readonly items: readonly ClientSummary[];
  readonly hasMore: boolean;
}

export interface ClientOwnership {
  readonly createdById: string;
  readonly isDeleted: boolean;
}

// Every read and write skips soft-deleted clients, except findOwnership and restore.
export abstract class ClientsRepository {
  abstract create(workspaceId: string, createdById: string, client: NewClient): Promise<Client>;
  abstract findById(workspaceId: string, id: string): Promise<Client | null>;
  abstract list(
    workspaceId: string,
    filter: ClientListFilter,
    page: ClientPageRequest,
  ): Promise<ClientPage>;
  abstract listTags(workspaceId: string): Promise<ClientTagCount[]>;
  // Null when no active client matched.
  abstract update(workspaceId: string, id: string, changes: ClientChanges): Promise<Client | null>;
  abstract findOwnership(workspaceId: string, id: string): Promise<ClientOwnership | null>;
  // False when no active client matched, e.g. a concurrent delete won.
  abstract softDelete(workspaceId: string, id: string, deletedAt: Date): Promise<boolean>;
  // Clears deleted_at if set; null when the client does not exist.
  abstract restore(workspaceId: string, id: string): Promise<Client | null>;
}
