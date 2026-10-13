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

// Validation examples share a code, so the field tells them apart.
function exampleName({ code, errors }: ApiProblem): string {
  const path = errors?.[0]?.path;
  return path === undefined ? code : `${code} ${path}`;
}

// One status can answer with several codes; each becomes a named example.
export function ApiProblemResponse(
  status: number,
  ...examples: readonly [ProblemExample, ...ProblemExample[]]
): MethodDecorator & ClassDecorator {
  const title = problemTitle(status);
  const bodies = examples.map((example): ApiProblem => ({
    type: PROBLEM_TYPE,
    title,
    status,
    requestId: EXAMPLE_REQUEST_ID,
    ...example,
  }));
  const common = { status, description: title, standardSchema: apiProblemSchema };
  if (bodies.length === 1) {
    return ApiResponse({ ...common, example: bodies[0] });
  }
  const named = bodies.map((body) => {
    const name = exampleName(body);
    return [name, { summary: name, value: body }] as const;
  });
  return ApiResponse({ ...common, examples: Object.fromEntries(named) });
}
