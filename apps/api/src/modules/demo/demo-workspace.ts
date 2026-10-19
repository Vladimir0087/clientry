import { buildDemoDeals } from './build-demo-deals.js';
import { buildDemoTasks } from './build-demo-tasks.js';
import { CLIENT_NOTES, CLIENTS } from './data/clients.js';
import type { ClientRow } from './data/clients.js';
import { DEMO_WORKSPACE, PEOPLE } from './data/people.js';
import type { DemoBuildContext } from './demo-build-context.js';
import { activityRow, daysBefore, personRef } from './demo-build-context.js';
import type {
  DemoActivityRow,
  DemoClientRow,
  DemoMembershipRow,
  DemoStageRow,
  DemoUserRow,
  DemoWorkspace,
} from './demo-rows.js';
import { uuidV7At } from './uuid-v7.js';
import { DEFAULT_STAGES } from '../auth/default-stages.js';

interface DemoClients {
  readonly byKey: ReadonlyMap<string, DemoClientRow>;
  readonly activities: readonly DemoActivityRow[];
}

function domainOf(company: string): string {
  const slug = company
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-|-$/g, '');
  return `${slug}.example`;
}

function emailOf(name: string, company: string | null): string {
  const [first = '', ...rest] = name.toLowerCase().split(' ');
  return company === null
    ? `${first}.${rest.join('')}@mail.example`
    : `${first}@${domainOf(company)}`;
}

function clientRow(context: DemoBuildContext, row: ClientRow, index: number): DemoClientRow {
  const [key, name, company, source, tags, contact, createdBy, daysAgo] = row;
  const createdAt = daysBefore(context.now, daysAgo);
  return {
    id: uuidV7At(createdAt),
    workspaceId: context.workspaceId,
    createdById: personRef(createdBy).id,
    name,
    company,
    email: contact.includes('e') ? emailOf(name, company) : null,
    phone: contact.includes('p') ? `+1 555-01${String(index).padStart(2, '0')}` : null,
    source,
    notes: CLIENT_NOTES[key] ?? null,
    tags: tags === '' ? [] : tags.split(' '),
    createdAt,
    updatedAt: createdAt,
  };
}

function buildClients(context: DemoBuildContext): DemoClients {
  const rows = CLIENTS.map((row, index) => [row[0], clientRow(context, row, index)] as const);
  const byKey = new Map(rows);
  if (byKey.size !== rows.length) {
    throw new Error('Two demo clients share a key');
  }
  const activities = [...byKey.values()].map((client) =>
    activityRow(
      context,
      client.createdById,
      client.id,
      { type: 'client_created', payload: {} },
      client.createdAt,
    ),
  );
  return { byKey, activities };
}

function buildPeople(context: DemoBuildContext): {
  readonly users: DemoUserRow[];
  readonly memberships: DemoMembershipRow[];
} {
  const people = Object.values(PEOPLE).map((person) => ({
    person,
    joinedAt: daysBefore(context.now, person.joinedDaysAgo),
  }));
  return {
    users: people.map(({ person: { id, email, name }, joinedAt }) => ({
      id,
      email,
      name,
      createdAt: joinedAt,
    })),
    memberships: people.map(({ person, joinedAt }) => ({
      id: uuidV7At(joinedAt),
      userId: person.id,
      workspaceId: context.workspaceId,
      role: person.role,
      createdAt: joinedAt,
    })),
  };
}

// The stages registration gives a workspace, created when its owner joined.
function buildStages(context: DemoBuildContext, createdAt: Date): DemoStageRow[] {
  return DEFAULT_STAGES.map(({ name, position, kind }) => ({
    id: uuidV7At(createdAt),
    workspaceId: context.workspaceId,
    name,
    position,
    kind,
    createdAt,
    updatedAt: createdAt,
  }));
}

// Pure but for the random bits of ids: every row of Pixel Studio, with times relative to now.
export function buildDemoWorkspace(now: Date): DemoWorkspace {
  const context: DemoBuildContext = { now, workspaceId: DEMO_WORKSPACE.id };
  const ownerJoinedAt = daysBefore(now, PEOPLE.ann.joinedDaysAgo);
  const { users, memberships } = buildPeople(context);
  const stages = buildStages(context, ownerJoinedAt);
  const clients = buildClients(context);
  const deals = buildDemoDeals(context, stages, clients.byKey);
  const tasks = buildDemoTasks(context, { clients: clients.byKey, deals: deals.byKey });
  return {
    workspace: { id: DEMO_WORKSPACE.id, name: DEMO_WORKSPACE.name, createdAt: ownerJoinedAt },
    users,
    memberships,
    stages,
    clients: [...clients.byKey.values()],
    deals: deals.deals,
    tasks: tasks.tasks,
    activities: [...clients.activities, ...deals.activities, ...tasks.activities],
    notifications: tasks.notifications,
  };
}
