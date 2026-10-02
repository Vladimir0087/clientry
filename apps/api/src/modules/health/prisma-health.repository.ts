import { Injectable } from '@nestjs/common';

import type { HealthRepository } from './health.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@Injectable()
export class PrismaHealthRepository implements HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async pingDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
