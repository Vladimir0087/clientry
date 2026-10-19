import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { Client, ClientListQuery } from '@clientry/shared/clients';

import { encodeClientCursor } from './client-cursor.js';
import type { ClientOwnership, ClientsRepository } from './clients.repository.js';
import { ClientsService } from './clients.service.js';
import { ClientDeleteForbiddenError, ClientNotFoundError } from './errors.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';

const WORKSPACE_ID = '0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e';
const OWNER: AuthUser = {
  id: '0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  workspaceId: WORKSPACE_ID,
  role: 'owner',
  isDemo: false,
};
const MANAGER: AuthUser = {
  id: '0199a3c4-6a7b-7c8d-9e0f-1a2b3c4d5e6f',
  workspaceId: WORKSPACE_ID,
  role: 'manager',
  isDemo: false,
};
const CLIENT_ID = '0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b';

const CLIENT: Client = {
  id: CLIENT_ID,
  name: 'Romashka LLC',
  company: 'Romashka',
  email: 'hello@romashka.example',
  phone: '+375 29 123-45-67',
  source: 'telegram',
  notes: 'Wants a landing page.',
  tags: ['warm'],
  createdBy: { id: OWNER.id, name: 'Ann' },
  createdAt: '2026-10-08T09:30:00.000Z',
  updatedAt: '2026-10-08T09:30:00.000Z',
};

const BASE_QUERY: ClientListQuery = { sort: 'newest', limit: 25 };

function ownedBy(user: AuthUser, isDeleted = false): ClientOwnership {
  return { createdById: user.id, isDeleted };
}

function createRepositoryMock() {
  return {
    create: vi.fn<ClientsRepository['create']>().mockResolvedValue(CLIENT),
    findById: vi.fn<ClientsRepository['findById']>().mockResolvedValue(CLIENT),
    list: vi.fn<ClientsRepository['list']>().mockResolvedValue({ items: [], hasMore: false }),
    listTags: vi.fn<ClientsRepository['listTags']>().mockResolvedValue([]),
    update: vi.fn<ClientsRepository['update']>().mockResolvedValue(CLIENT),
    findOwnership: vi.fn<ClientsRepository['findOwnership']>().mockResolvedValue(ownedBy(OWNER)),
    softDelete: vi.fn<ClientsRepository['softDelete']>().mockResolvedValue(true),
    restore: vi.fn<ClientsRepository['restore']>().mockResolvedValue(CLIENT),
  } satisfies ClientsRepository;
}

