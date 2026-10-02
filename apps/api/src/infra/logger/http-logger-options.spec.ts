import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { resolveRequestLogLevel, serializeRequest } from './http-logger-options.js';

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

describe('serializeRequest', () => {
  it('should log the path without the query string when the url has one', () => {
    const standardSerialized = {
      id: 'req-1',
      method: 'GET',
      url: '/api/invites/accept?token=secret&email=a@b.co',
      query: { token: 'secret', email: 'a@b.co' },
      headers: { host: 'api' },
    };

    const serialized = serializeRequest(standardSerialized);

    expect(serialized).toMatchObject({ id: 'req-1', url: '/api/invites/accept' });
    expect(JSON.stringify(serialized)).not.toMatch(/secret|a@b\.co|query/);
  });
});
