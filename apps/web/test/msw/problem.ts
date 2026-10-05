import { HttpResponse } from 'msw';

import type { FieldError } from '@clientry/shared/common';

export interface ProblemOverrides {
  readonly requestId?: string;
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
  readonly headers?: Readonly<Record<string, string>>;
}

export function problemResponse(
  status: number,
  code: string,
  { requestId = 'req-test', detail, errors, headers }: ProblemOverrides = {},
): HttpResponse<string> {
  const body = { type: 'about:blank', title: code, status, code, requestId, detail, errors };
  return new HttpResponse(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });
}
