import { describe, expect, it } from 'vitest';

import { parseOrigin } from './origin.js';

describe('parseOrigin', () => {
  it.each([
    ['http://localhost:3000', 'http://localhost:3000'],
    ['https://api.example:8443/', 'https://api.example:8443'],
    ['HTTPS://API.EXAMPLE', 'https://api.example'],
  ])('should return the origin when the value is %s', (value, origin) => {
    expect(parseOrigin(value)).toBe(origin);
  });

  it.each([
    'localhost:3000',
    'ftp://api.example',
    'http://api.example/api',
    'http://api.example?x=1',
    'http://api.example?',
    'http://api.example#top',
    'http://api.example#',
    'http://user:pass@api.example',
    '',
  ])('should return undefined when the value is "%s"', (value) => {
    expect(parseOrigin(value)).toBeUndefined();
  });
});
