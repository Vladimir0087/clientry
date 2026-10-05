import type { z } from 'zod';

import { apiProblemSchema } from '@clientry/shared/common';

import { ApiError, UNEXPECTED_RESPONSE } from './api-error';
import { ResponseContractError } from './response-contract-error';

const DELAY_SECONDS = /^\d+$/;
const REQUEST_ID_HEADER = 'X-Request-Id';

// Delay seconds only: the API's rate limiter never sends an HTTP date.
function parseRetryAfter(value: string | null): number | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && DELAY_SECONDS.test(trimmed) ? Number(trimmed) : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
  const problem = apiProblemSchema.safeParse(parseJson(await response.text()));
  if (!problem.success) {
    return new ApiError({
      status: response.status,
      code: UNEXPECTED_RESPONSE,
      requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
      retryAfterSeconds,
    });
  }
  const { code, detail, requestId, errors } = problem.data;
  return new ApiError({
    status: response.status,
    code,
    detail,
    requestId,
    errors,
    retryAfterSeconds,
  });
}

export async function parseSuccessBody<T>(
  response: Response,
  schema: z.ZodType<T>,
  path: string,
): Promise<T> {
  const body = schema.safeParse(parseJson(await response.text()));
  if (!body.success) {
    throw new ResponseContractError(path, body.error);
  }
  return body.data;
}
