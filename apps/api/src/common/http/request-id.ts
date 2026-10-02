import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const REQUEST_ID_HEADER = 'X-Request-Id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(header: string | string[] | undefined): string {
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();
}

export function requestIdMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): void {
  const requestId = resolveRequestId(request.headers['x-request-id']);
  // pino-http keeps an id that is already set, so logs and responses share this one.
  request.id = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(request: IncomingMessage): string {
  return typeof request.id === 'string' ? request.id : '';
}
