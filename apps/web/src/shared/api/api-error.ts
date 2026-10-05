import type { FieldError } from '@clientry/shared/common';

// The body was not problem details, e.g. an HTML 502 from a proxy while the API wakes up.
export const UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE';

export interface ApiErrorDetails {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly requestId?: string;
  readonly errors?: readonly FieldError[];
  readonly retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;
  readonly errors: readonly FieldError[];
  readonly retryAfterSeconds: number | undefined;

  constructor(details: ApiErrorDetails) {
    super(`API responded with ${String(details.status)} ${details.code}`);
    this.name = 'ApiError';
    this.status = details.status;
    this.code = details.code;
    this.detail = details.detail;
    this.requestId = details.requestId;
    this.errors = details.errors ?? [];
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}
