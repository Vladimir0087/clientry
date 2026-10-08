import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { writeServerLog } from './server-log';
import type { ServerLogFields } from './server-log';

describe('writeServerLog', () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write one JSON line to stdout when called', () => {
    writeServerLog('warn', 'Session prefetch failed', { reason: 'http', status: 503 });

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const [line] = stdoutWrite.mock.calls[0] ?? [];
    expect(typeof line === 'string' && line.endsWith('\n')).toBe(true);
    expect(JSON.parse(String(line))).toEqual({
      level: 40,
      time: expect.any(Number) as unknown,
      msg: 'Session prefetch failed',
      reason: 'http',
      status: 503,
    });
  });

  it('should put level, time and msg first when fields are given', () => {
    writeServerLog('info', 'Ready', { region: 'fra1' });

    const [line] = stdoutWrite.mock.calls[0] ?? [];
    expect(Object.keys(JSON.parse(String(line)) as object)).toEqual([
      'level',
      'time',
      'msg',
      'region',
    ]);
  });

  it('should refuse a field named like an entry key when type-checked', () => {
    expectTypeOf({ msg: 'overwritten' }).not.toExtend<ServerLogFields>();
    expectTypeOf({ level: 50 }).not.toExtend<ServerLogFields>();
    expectTypeOf({ reason: 'http', status: 503 }).toExtend<ServerLogFields>();
  });
});
