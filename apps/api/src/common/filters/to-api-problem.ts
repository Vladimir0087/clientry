import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';

import type { ApiProblem } from '@clientry/shared/common';

import { ConflictError } from '../errors/conflict.error.js';
import { DomainError } from '../errors/domain-error.js';
import { ForbiddenError } from '../errors/forbidden.error.js';
import { NotFoundError } from '../errors/not-found.error.js';
import { RequestValidationError } from '../errors/request-validation.error.js';
import { ServiceUnavailableError } from '../errors/service-unavailable.error.js';
import { PROBLEM_TYPE, problemTitle } from '../http/problem-details.js';

export interface ProblemContext {
  readonly method: string;
  readonly instance: string;
  readonly requestId: string;
}

interface ExposedHttpError extends Error {
  readonly status: number;
  readonly expose: true;
}

type DomainErrorKind = abstract new (...args: never[]) => DomainError;

const DOMAIN_ERROR_STATUSES: readonly (readonly [DomainErrorKind, HttpStatus])[] = [
  [RequestValidationError, HttpStatus.BAD_REQUEST],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [ServiceUnavailableError, HttpStatus.SERVICE_UNAVAILABLE],
];

const RESERVED_MEMBERS = new Set([
  'type',
  'title',
  'status',
  'code',
  'detail',
  'instance',
  'requestId',
  'errors',
]);

const GENERIC_DETAIL = 'An unexpected error occurred';

// How body-parser and other http-errors users report client errors such as 413 and 415.
function isExposedHttpError(error: unknown): error is ExposedHttpError {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500 &&
    'expose' in error &&
    error.expose === true
  );
}

function statusCode(status: number): string {
  const name: unknown = HttpStatus[status];
  if (typeof name === 'string') {
    return name;
  }
  return problemTitle(status)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, '_');
}

// Nest's route-not-found message carries the full URL; the query string may hold secrets.
function httpExceptionDetail(exception: HttpException, context: ProblemContext): string {
  if (exception.getStatus() >= 500) {
    return GENERIC_DETAIL;
  }
  const routeNotFound = `Cannot ${context.method} `;
  if (exception instanceof NotFoundException && exception.message.startsWith(routeNotFound)) {
    return `${routeNotFound}${context.instance}`;
  }
  return exception.message;
}

function domainStatus(error: DomainError): HttpStatus {
  const entry = DOMAIN_ERROR_STATUSES.find(([kind]) => error instanceof kind);
  return entry ? entry[1] : HttpStatus.INTERNAL_SERVER_ERROR;
}

function publicExtensions(error: DomainError): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(error.extensions).filter(([member]) => !RESERVED_MEMBERS.has(member)),
  );
}

function buildProblem(
  status: number,
  code: string,
  detail: string,
  context: ProblemContext,
): ApiProblem {
  return {
    type: PROBLEM_TYPE,
    title: problemTitle(status),
    status,
    code,
    detail,
    instance: context.instance,
    requestId: context.requestId,
  };
}

function fromDomainError(error: DomainError, context: ProblemContext): ApiProblem {
  const status = domainStatus(error);
  if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
    return buildProblem(status, statusCode(status), GENERIC_DETAIL, context);
  }
  const problem = buildProblem(status, error.code, error.message, context);
  const errors = error instanceof RequestValidationError ? { errors: [...error.fieldErrors] } : {};
  return { ...problem, ...errors, ...publicExtensions(error) };
}

export function toApiProblem(exception: unknown, context: ProblemContext): ApiProblem {
  if (exception instanceof DomainError) {
    return fromDomainError(exception, context);
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return buildProblem(
      status,
      statusCode(status),
      httpExceptionDetail(exception, context),
      context,
    );
  }
  if (isExposedHttpError(exception)) {
    return buildProblem(exception.status, statusCode(exception.status), exception.message, context);
  }
  const status = HttpStatus.INTERNAL_SERVER_ERROR;
  return buildProblem(status, statusCode(status), GENERIC_DETAIL, context);
}
