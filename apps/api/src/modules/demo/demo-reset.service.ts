import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { buildDemoWorkspace } from './demo-workspace.js';
import { DemoRepository } from './demo.repository.js';
import { PasswordHasher } from '../auth/password-hasher.js';

@Injectable()
export class DemoResetService {
  private readonly logger = new Logger(DemoResetService.name);

  constructor(
    private readonly demo: DemoRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  // A failure rolls the whole reset back and leaves the previous demo as it was.
  async reset(now: Date): Promise<void> {
    const startedAt = performance.now();
    const demo = buildDemoWorkspace(now);
    await this.demo.replace(demo, () => this.unusableHash());
    this.logger.log(
      {
        workspaceId: demo.workspace.id,
        clients: demo.clients.length,
        deals: demo.deals.length,
        tasks: demo.tasks.length,
        activities: demo.activities.length,
        notifications: demo.notifications.length,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'Demo workspace reset',
    );
  }

  // The hash of random bytes nobody keeps: no password opens a demo account.
  private unusableHash(): Promise<string> {
    return this.hasher.hash(randomBytes(32).toString('base64url'));
  }
}
