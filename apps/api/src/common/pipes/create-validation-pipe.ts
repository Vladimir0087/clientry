import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { StandardSchemaValidationPipeOptions } from '@nestjs/common';

import type { FieldError } from '@clientry/shared/common';

import { RequestValidationError } from '../errors/request-validation.error.js';

type ValidationIssues = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0];
type PathSegment = NonNullable<ValidationIssues[number]['path']>[number];

function toPathSegment(segment: PathSegment): string {
  return typeof segment === 'object' ? String(segment.key) : String(segment);
}

export function toFieldErrors(issues: ValidationIssues): FieldError[] {
  return issues.map((issue) => ({
    path: (issue.path ?? []).map(toPathSegment).join('.'),
    message: issue.message,
  }));
}

export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new RequestValidationError(toFieldErrors(issues)),
  });
}
