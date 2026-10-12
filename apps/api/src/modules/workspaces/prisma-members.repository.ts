import { Injectable } from '@nestjs/common';

import type { Member } from '@clientry/shared/workspaces';

import type { MembersRepository } from './members.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@Injectable()
export class PrismaMembersRepository implements MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<Member[]> {
    const rows = await this.prisma.membership.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return rows.map(({ role, createdAt, user }) => ({
      ...user,
      role,
      joinedAt: createdAt.toISOString(),
    }));
  }
}
