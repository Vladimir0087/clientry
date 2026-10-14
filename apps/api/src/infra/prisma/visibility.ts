import { Prisma } from './generated/client.js';

// One copy of each rule, so dashboard counts and feed links agree with what the lists show. A
// deleted client or deal hides its deals and tasks as if they were deleted themselves.

export function visibleDeal(workspaceId: string): Prisma.DealWhereInput {
  return { workspaceId, deletedAt: null, client: { deletedAt: null } };
}

const TASK_LINKS_VISIBLE: readonly Prisma.TaskWhereInput[] = [
  { OR: [{ clientId: null }, { client: { is: { deletedAt: null } } }] },
  { OR: [{ dealId: null }, { deal: { is: { deletedAt: null, client: { deletedAt: null } } } }] },
];

export function visibleTask(workspaceId: string): Prisma.TaskWhereInput {
  return { workspaceId, deletedAt: null, AND: [...TASK_LINKS_VISIBLE] };
}

export function deletedTaskWithVisibleLinks(workspaceId: string): Prisma.TaskWhereInput {
  return { workspaceId, deletedAt: { not: null }, AND: [...TASK_LINKS_VISIBLE] };
}

// Aliases are code constants, never input, so they go into the SQL as identifiers.
export interface DealAliases {
  readonly deal: string;
  readonly client: string;
}

export interface TaskAliases {
  readonly task: string;
  readonly client: string;
  readonly deal: string;
  readonly dealClient: string;
}

// Outer, so a caller whose deal is optional keeps its rows; dealVisible does the filtering.
export function dealClientJoin({ deal, client }: DealAliases): Prisma.Sql {
  return Prisma.raw(`LEFT JOIN clients ${client} ON ${client}.id = ${deal}.client_id`);
}

export function dealVisible({ deal, client }: DealAliases): Prisma.Sql {
  return Prisma.raw(`(${deal}.deleted_at IS NULL AND ${client}.deleted_at IS NULL)`);
}

// The outer joins never hide a row; taskLinksVisible drops a task whose linked rows are deleted.
export function taskLinkJoins({ task, client, deal, dealClient }: TaskAliases): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`LEFT JOIN clients ${client} ON ${client}.id = ${task}.client_id
    LEFT JOIN deals ${deal} ON ${deal}.id = ${task}.deal_id`)}
    ${dealClientJoin({ deal, client: dealClient })}`;
}

export function taskLinksVisible({ task, client, deal, dealClient }: TaskAliases): Prisma.Sql {
  return Prisma.sql`(${Prisma.raw(`(${task}.client_id IS NULL OR ${client}.deleted_at IS NULL)`)}
    AND (${Prisma.raw(`${task}.deal_id IS NULL`)} OR ${dealVisible({ deal, client: dealClient })}))`;
}
