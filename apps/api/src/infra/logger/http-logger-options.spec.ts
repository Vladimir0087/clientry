import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { createLogger } from './create-logger.js';
import { resolveRequestLogLevel, serializeRequest } from './http-logger-options.js';
import type { SerializedRequest } from './http-logger-options.js';
import { createUnitConfig } from '../../../test/support/unit-config.js';

function request(originalUrl: string): Request {
  return { originalUrl } as Request;
}

function response(statusCode: number): Response {
  return { statusCode } as Response;
}

describe('resolveRequestLogLevel', () => {
  it.each(['/health/live', '/health/ready'])('should be silent when %s succeeds', (path) => {
    expect(resolveRequestLogLevel(request(path), response(200))).toBe('silent');
  });

  it('should log at error when the readiness probe answers 503', () => {
    expect(resolveRequestLogLevel(request('/health/ready'), response(503))).toBe('error');
  });

  it('should log at info when another request succeeds', () => {
    expect(resolveRequestLogLevel(request('/api/clients'), response(200))).toBe('info');
  });

  it('should log at warn when a request fails with a client error', () => {
    expect(resolveRequestLogLevel(request('/api/clients'), response(404))).toBe('warn');
  });

  it('should log at error when the response stream errored', () => {
    const level = resolveRequestLogLevel(
      request('/health/live'),
      response(200),
      new Error('reset'),
    );

    expect(level).toBe('error');
  });
});

function standardSerialized(
  overrides: Partial<Omit<SerializedRequest, 'raw'>> & { readonly ip?: string } = {},
): SerializedRequest {
  const { ip = '203.0.113.7', ...fields } = overrides;
  const serialized = { id: 'req-1', method: 'GET', url: '/api/auth/me', headers: {}, ...fields };
  // Non-enumerable, as pino's standard serializer defines it.
  Object.defineProperty(serialized, 'raw', { value: { ip }, enumerable: false });
  return serialized as SerializedRequest;
}

function logOneLine(request: SerializedRequest): Record<string, unknown> {
  const lines: string[] = [];
  const logger = createLogger(createUnitConfig({ LOG_LEVEL: 'info' }), {
    write: (line) => lines.push(line),
  });
  logger.info({ req: serializeRequest(request) }, 'request completed');
  const [line] = lines;
  if (line === undefined) {
    throw new Error('Expected one log line');
  }
  return JSON.parse(line) as Record<string, unknown>;
}

describe('serializeRequest', () => {
  it('should log the path without the query string when the url has one', () => {
    const request = Object.assign(
      standardSerialized({ url: '/api/invites/accept?token=secret&email=a@b.co' }),
      { query: { token: 'secret', email: 'a@b.co' } },
    );

    const serialized = serializeRequest(request);

    expect(serialized).toMatchObject({ id: 'req-1', url: '/api/invites/accept' });
    expect(JSON.stringify(serialized)).not.toMatch(/secret|a@b\.co|query/);
  });

  it('should log the client IP when Express resolved it', () => {
    const serialized = serializeRequest(standardSerialized({ ip: '198.51.100.23' }));

    expect(serialized.clientIp).toBe('198.51.100.23');
  });

  it('should drop the geolocation headers when Vercel proxied the request', () => {
    const request = standardSerialized({
      headers: {
        'x-vercel-ip-city': 'Berlin',
        'x-vercel-ip-latitude': '52.52',
        'x-vercel-id': 'fra1::abc',
        'x-forwarded-for': '198.51.100.23',
      },
    });

    const { headers } = serializeRequest(request);

    expect(headers).toEqual({ 'x-vercel-id': 'fra1::abc', 'x-forwarded-for': '198.51.100.23' });
  });

  it('should redact the cookie and authorization headers when the request is logged', () => {
    const request = standardSerialized({
      headers: { cookie: 'clientry_access=s3cret', authorization: 'Bearer s3cret' },
    });

    const entry = logOneLine(request);

    expect(entry.req).toMatchObject({
      headers: { cookie: '[REDACTED]', authorization: '[REDACTED]' },
    });
    expect(JSON.stringify(entry)).not.toMatch(/s3cret/);
  });
});
