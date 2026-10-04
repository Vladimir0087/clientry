import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { toApiProblem } from './to-api-problem.js';
import { ConflictError } from '../errors/conflict.error.js';
import { DomainError } from '../errors/domain-error.js';
import type { ProblemExtensions } from '../errors/domain-error.js';
import { ForbiddenError } from '../errors/forbidden.error.js';
import { NotFoundError } from '../errors/not-found.error.js';
import { RequestValidationError } from '../errors/request-validation.error.js';
import { ServiceUnavailableError } from '../errors/service-unavailable.error.js';
import { UnauthenticatedError } from '../errors/unauthenticated.error.js';

const CONTEXT = { method: 'GET', instance: '/api/clients', requestId: 'req-1' };

class ClientNotFoundError extends NotFoundError {
  constructor() {
    super('CLIENT_NOT_FOUND', 'Client not found');
  }
}

class NotAllowedError extends ForbiddenError {
  constructor() {
    super('NOT_ALLOWED', 'Not allowed');
  }
}

class DuplicateEmailError extends ConflictError {
  constructor() {
    super('DUPLICATE_EMAIL', 'Email is taken');
  }
}

class DependencyDownError extends ServiceUnavailableError {
  constructor(extensions: ProblemExtensions) {
    super('DEPENDENCY_DOWN', 'Dependency is down', extensions);
  }
}

class SignInRequiredError extends UnauthenticatedError {
  constructor() {
    super('SIGN_IN_REQUIRED', 'Sign in first');
  }
}

class UnmappedError extends DomainError {
  constructor() {
    super('UNMAPPED', 'internal detail');
  }
}

function httpError(status: number, isExposed: boolean): Error {
  return Object.assign(new Error('request entity too large'), { status, expose: isExposed });
}

describe('toApiProblem', () => {
  it.each([
    [new SignInRequiredError(), 401, 'SIGN_IN_REQUIRED'],
    [new ClientNotFoundError(), 404, 'CLIENT_NOT_FOUND'],
    [new NotAllowedError(), 403, 'NOT_ALLOWED'],
    [new DuplicateEmailError(), 409, 'DUPLICATE_EMAIL'],
    [new DependencyDownError({}), 503, 'DEPENDENCY_DOWN'],
  ])('should map the status and keep the code when %o is thrown', (error, status, code) => {
    const problem = toApiProblem(error, CONTEXT);

    expect(problem).toMatchObject({ status, code, detail: error.message });
  });

  it('should build the full body when a domain error is mapped', () => {
    const problem = toApiProblem(new ClientNotFoundError(), CONTEXT);

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'CLIENT_NOT_FOUND',
      detail: 'Client not found',
      instance: '/api/clients',
      requestId: 'req-1',
    });
  });

  it('should merge extensions into the body when the domain error has them', () => {
    const checks = { database: 'up', redis: 'down' };

    const problem = toApiProblem(new DependencyDownError({ checks }), CONTEXT);

    expect(problem).toMatchObject({ code: 'DEPENDENCY_DOWN', checks });
  });

  it('should keep core members when an extension collides with them', () => {
    const problem = toApiProblem(new DependencyDownError({ status: 200, code: 'OK' }), CONTEXT);

    expect(problem).toMatchObject({ status: 503, code: 'DEPENDENCY_DOWN' });
  });

  it('should add field errors when request validation fails', () => {
    const errors = [{ path: 'email', message: 'Invalid email address' }];

    const problem = toApiProblem(new RequestValidationError(errors), CONTEXT);

    expect(problem).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', errors });
  });

  it('should keep the status and derive the code when an HttpException is thrown', () => {
    const problem = toApiProblem(new ConflictException('Version changed'), CONTEXT);

    expect(problem).toMatchObject({
      status: 409,
      title: 'Conflict',
      code: 'CONFLICT',
      detail: 'Version changed',
    });
  });

  it('should build the detail without the query string when no route matches', () => {
    const exception = new NotFoundException('Cannot GET /api/clients?token=secret');

    const problem = toApiProblem(exception, CONTEXT);

    expect(problem).toMatchObject({ status: 404, detail: 'Cannot GET /api/clients' });
  });

  it('should keep the message when a NotFoundException is not about the route', () => {
    const problem = toApiProblem(new NotFoundException('Invite expired'), CONTEXT);

    expect(problem).toMatchObject({ status: 404, detail: 'Invite expired' });
  });

  it('should hide the message when an HttpException has a 5xx status', () => {
    const exception = new InternalServerErrorException('pool exhausted at db.internal');

    const problem = toApiProblem(exception, CONTEXT);

    expect(problem).toMatchObject({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      detail: 'An unexpected error occurred',
    });
  });

  it('should keep the message when a bad request comes from the body parser', () => {
    const problem = toApiProblem(new BadRequestException('Unexpected token'), CONTEXT);

    expect(problem).toMatchObject({ status: 400, code: 'BAD_REQUEST', detail: 'Unexpected token' });
  });

  it('should use the status when an exposed 4xx http error is thrown', () => {
    const problem = toApiProblem(httpError(413, true), CONTEXT);

    expect(problem).toMatchObject({
      status: 413,
      title: 'Payload Too Large',
      code: 'PAYLOAD_TOO_LARGE',
      detail: 'request entity too large',
    });
  });

  it.each([
    ['not exposed', httpError(413, false)],
    ['a 5xx status', httpError(502, true)],
  ])('should answer 500 when the http error is %s', (_case, error) => {
    const problem = toApiProblem(error, CONTEXT);

    expect(problem).toMatchObject({ status: 500, code: 'INTERNAL_SERVER_ERROR' });
  });

  it('should hide the message when an unknown error is thrown', () => {
    const problem = toApiProblem(new Error('connection string postgres://secret'), CONTEXT);

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      detail: 'An unexpected error occurred',
      instance: '/api/clients',
      requestId: 'req-1',
    });
  });

  it('should hide the message when a domain error has no known kind', () => {
    const problem = toApiProblem(new UnmappedError(), CONTEXT);

    expect(problem).toMatchObject({ status: 500, detail: 'An unexpected error occurred' });
  });
});
