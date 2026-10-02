import { Catch, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { toApiProblem } from './to-api-problem.js';
import { ServiceUnavailableError } from '../errors/service-unavailable.error.js';
import { PROBLEM_MEDIA_TYPE } from '../http/problem-details.js';
import { getRequestId } from '../http/request-id.js';
import { pathWithoutQuery } from '../http/request-path.js';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const instance = pathWithoutQuery(request.originalUrl);
    const problem = toApiProblem(exception, {
      method: request.method,
      instance,
      requestId: getRequestId(request),
    });

    // 4xx and unavailable dependencies are expected; the request log already has the status.
    const isUnexpected = problem.status >= 500 && !(exception instanceof ServiceUnavailableError);
    if (isUnexpected) {
      this.logger.error(
        { err: exception, method: request.method, path: instance },
        'Unhandled exception',
      );
    }
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(problem.status).type(PROBLEM_MEDIA_TYPE).json(problem);
  }
}
