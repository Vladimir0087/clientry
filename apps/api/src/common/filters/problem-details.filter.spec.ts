import { Logger, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from './problem-details.filter.js';
import { ServiceUnavailableError } from '../errors/service-unavailable.error.js';

class NotReadyError extends ServiceUnavailableError {
  constructor() {
    super('NOT_READY', 'Not ready');
  }
}

interface ResponseStub {
  readonly response: Response;
  readonly status: ReturnType<typeof vi.fn>;
  readonly type: ReturnType<typeof vi.fn>;
  readonly json: ReturnType<typeof vi.fn>;
  readonly end: ReturnType<typeof vi.fn>;
}

function createResponse(hasSentHeaders = false): ResponseStub {
  const status = vi.fn();
  const type = vi.fn();
  const json = vi.fn();
  const end = vi.fn();
  const response = { headersSent: hasSentHeaders, status, type, json, end } as unknown as Response;
  status.mockReturnValue(response);
  type.mockReturnValue(response);
  return { response, status, type, json, end };
}

function createHost(originalUrl: string, response: Response): ArgumentsHost {
  const request = { originalUrl, method: 'GET', id: 'req-1' } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('ProblemDetailsFilter', () => {
  let loggedErrors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggedErrors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should answer with problem+json when an exception is caught', () => {
    const stub = createResponse();

    new ProblemDetailsFilter().catch(new NotFoundException(), createHost('/api/x', stub.response));

    expect(stub.status).toHaveBeenCalledWith(404);
    expect(stub.type).toHaveBeenCalledWith('application/problem+json');
  });

  it('should drop the query string from instance when the url has one', () => {
    const stub = createResponse();

    new ProblemDetailsFilter().catch(
      new NotFoundException(),
      createHost('/api/clients?search=secret', stub.response),
    );

    expect(stub.json).toHaveBeenCalledWith(
      expect.objectContaining({ instance: '/api/clients', requestId: 'req-1' }),
    );
  });

  it('should log the error when an unknown error becomes 500', () => {
    const stub = createResponse();

    new ProblemDetailsFilter().catch(new Error('boom'), createHost('/api/x', stub.response));

    expect(loggedErrors).toHaveBeenCalledOnce();
  });

  it('should end the response without a body when headers are already sent', () => {
    const stub = createResponse(true);

    new ProblemDetailsFilter().catch(
      new Error('stream broke'),
      createHost('/api/x', stub.response),
    );

    expect(stub.end).toHaveBeenCalledOnce();
    expect(stub.status).not.toHaveBeenCalled();
    expect(stub.json).not.toHaveBeenCalled();
  });

  it.each([
    ['a 4xx error', new NotFoundException()],
    ['an unavailable dependency', new NotReadyError()],
  ])('should not log when the exception is %s', (_case, exception) => {
    const stub = createResponse();

    new ProblemDetailsFilter().catch(exception, createHost('/api/x', stub.response));

    expect(loggedErrors).not.toHaveBeenCalled();
  });
});
