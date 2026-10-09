import {
  clientListResponseSchema,
  clientResponseSchema,
  clientSummarySchema,
} from '@clientry/shared/clients';
import type { Client, ClientListResponse, ClientSummary } from '@clientry/shared/clients';

import { TEST_SESSION } from './fixtures';

export const OTHER_USER = { id: '7c1e9b2a-3d4f-4a5b-8c6d-9e0f1a2b3c4d', name: 'Max Kay' };

export const TEST_CLIENT: Client = clientResponseSchema.parse({
  id: '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b',
  name: 'Romashka LLC',
  company: 'Romashka',
  email: 'hello@romashka.example',
  phone: '+375 (29) 123-45-67',
  source: 'telegram',
  notes: 'Wants a landing page.\nCall after 3 pm.',
  tags: ['landing', 'warm'],
  createdBy: { id: TEST_SESSION.user.id, name: TEST_SESSION.user.name },
  createdAt: '2026-10-08T09:30:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
});

function idFor(index: number): string {
  return `0199a3c4-0000-7000-8000-${String(index).padStart(12, '0')}`;
}

export function makeClient(index: number, overrides: Partial<Client> = {}): Client {
  return { ...TEST_CLIENT, id: idFor(index), name: `Client ${String(index)}`, ...overrides };
}

export function toSummary(client: Client): ClientSummary {
  return clientSummarySchema.parse(client);
}

export function clientPage(
  clients: readonly Client[],
  nextCursor: string | null = null,
): ClientListResponse {
  return clientListResponseSchema.parse({ items: clients.map(toSummary), nextCursor });
}

export const TEST_CLIENT_LIST: ClientListResponse = clientPage([TEST_CLIENT]);
