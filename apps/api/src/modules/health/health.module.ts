import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { HealthRepository } from './health.repository.js';
import { HealthService } from './health.service.js';
import { PrismaHealthRepository } from './prisma-health.repository.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { RedisModule } from '../../infra/redis/redis.module.js';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: HealthRepository, useClass: PrismaHealthRepository }],
})
export class HealthModule {}
