import { http, HttpResponse } from 'msw';

import { TEST_SESSION } from '../fixtures';

// Any origin: the browser calls the web origin, the server client calls API_URL.
export const handlers = [
  http.get('*/api/auth/me', () => HttpResponse.json(TEST_SESSION)),
  http.post('*/api/auth/refresh', () => HttpResponse.json(TEST_SESSION)),
  http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
];
