import { Injectable } from '@nestjs/common';

import type { Client, ClientSort, ClientSummary, ClientTagCount } from '@clientry/shared/clients';

import type { ClientCursor } from './client-cursor.js';
import type {
  ClientChanges,
  ClientListFilter,
  ClientOwnership,
  ClientPage,
  ClientPageRequest,
  ClientsRepository,
  NewClient,
} from './clients.repository.js';
import { escapeLikePattern } from './like-pattern.js';
import { Prisma } from '../../infra/prisma/generated/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ActivityLog } from '../activity/activity-log.repository.js';

const SUMMARY_SELECT = {
  id: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  source: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ClientSelect;

const CLIENT_SELECT = { ...SUMMARY_SELECT, notes: true } satisfies Prisma.ClientSelect;

type SummaryRow = Prisma.ClientGetPayload<{ select: typeof SUMMARY_SELECT }>;
type ClientRow = Prisma.ClientGetPayload<{ select: typeof CLIENT_SELECT }>;

interface SortOrder {
  readonly field: 'createdAt' | 'name';
  readonly isDescending: boolean;
}

// One table drives both the ORDER BY and the cursor condition, so the two cannot disagree.
const SORT_ORDERS: Readonly<Record<ClientSort, SortOrder>> = {
  newest: { field: 'createdAt', isDescending: true },
  oldest: { field: 'createdAt', isDescending: false },
  name_asc: { field: 'name', isDescending: false },
  name_desc: { field: 'name', isDescending: true },
};

// The id completes every order, so rows with equal values still have one fixed position.
function orderBy(sort: ClientSort): Prisma.ClientOrderByWithRelationInput[] {
  const { field, isDescending } = SORT_ORDERS[sort];
  const direction = isDescending ? 'desc' : 'asc';
  return [{ [field]: direction }, { id: direction }];
}

const RECORD_NOT_FOUND = 'P2025';

function toSummary(row: SummaryRow): ClientSummary {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function toClient(row: ClientRow): Client {
  return { ...toSummary(row), notes: row.notes };
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND;
}

function beyond<T>(isDescending: boolean, value: T): { lt: T } | { gt: T } {
  return isDescending ? { lt: value } : { gt: value };
}

function reaching<T>(isDescending: boolean, value: T): { lte: T } | { gte: T } {
  return isDescending ? { lte: value } : { gte: value };
}

// Postgres cannot seek an index by the OR alone; the redundant bound starts the scan at the cursor.
function afterCursor(cursor: ClientCursor): Prisma.ClientWhereInput {
  const { field, isDescending } = SORT_ORDERS[cursor.sort];
  const id = beyond(isDescending, cursor.id);
  if (field === 'createdAt') {
    const createdAt = new Date(cursor.value);
    return {
      createdAt: reaching(isDescending, createdAt),
      OR: [{ createdAt: beyond(isDescending, createdAt) }, { createdAt, id }],
    };
  }
  return {
    name: reaching(isDescending, cursor.value),
    OR: [{ name: beyond(isDescending, cursor.value) }, { name: cursor.value, id }],
  };
}

// Prisma's contains passes % and _ through as wildcards.
function searchWhere(search: string): Prisma.ClientWhereInput {
  const contains = {
    contains: escapeLikePattern(search),
    mode: 'insensitive',
  } satisfies Prisma.StringFilter<'Client'>;
  return {
    OR: [{ name: contains }, { company: contains }, { email: contains }, { phone: contains }],
  };
}

function filterWhere(filter: ClientListFilter): Prisma.ClientWhereInput[] {
  const conditions: Prisma.ClientWhereInput[] = [];
  if (filter.search !== undefined) {
    conditions.push(searchWhere(filter.search));
  }
  if (filter.sources !== undefined) {
    conditions.push({ source: { in: [...filter.sources] } });
  }
  if (filter.tags !== undefined) {
    conditions.push({ tags: { hasEvery: [...filter.tags] } });
  }
  if (filter.createdById !== undefined) {
    conditions.push({ createdById: filter.createdById });
  }
  return conditions;
}

@Injectable()
export class PrismaClientsRepository implements ClientsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLog,
  ) {}

  // The client and its feed entry commit together.
  create(workspaceId: string, createdById: string, client: NewClient): Promise<Client> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.client.create({
        data: { ...client, tags: [...client.tags], workspaceId, createdById },
        select: CLIENT_SELECT,
      });
      await this.activityLog.record(tx, [
        {
          workspaceId,
          actorId: createdById,
          subjectId: row.id,
          event: { type: 'client_created', payload: {} },
        },
      ]);
      return toClient(row);
    });
  }

  async findById(workspaceId: string, id: string): Promise<Client | null> {
    const row = await this.prisma.client.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: CLIENT_SELECT,
    });
    return row ? toClient(row) : null;
  }

  async list(
    workspaceId: string,
    filter: ClientListFilter,
    { sort, after, limit }: ClientPageRequest,
  ): Promise<ClientPage> {
    const conditions = filterWhere(filter);
    if (after !== null) {
      conditions.push(afterCursor(after));
    }
    // One extra row tells whether a next page exists without counting.
    const rows = await this.prisma.client.findMany({
      where: { workspaceId, deletedAt: null, AND: conditions },
      orderBy: orderBy(sort),
      take: limit + 1,
      select: SUMMARY_SELECT,
    });
    return { items: rows.slice(0, limit).map(toSummary), hasMore: rows.length > limit };
  }

  // Values from unnest carry the database default collation, hence the explicit one; count is
  // cast because Postgres returns bigint, which JSON cannot carry.
  listTags(workspaceId: string): Promise<ClientTagCount[]> {
    return this.prisma.$queryRaw<ClientTagCount[]>`
      SELECT t.tag, count(*)::int AS count
      FROM clients c CROSS JOIN LATERAL unnest(c.tags) AS t(tag)
      WHERE c.workspace_id = ${workspaceId}::uuid AND c.deleted_at IS NULL
      GROUP BY t.tag
      ORDER BY t.tag COLLATE "und-x-icu"`;
  }

  async update(workspaceId: string, id: string, changes: ClientChanges): Promise<Client | null> {
    const { tags, ...fields } = changes;
    try {
      const row = await this.prisma.client.update({
        where: { id, workspaceId, deletedAt: null },
        data: { ...fields, tags: tags === undefined ? undefined : [...tags] },
        select: CLIENT_SELECT,
      });
      return toClient(row);
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async findOwnership(workspaceId: string, id: string): Promise<ClientOwnership | null> {
    const row = await this.prisma.client.findFirst({
      where: { id, workspaceId },
      select: { createdById: true, deletedAt: true },
    });
    return row ? { createdById: row.createdById, isDeleted: row.deletedAt !== null } : null;
  }

  async softDelete(workspaceId: string, id: string, deletedAt: Date): Promise<boolean> {
    const { count } = await this.prisma.client.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: { deletedAt },
    });
    return count > 0;
  }

  async restore(workspaceId: string, id: string): Promise<Client | null> {
    await this.prisma.client.updateMany({
      where: { id, workspaceId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return this.findById(workspaceId, id);
  }
}
