import { Module } from '@nestjs/common';

import { TestOnlyController } from './test-only.controller.js';
import { PrismaModule } from '../../src/infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [TestOnlyController],
})
export class TestOnlyModule {}
