import { randomUUID } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

import { sessionResponseSchema } from '@clientry/shared/auth';
import type {
  InviteRegisterRequest,
  MemberRole,
  RegisterRequest,
  SessionResponse,
} from '@clientry/shared/auth';
import { clientListResponseSchema, clientResponseSchema } from '@clientry/shared/clients';
import type { Client, CreateClientRequest } from '@clientry/shared/clients';
import { boardResponseSchema, dealSchema, stageListResponseSchema } from '@clientry/shared/deals';
import type {
  CreateDealRequest,
  Deal,
  MoveDealRequest,
  StageListItem,
} from '@clientry/shared/deals';
import { taskSchema } from '@clientry/shared/tasks';
import type { CreateTaskRequest, Task } from '@clientry/shared/tasks';
import { createdInviteResponseSchema } from '@clientry/shared/workspaces';
import type { CreatedInviteResponse } from '@clientry/shared/workspaces';

import { WEB_ORIGIN } from './origins.js';

export const PASSWORD = 'correct horse battery staple';

interface Schema<T> {
  readonly parse: (value: unknown) => T;
}

class ArrangeError extends Error {
  override readonly name = 'ArrangeError';
}

// Through the web origin, as the browser calls it; the API's origin check needs the header.
async function send<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  path: string,
  schema: Schema<T>,
  data?: unknown,
): Promise<T> {
  const response = await request.fetch(`${WEB_ORIGIN}${path}`, {
    method,
    headers: { Origin: WEB_ORIGIN },
    data,
  });
  if (!response.ok()) {
    throw new ArrangeError(
      `${method} ${path} answered ${String(response.status())}: ${await response.text()}`,
    );
  }
  return schema.parse(await response.json());
}

export function uniqueEmail(role: string): string {
  return `${role}-${randomUUID()}@e2e.example`;
}

export function register(
  request: APIRequestContext,
  input: Partial<RegisterRequest> = {},
): Promise<SessionResponse> {
  const body: RegisterRequest = {
    name: 'Olivia Owner',
    workspaceName: 'Bright Studio',
    email: uniqueEmail('owner'),
    password: PASSWORD,
    ...input,
  };
  return send(request, 'POST', '/api/auth/register', sessionResponseSchema, body);
}

export function startDemo(request: APIRequestContext, role: MemberRole): Promise<SessionResponse> {
  return send(request, 'POST', '/api/auth/demo', sessionResponseSchema, { role });
}

export function createClient(
  request: APIRequestContext,
  input: CreateClientRequest,
): Promise<Client> {
  return send(request, 'POST', '/api/clients', clientResponseSchema, input);
}

export async function listStages(request: APIRequestContext): Promise<readonly StageListItem[]> {
  const { items } = await send(request, 'GET', '/api/stages', stageListResponseSchema);
  return items;
}

export async function findStage(request: APIRequestContext, name: string): Promise<StageListItem> {
  const stage = (await listStages(request)).find((item) => item.name === name);
  if (stage === undefined) {
    throw new ArrangeError(`No stage named ${name}`);
  }
  return stage;
}

export function createDeal(request: APIRequestContext, input: CreateDealRequest): Promise<Deal> {
  return send(request, 'POST', '/api/deals', dealSchema, input);
}

export function moveDeal(
  request: APIRequestContext,
  id: string,
  input: MoveDealRequest,
): Promise<Deal> {
  return send(request, 'POST', `/api/deals/${id}/move`, dealSchema, input);
}

export function createTask(request: APIRequestContext, input: CreateTaskRequest): Promise<Task> {
  return send(request, 'POST', '/api/tasks', taskSchema, input);
}

export function createInvite(request: APIRequestContext): Promise<CreatedInviteResponse> {
  return send(request, 'POST', '/api/invites', createdInviteResponseSchema);
}

export function joinByInvite(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<SessionResponse> {
  const body: InviteRegisterRequest = {
    token,
    name,
    email: uniqueEmail('manager'),
    password: PASSWORD,
  };
  return send(request, 'POST', '/api/auth/invite/register', sessionResponseSchema, body);
}

export async function firstClientId(request: APIRequestContext): Promise<string> {
  const { items } = await send(request, 'GET', '/api/clients?limit=1', clientListResponseSchema);
  const [client] = items;
  if (client === undefined) {
    throw new ArrangeError('The workspace has no clients');
  }
  return client.id;
}

export async function firstDealId(request: APIRequestContext): Promise<string> {
  const { columns } = await send(request, 'GET', '/api/deals/board', boardResponseSchema);
  const deal = columns.flatMap(({ deals }) => deals)[0];
  if (deal === undefined) {
    throw new ArrangeError('The board has no deals');
  }
  return deal.id;
}
