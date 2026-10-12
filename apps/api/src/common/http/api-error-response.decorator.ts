import { HttpStatus } from '@nestjs/common';

import { ApiProblemResponse } from './api-problem-response.decorator.js';
import type { ProblemExample } from './api-problem-response.decorator.js';
import type { DomainError } from '../errors/domain-error.js';
import { UntrustedOriginError } from '../guards/untrusted-origin.error.js';

// Examples are built from the domain errors themselves, so documented codes and details match.
export function ApiErrorResponse(
  status: number,
  instance: string,
  ...[first, ...rest]: readonly [DomainError, ...DomainError[]]
): MethodDecorator & ClassDecorator {
  const toExample = (error: DomainError): ProblemExample => ({
    code: error.code,
    detail: error.message,
    instance,
  });
  return ApiProblemResponse(status, toExample(first), ...rest.map(toExample));
}

export function ApiUntrustedOrigin(instance: string): MethodDecorator & ClassDecorator {
  return ApiErrorResponse(HttpStatus.FORBIDDEN, instance, new UntrustedOriginError());
}

export function ApiInvalidRequest(
  instance: string,
  path: string,
  message: string,
): MethodDecorator & ClassDecorator {
  return ApiProblemResponse(HttpStatus.BAD_REQUEST, {
    code: 'VALIDATION_FAILED',
    detail: 'Request validation failed',
    instance,
    errors: [{ path, message }],
  });
}
