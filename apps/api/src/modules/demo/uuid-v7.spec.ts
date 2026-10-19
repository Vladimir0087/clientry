import { describe, expect, it } from 'vitest';

import { uuidV7At } from './uuid-v7.js';

const TIME = new Date('2026-10-18T09:30:15.123Z');

describe('uuidV7At', () => {
  it('should set version 7 and the RFC variant when an id is built', () => {
    const id = uuidV7At(TIME);

    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  });

  it('should read back the time in milliseconds when the first 48 bits are decoded', () => {
    const id = uuidV7At(TIME);

    expect(Number.parseInt(id.replace('-', '').slice(0, 12), 16)).toBe(TIME.getTime());
  });

  it('should differ when two ids are built for one time', () => {
    expect(uuidV7At(TIME)).not.toBe(uuidV7At(TIME));
  });
});
