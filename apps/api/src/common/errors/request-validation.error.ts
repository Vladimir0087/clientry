import type { FieldError } from '@clientry/shared/common';

import { DomainError } from './domain-error.js';

export class RequestValidationError extends DomainError {
  readonly fieldErrors: readonly FieldError[];

  constructor(fieldErrors: readonly FieldError[]) {
    super('VALIDATION_FAILED', 'Request validation failed');
    this.fieldErrors = fieldErrors;
  }
}
