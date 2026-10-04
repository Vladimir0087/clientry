import { Module } from '@nestjs/common';

import { ProtectedTestController } from './protected-test.controller.js';
import { TestOnlyController } from './test-only.controller.js';
import { PrismaModule } from '../../src/infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [TestOnlyController, ProtectedTestController],
})
export class TestOnlyModule {}
