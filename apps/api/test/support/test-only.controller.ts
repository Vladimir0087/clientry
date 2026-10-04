import { setTimeout as delay } from 'node:timers/promises';

import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../src/common/auth/public.decorator.js';
import { ApiProblemResponse } from '../../src/common/http/api-problem-response.decorator.js';
import { ResponseSchema } from '../../src/common/http/response-schema.decorator.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';

const SLOW_REQUEST_DELAY_MS = 300;

const echoBodySchema = z.object({ name: z.string().min(1), email: z.email() });

type EchoBody = z.infer<typeof echoBodySchema>;

const echoResponseSchema = z.object({ received: z.record(z.string(), z.unknown()) });

type EchoResponse = z.infer<typeof echoResponseSchema>;

const publicUserSchema = z.object({ id: z.string() });

type PublicUser = z.infer<typeof publicUserSchema>;

const statusSchema = z.object({ status: z.literal('ok') });

type StatusResponse = z.infer<typeof statusSchema>;

const STORED_USERS = [
  { id: 'user-1', passwordHash: 'argon2id$secret-1' },
  { id: 'user-2', passwordHash: 'argon2id$secret-2' },
];

@Public()
@Controller('test')
export class TestOnlyController {
  private readonly slowRequestEntered = Promise.withResolvers<undefined>();

  constructor(private readonly prisma: PrismaService) {}

  whenSlowRequestEntered(): Promise<undefined> {
    return this.slowRequestEntered.promise;
  }

  @Post('echo')
  @ResponseSchema(HttpStatus.OK, echoResponseSchema)
  @ApiProblemResponse(HttpStatus.BAD_REQUEST, {
    code: 'VALIDATION_FAILED',
    detail: 'Request validation failed',
    instance: '/api/test/echo',
    errors: [{ path: 'email', message: 'Invalid email address' }],
  })
  @ApiProblemResponse(HttpStatus.INTERNAL_SERVER_ERROR, {
    code: 'INTERNAL_SERVER_ERROR',
    detail: 'An unexpected error occurred',
    instance: '/api/test/echo',
  })
  echo(@Body({ schema: echoBodySchema }) body: EchoBody): EchoResponse {
    return { received: body };
  }

  @Get('leaky')
  @ResponseSchema(HttpStatus.OK, publicUserSchema)
  getLeakyUser(): PublicUser {
    const user = { id: 'user-1', passwordHash: 'argon2id$secret' };
    return user;
  }

  @Get('users')
  @ResponseSchema(HttpStatus.OK, z.array(publicUserSchema))
  listUsers(): PublicUser[] {
    return STORED_USERS;
  }

  @Post('users')
  @ResponseSchema(HttpStatus.CREATED, publicUserSchema)
  createUser(): PublicUser {
    return { id: 'user-3' };
  }

  @Get('primitive')
  @ResponseSchema(HttpStatus.OK, publicUserSchema)
  getPrimitive(): string {
    return 'user-1';
  }

  @Get('no-schema')
  getWithoutSchema(): PublicUser {
    return { id: 'user-1' };
  }

  @Get('crash')
  crash(): never {
    throw new Error('database password is hunter2');
  }

  @Get('slow')
  @ResponseSchema(HttpStatus.OK, statusSchema)
  async getAfterDelay(): Promise<StatusResponse> {
    this.slowRequestEntered.resolve(undefined);
    await delay(SLOW_REQUEST_DELAY_MS);
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
