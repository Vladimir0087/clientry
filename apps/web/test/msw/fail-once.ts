import { delay, HttpResponse } from 'msw';
import type { JsonBodyType } from 'msw';

import { problemResponse } from './problem';

// Fails the first request, then holds the next one, so the loading state stays on screen.
export function failOnceThenWait(body: JsonBodyType): () => Promise<Response> {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls === 1) {
      return problemResponse(400, 'VALIDATION_FAILED');
    }
    await delay('infinite');
    return HttpResponse.json(body);
  };
}

// Fails the first request, then gives the answer to the next ones once the gate has opened.
export function failOnceThenAnswer(
  answer: () => Response,
  gate: Promise<void> = Promise.resolve(),
): () => Promise<Response> {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls === 1) {
      return problemResponse(400, 'VALIDATION_FAILED');
    }
    await gate;
    return answer();
  };
}
