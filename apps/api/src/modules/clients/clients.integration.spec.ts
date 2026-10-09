import { agent } from 'supertest';
import type { Agent, Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clientListResponseSchema, clientResponseSchema } from '@clientry/shared/clients';
import type { Client } from '@clientry/shared/clients';
import { apiProblemSchema } from '@clientry/shared/common';

import { createTestApp } from '../../../test/create-test-app.js';
import type { TestApp } from '../../../test/create-test-app.js';
import { addManager, registerAccount } from '../../../test/fixtures/accounts.js';
import type { TestAccount } from '../../../test/fixtures/accounts.js';
import { createClient } from '../../../test/fixtures/clients.js';
import { resetDatabase } from '../../../test/reset-database.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const UNKNOWN_ID = '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b';

function problemCode(response: Response): string {
  return apiProblemSchema.parse(response.body).code;
}

function errorPaths(response: Response): string[] {
  return (apiProblemSchema.parse(response.body).errors ?? []).map(({ path }) => path);
}

describe('clients API', () => {
  let testApp: TestApp;
  let prisma: PrismaService;
  let owner: TestAccount;
  let stranger: TestAccount;

  function send(): Agent {
    return agent(testApp.app.getHttpServer());
  }

  async function storedRow(id: string): Promise<Record<string, unknown> | null> {
    return prisma.client.findUnique({ where: { id } });
  }

  async function listIds(account: TestAccount, query = ''): Promise<string[]> {
    const response = await account.http.get(`/api/clients${query}`).expect(200);
    return clientListResponseSchema.parse(response.body).items.map(({ id }) => id);
  }

  async function tagNames(account: TestAccount): Promise<string[]> {
    const response = await account.http.get('/api/clients/tags').expect(200);
    return (response.body as { items: { tag: string }[] }).items.map(({ tag }) => tag);
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    owner = await registerAccount(testApp, 'Pixel Studio');
    stranger = await registerAccount(testApp, 'Other Studio');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('create', () => {
    it('should answer 201 with the client created by the caller when the body is valid', async () => {
      const response = await owner.http
        .post('/api/clients')
        .send({ name: 'Romashka LLC', source: 'telegram', notes: 'Line one\nLine two' });

      expect(response.status).toBe(201);
      const client = clientResponseSchema.parse(response.body);
      expect(client).toMatchObject({
        name: 'Romashka LLC',
        source: 'telegram',
        notes: 'Line one\nLine two',
        createdBy: { id: owner.session.user.id, name: 'Ann' },
      });
    });

    it('should store blank optional fields as NULL when they are empty strings', async () => {
      const client = await createClient(owner.http, {
        name: 'Ann',
        company: '  ',
        email: '',
        phone: '',
        notes: '',
      });

      expect(client).toMatchObject({ company: null, email: null, phone: null, notes: null });
      expect(await storedRow(client.id)).toMatchObject({ company: null, email: null });
    });

    it('should normalize the email and the tags when they have capitals and spaces', async () => {
      const client = await createClient(owner.http, {
        name: 'Ann',
        email: ' Ann@X.COM ',
        tags: [' VIP ', 'Warm'],
      });

      expect(client).toMatchObject({ email: 'ann@x.com', tags: ['vip', 'warm'] });
    });

    it('should ignore workspaceId, createdById and deletedAt when the body carries them', async () => {
      const response = await owner.http.post('/api/clients').send({
        name: 'Ann',
        workspaceId: stranger.session.workspace.id,
        createdById: stranger.session.user.id,
        deletedAt: new Date().toISOString(),
      });

      const client = clientResponseSchema.parse(response.body);
      expect(await storedRow(client.id)).toMatchObject({
        workspaceId: owner.session.workspace.id,
        createdById: owner.session.user.id,
        deletedAt: null,
      });
    });

    it('should answer 400 with errors on name, email and tags.1 when they are invalid', async () => {
      const response = await owner.http
        .post('/api/clients')
        .send({ name: ' ', email: 'ann@', tags: ['ok', 'a,b'] });

      expect(response.status).toBe(400);
      expect(errorPaths(response).toSorted()).toEqual(['email', 'name', 'tags.1']);
    });
  });

  describe('get', () => {
    it('should answer 200 with the client when it belongs to the workspace', async () => {
      const client = await createClient(owner.http);

      const response = await owner.http.get(`/api/clients/${client.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(client);
    });

    it('should answer 404 CLIENT_NOT_FOUND when the client is in another workspace', async () => {
      const client = await createClient(stranger.http);

      const response = await owner.http.get(`/api/clients/${client.id}`);

      expect(response.status).toBe(404);
      expect(problemCode(response)).toBe('CLIENT_NOT_FOUND');
    });

    it('should answer 404 when the client is deleted', async () => {
      const client = await createClient(owner.http);
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      const response = await owner.http.get(`/api/clients/${client.id}`);

      expect(response.status).toBe(404);
    });

    it('should answer 400 on id when the id is not a UUID', async () => {
      const response = await owner.http.get('/api/clients/not-a-uuid');

      expect(response.status).toBe(400);
      expect(errorPaths(response)).toEqual(['id']);
    });
  });

  describe('update', () => {
    let client: Client;

    beforeEach(async () => {
      client = await createClient(owner.http, {
        name: 'Romashka LLC',
        company: 'Romashka',
        email: 'hello@romashka.example',
        phone: '+375 29 123-45-67',
      });
    });

    it('should change only the sent fields and move updated_at when a field changes', async () => {
      const response = await owner.http
        .patch(`/api/clients/${client.id}`)
        .send({ company: 'Romashka Group' });

      expect(response.status).toBe(200);
      const updated = clientResponseSchema.parse(response.body);
      expect(updated).toMatchObject({ name: client.name, company: 'Romashka Group' });
      expect(updated.email).toBe(client.email);
      expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(client.updatedAt));
    });

    it('should clear the fields when they are sent as null and as an empty string', async () => {
      const response = await owner.http
        .patch(`/api/clients/${client.id}`)
        .send({ company: null, phone: '' });

      expect(response.body).toMatchObject({ company: null, phone: null });
    });

    it('should answer 200 and keep updated_at when the body is empty', async () => {
      const response = await owner.http.patch(`/api/clients/${client.id}`).send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual(client);
    });

    it('should answer 404 and leave the row unchanged when the client is in another workspace', async () => {
      const response = await stranger.http
        .patch(`/api/clients/${client.id}`)
        .send({ name: 'Hijacked' });

      expect(response.status).toBe(404);
      expect(await storedRow(client.id)).toMatchObject({ name: 'Romashka LLC' });
    });

    it('should answer 404 when the client is deleted', async () => {
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      const response = await owner.http.patch(`/api/clients/${client.id}`).send({ name: 'New' });

      expect(response.status).toBe(404);
    });
  });

  describe('delete', () => {
    it('should answer 204 and hide the client everywhere when the owner deletes a manager client', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const client = await createClient(manager.http, { name: 'Romashka', tags: ['vip'] });

      const response = await owner.http.delete(`/api/clients/${client.id}`);

      expect(response.status).toBe(204);
      expect((await storedRow(client.id))?.deletedAt).toBeInstanceOf(Date);
      await owner.http.get(`/api/clients/${client.id}`).expect(404);
      expect(await listIds(owner)).toEqual([]);
      expect(await listIds(owner, '?q=roma')).toEqual([]);
      expect(await tagNames(owner)).toEqual([]);
    });

    it('should answer 204 when a manager deletes their own client', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const client = await createClient(manager.http);

      const response = await manager.http.delete(`/api/clients/${client.id}`);

      expect(response.status).toBe(204);
    });

    it('should answer 403 CLIENT_DELETE_FORBIDDEN and keep the row when a manager deletes the owner client', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const client = await createClient(owner.http);

      const response = await manager.http.delete(`/api/clients/${client.id}`);

      expect(response.status).toBe(403);
      expect(problemCode(response)).toBe('CLIENT_DELETE_FORBIDDEN');
      expect((await storedRow(client.id))?.deletedAt).toBeNull();
    });

    it('should answer 404 when the client is deleted again', async () => {
      const client = await createClient(owner.http);
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      const response = await owner.http.delete(`/api/clients/${client.id}`);

      expect(response.status).toBe(404);
    });

    it('should answer 404 and keep the row when the client is in another workspace', async () => {
      const client = await createClient(stranger.http);

      const response = await owner.http.delete(`/api/clients/${client.id}`);

      expect(response.status).toBe(404);
      expect((await storedRow(client.id))?.deletedAt).toBeNull();
    });
  });

  describe('restore', () => {
    it('should answer 200, move updated_at and put the client back in the list when it was deleted', async () => {
      const client = await createClient(owner.http);
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      const { updatedAt } = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
      const response = await owner.http.post(`/api/clients/${client.id}/restore`);

      expect(response.status).toBe(200);
      const restored = clientResponseSchema.parse(response.body);
      expect(restored.id).toBe(client.id);
      expect(updatedAt.getTime()).toBeGreaterThan(Date.parse(client.updatedAt));
      expect(Date.parse(restored.updatedAt)).toBeGreaterThan(updatedAt.getTime());
      expect(await listIds(owner)).toEqual([client.id]);
    });

    it('should answer 200 with the client unchanged when it is active', async () => {
      const client = await createClient(owner.http);

      const response = await owner.http.post(`/api/clients/${client.id}/restore`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(client);
    });

    it('should answer 403 when a manager restores the owner deleted client', async () => {
      const manager = await addManager(testApp, owner.session.workspace.id);
      const client = await createClient(owner.http);
      await owner.http.delete(`/api/clients/${client.id}`).expect(204);

      const response = await manager.http.post(`/api/clients/${client.id}/restore`);

      expect(response.status).toBe(403);
      expect(problemCode(response)).toBe('CLIENT_DELETE_FORBIDDEN');
    });

    it('should answer 404 when the client is in another workspace', async () => {
      const client = await createClient(stranger.http);
      await stranger.http.delete(`/api/clients/${client.id}`).expect(204);

      const response = await owner.http.post(`/api/clients/${client.id}/restore`);

      expect(response.status).toBe(404);
      expect((await storedRow(client.id))?.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('access', () => {
    it.each([
      ['get', '/api/clients'],
      ['get', '/api/clients/tags'],
      ['post', '/api/clients'],
      ['get', `/api/clients/${UNKNOWN_ID}`],
      ['patch', `/api/clients/${UNKNOWN_ID}`],
      ['delete', `/api/clients/${UNKNOWN_ID}`],
      ['post', `/api/clients/${UNKNOWN_ID}/restore`],
    ] as const)('should answer 401 when %s %s gets no access cookie', async (method, path) => {
      const response = await send()[method](path);

      expect(response.status).toBe(401);
      expect(problemCode(response)).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should answer 403 UNTRUSTED_ORIGIN when a POST comes from an untrusted origin', async () => {
      const response = await owner.http
        .post('/api/clients')
        .set('Origin', 'https://evil.example')
        .send({ name: 'Ann' });

      expect(response.status).toBe(403);
      expect(problemCode(response)).toBe('UNTRUSTED_ORIGIN');
    });
  });

  describe('schema', () => {
    it('should give name the und-x-icu collation and install pg_trgm when migrations ran', async () => {
      const [column] = await prisma.$queryRaw<{ collation: string | null }[]>`
        SELECT collation_name AS collation FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'name'`;
      const extensions = await prisma.$queryRaw<{ name: string }[]>`
        SELECT extname AS name FROM pg_extension WHERE extname = 'pg_trgm'`;

      expect(column?.collation).toBe('und-x-icu');
      expect(extensions).toHaveLength(1);
    });
  });
});
