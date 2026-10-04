import type { Response } from 'supertest';

export interface SetCookie {
  readonly value: string;
  // Lowercased attribute names; flags such as HttpOnly map to true.
  readonly attributes: Readonly<Record<string, string | true>>;
}

function parseOne(header: string): readonly [string, SetCookie] {
  const [pair = '', ...parts] = header.split(';').map((part) => part.trim());
  const separator = pair.indexOf('=');
  const attributes = Object.fromEntries(
    parts.map((part): [string, string | true] => {
      const [key = '', ...rest] = part.split('=');
      return [key.toLowerCase(), rest.length > 0 ? rest.join('=') : true];
    }),
  );
  return [pair.slice(0, separator), { value: pair.slice(separator + 1), attributes }];
}

export function setCookies(response: Response): ReadonlyMap<string, SetCookie> {
  const header: unknown = response.headers['set-cookie'];
  const headers = Array.isArray(header) ? header.filter((line) => typeof line === 'string') : [];
  return new Map(headers.map(parseOne));
}

export function setCookieValue(response: Response, name: string): string {
  const cookie = setCookies(response).get(name);
  if (!cookie) {
    throw new Error(`Response did not set the ${name} cookie`);
  }
  return cookie.value;
}
