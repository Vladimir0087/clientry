import { http } from 'msw';
import type { HttpResponseResolver } from 'msw';

import { server } from './server';

type Method = 'get' | 'post';

export type Resolver = (info: Parameters<HttpResponseResolver>[0]) => Response | Promise<Response>;

// Answers one endpoint on any origin and keeps every request it received.
export function recordRequests(method: Method, path: string, resolver: Resolver): Request[] {
  const requests: Request[] = [];
  server.use(
    http[method](`*${path}`, (info) => {
      requests.push(info.request.clone());
      return resolver(info);
    }),
  );
  return requests;
}
