import type { Agent } from 'supertest';

import { clientResponseSchema } from '@clientry/shared/clients';
import type { Client, ClientSource, CreateClientRequest } from '@clientry/shared/clients';

import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import type { TestApp } from '../create-test-app.js';
import { TRUSTED_ORIGIN } from '../support/test-env.js';

export interface ClientSeed {
  readonly name: string;
  readonly createdById: string;
  readonly company?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly source?: ClientSource;
  readonly tags?: readonly string[];
  readonly createdAt?: Date;
}

export async function createClient(
  http: Agent,
  body: CreateClientRequest = { name: 'Romashka LLC' },
): Promise<Client> {
  const response = await http
    .post('/api/clients')
    .set('Origin', TRUSTED_ORIGIN)
    .send(body)
    .expect(201);
  return clientResponseSchema.parse(response.body);
}

// Inserted directly, so tests control created_at and skip one request per row; ids in order.
export async function insertClients(
  testApp: TestApp,
  workspaceId: string,
  seeds: readonly ClientSeed[],
): Promise<string[]> {
  const prisma = testApp.app.get(PrismaService);
  const ids: string[] = [];
  for (const seed of seeds) {
    const { id } = await prisma.client.create({
      data: { ...seed, tags: [...(seed.tags ?? [])], workspaceId },
      select: { id: true },
    });
    ids.push(id);
  }
  return ids;
}