describe('ClientsService', () => {
  let repository: ReturnType<typeof createRepositoryMock>;
  let service: ClientsService;
  let logSpy: MockInstance<Logger['log']>;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new ClientsService(repository);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should pass the workspace and the caller from AuthUser when a client is created', async () => {
      await service.create(MANAGER, { name: 'Romashka LLC' });

      expect(repository.create).toHaveBeenCalledWith(WORKSPACE_ID, MANAGER.id, {
        name: 'Romashka LLC',
        company: null,
        email: null,
        phone: null,
        source: null,
        notes: null,
        tags: [],
      });
    });

    it('should store blank text as null when optional fields are empty strings', async () => {
      await service.create(OWNER, { name: 'Ann', company: '', email: '', notes: '' });

      expect(repository.create).toHaveBeenCalledWith(
        WORKSPACE_ID,
        OWNER.id,
        expect.objectContaining({ company: null, email: null, notes: null }),
      );
    });

    it('should log ids and no personal data when a client is created', async () => {
      await service.create(OWNER, { name: CLIENT.name, email: CLIENT.email, phone: CLIENT.phone });

      expect(logSpy).toHaveBeenCalledWith(
        { clientId: CLIENT_ID, workspaceId: WORKSPACE_ID, userId: OWNER.id },
        'Client created',
      );
      const logged = JSON.stringify(logSpy.mock.calls);
      expect(logged).not.toContain(CLIENT.name);
      expect(logged).not.toContain('romashka.example');
      expect(logged).not.toContain('123-45-67');
    });
  });

  describe('missing client', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(null);
      repository.update.mockResolvedValue(null);
      repository.findOwnership.mockResolvedValue(null);
    });

    it('should throw ClientNotFoundError when get finds nothing', async () => {
      await expect(service.get(OWNER, CLIENT_ID)).rejects.toBeInstanceOf(ClientNotFoundError);
    });

    it('should throw ClientNotFoundError when update finds nothing', async () => {
      await expect(service.update(OWNER, CLIENT_ID, { name: 'New' })).rejects.toBeInstanceOf(
        ClientNotFoundError,
      );
    });

    it('should throw ClientNotFoundError when delete finds nothing', async () => {
      await expect(service.delete(OWNER, CLIENT_ID)).rejects.toBeInstanceOf(ClientNotFoundError);
    });

    it('should throw ClientNotFoundError when restore finds nothing', async () => {
      await expect(service.restore(OWNER, CLIENT_ID)).rejects.toBeInstanceOf(ClientNotFoundError);
    });
  });

  describe('update', () => {
    it('should send only the given fields with blanks as null when some fields change', async () => {
      await service.update(OWNER, CLIENT_ID, { company: '', phone: null });

      const [, , changes] = repository.update.mock.calls[0] ?? [];
      expect(changes).toMatchObject({ company: null, phone: null });
      expect(changes?.name).toBeUndefined();
    });

    it('should read the client without writing when the body is empty', async () => {
      const client = await service.update(OWNER, CLIENT_ID, {});

      expect(client).toEqual(CLIENT);
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.findById).toHaveBeenCalledWith(WORKSPACE_ID, CLIENT_ID);
    });
  });

  describe('delete', () => {
    it('should throw ClientDeleteForbiddenError and write nothing when a manager deletes another user client', async () => {
      repository.findOwnership.mockResolvedValue(ownedBy(OWNER));

      await expect(service.delete(MANAGER, CLIENT_ID)).rejects.toBeInstanceOf(
        ClientDeleteForbiddenError,
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it.each([
      ['a manager deletes their own client', MANAGER, ownedBy(MANAGER)],
      ['the owner deletes a manager client', OWNER, ownedBy(MANAGER)],
    ])('should soft-delete when %s', async (_case, user, ownership) => {
      repository.findOwnership.mockResolvedValue(ownership);

      await service.delete(user, CLIENT_ID);

      expect(repository.softDelete).toHaveBeenCalledWith(WORKSPACE_ID, CLIENT_ID, expect.any(Date));
    });

    it('should throw ClientNotFoundError when the client is already deleted', async () => {
      repository.findOwnership.mockResolvedValue(ownedBy(OWNER, true));

      await expect(service.delete(OWNER, CLIENT_ID)).rejects.toBeInstanceOf(ClientNotFoundError);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw ClientNotFoundError when the soft delete finds no row', async () => {
      repository.softDelete.mockResolvedValue(false);

      await expect(service.delete(OWNER, CLIENT_ID)).rejects.toBeInstanceOf(ClientNotFoundError);
    });

    it('should log ids when a client is deleted', async () => {
      await service.delete(OWNER, CLIENT_ID);

      expect(logSpy).toHaveBeenCalledWith(
        { clientId: CLIENT_ID, workspaceId: WORKSPACE_ID, userId: OWNER.id },
        'Client deleted',
      );
    });
  });

  describe('restore', () => {
    it('should throw ClientDeleteForbiddenError and write nothing when a manager restores another user client', async () => {
      repository.findOwnership.mockResolvedValue(ownedBy(OWNER, true));

      await expect(service.restore(MANAGER, CLIENT_ID)).rejects.toBeInstanceOf(
        ClientDeleteForbiddenError,
      );
      expect(repository.restore).not.toHaveBeenCalled();
    });

    it('should restore when a manager restores their own deleted client', async () => {
      repository.findOwnership.mockResolvedValue(ownedBy(MANAGER, true));

      await expect(service.restore(MANAGER, CLIENT_ID)).resolves.toEqual(CLIENT);
      expect(repository.restore).toHaveBeenCalledWith(WORKSPACE_ID, CLIENT_ID);
    });

    it('should restore when the owner restores a manager deleted client', async () => {
      repository.findOwnership.mockResolvedValue(ownedBy(MANAGER, true));

      await expect(service.restore(OWNER, CLIENT_ID)).resolves.toEqual(CLIENT);
      expect(repository.restore).toHaveBeenCalledWith(WORKSPACE_ID, CLIENT_ID);
    });

    it('should throw ClientNotFoundError when the restore finds no row', async () => {
      repository.restore.mockResolvedValue(null);

      await expect(service.restore(OWNER, CLIENT_ID)).rejects.toBeInstanceOf(ClientNotFoundError);
    });

    it('should log ids when a deleted client is restored', async () => {
      repository.findOwnership.mockResolvedValue(ownedBy(OWNER, true));

      await service.restore(OWNER, CLIENT_ID);

      expect(logSpy).toHaveBeenCalledWith(
        { clientId: CLIENT_ID, workspaceId: WORKSPACE_ID, userId: OWNER.id },
        'Client restored',
      );
    });
  });

  describe('list', () => {
    it('should resolve createdBy me to the caller and a source to a list when both are given', async () => {
      await service.list(MANAGER, {
        ...BASE_QUERY,
        q: 'rom',
        source: 'telegram',
        tag: 'vip',
        createdBy: 'me',
      });

      expect(repository.list).toHaveBeenCalledWith(
        WORKSPACE_ID,
        { search: 'rom', sources: ['telegram'], tags: ['vip'], createdById: MANAGER.id },
        { sort: 'newest', after: null, limit: 25 },
      );
    });

    it('should ignore the search when it is blank', async () => {
      await service.list(OWNER, { ...BASE_QUERY, q: '' });

      const [, filter] = repository.list.mock.calls[0] ?? [];
      expect(filter?.search).toBeUndefined();
    });

    it('should throw RequestValidationError on cursor when the cursor is invalid', async () => {
      const result = service.list(OWNER, { ...BASE_QUERY, cursor: 'garbage!' });

      await expect(result).rejects.toBeInstanceOf(RequestValidationError);
      await expect(result).rejects.toMatchObject({
        fieldErrors: [{ path: 'cursor', message: 'Invalid cursor' }],
      });
    });

    it('should pass the decoded cursor when the cursor is valid', async () => {
      const after = { sort: 'name_asc', value: 'Romashka', id: CLIENT_ID } as const;

      await service.list(OWNER, {
        ...BASE_QUERY,
        sort: 'name_asc',
        cursor: encodeClientCursor(after),
      });

      const [, , page] = repository.list.mock.calls[0] ?? [];
      expect(page?.after).toEqual(after);
    });

    it('should build the next cursor from the last item when more rows exist', async () => {
      repository.list.mockResolvedValue({ items: [CLIENT], hasMore: true });

      const response = await service.list(OWNER, BASE_QUERY);

      expect(response.nextCursor).toBe(
        encodeClientCursor({ sort: 'newest', value: CLIENT.createdAt, id: CLIENT_ID }),
      );
    });

    it('should return no next cursor when the page is the last one', async () => {
      repository.list.mockResolvedValue({ items: [CLIENT], hasMore: false });

      const response = await service.list(OWNER, BASE_QUERY);

      expect(response.nextCursor).toBeNull();
    });
  });
});
