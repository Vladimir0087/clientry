import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import { DemoResetService } from './demo-reset.service.js';
import { buildDemoWorkspace } from './demo-workspace.js';
import type { DemoRepository } from './demo.repository.js';
import type { PasswordHasher } from '../auth/password-hasher.js';

const NOW = new Date('2026-10-18T09:41:27.512Z');

describe('DemoResetService', () => {
  let replace: Mock<DemoRepository['replace']>;
  let hash: Mock<PasswordHasher['hash']>;
  let log: MockInstance<Logger['log']>;
  let service: DemoResetService;

  beforeEach(() => {
    replace = vi.fn<DemoRepository['replace']>().mockResolvedValue(undefined);
    hash = vi.fn<PasswordHasher['hash']>().mockResolvedValue('unusable-hash');
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    service = new DemoResetService({ replace } satisfies DemoRepository, {
      hash,
    } as unknown as PasswordHasher);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass the rows built for now to the repository when the demo resets', async () => {
    await service.reset(NOW);

    const [demo] = replace.mock.calls[0] ?? [];
    const expected = buildDemoWorkspace(NOW);
    expect(demo?.workspace).toEqual(expected.workspace);
    expect(demo?.users).toEqual(expected.users);
    expect(demo?.clients.map(({ name, createdAt }) => [name, createdAt])).toEqual(
      expected.clients.map(({ name, createdAt }) => [name, createdAt]),
    );
  });

  it('should hash 32 random bytes for each user the repository creates when it asks', async () => {
    await service.reset(NOW);
    const [, unusableHash] = replace.mock.calls[0] ?? [];

    await expect(unusableHash?.()).resolves.toBe('unusable-hash');
    await unusableHash?.();
    const [first, second] = hash.mock.calls.map(([password]) => password);
    expect(first).toMatch(/^[\w-]{43}$/);
    expect(second).not.toBe(first);
  });

  it('should log the workspace, the counts and the duration when the demo resets', async () => {
    await service.reset(NOW);

    expect(log).toHaveBeenCalledWith(
      {
        workspaceId: '0199d0a0-0000-7000-8000-000000000100',
        clients: 40,
        deals: 45,
        tasks: 36,
        activities: expect.any(Number) as unknown,
        notifications: 7,
        durationMs: expect.any(Number) as unknown,
      },
      'Demo workspace reset',
    );
  });

  it('should propagate the error and log no reset when the repository fails', async () => {
    replace.mockRejectedValue(new Error('deadlock detected'));

    await expect(service.reset(NOW)).rejects.toThrow('deadlock detected');
    expect(log).not.toHaveBeenCalled();
  });
});
