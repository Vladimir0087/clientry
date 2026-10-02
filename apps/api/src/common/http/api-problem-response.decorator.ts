import { ApiResponse } from '@nestjs/swagger';

import { apiProblemSchema } from '@clientry/shared/common';
import type { ApiProblem } from '@clientry/shared/common';

import { PROBLEM_TYPE, problemTitle } from './problem-details.js';

const EXAMPLE_REQUEST_ID = '0b6f4a1e-6c1d-4a3e-9f57-2a3c1d9e8b10';

export interface ProblemExample {
  readonly code: string;
  readonly detail: string;
  readonly instance: string;
  readonly errors?: ApiProblem['errors'];
}

export function ApiProblemResponse(
  status: number,
  example: ProblemExample,
): MethodDecorator & ClassDecorator {
  const body: ApiProblem = {
    type: PROBLEM_TYPE,
    title: problemTitle(status),
    status,
    requestId: EXAMPLE_REQUEST_ID,
    ...example,
  };
  return ApiResponse({
    status,
    description: body.title,
    standardSchema: apiProblemSchema,
    example: body,
  });
}
