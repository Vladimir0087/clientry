import { z } from 'zod';

import type { TaskStatus } from '@clientry/shared/tasks';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const instantSchema = z.iso.datetime();

const cursorTupleSchema = z.union([
  z.tuple([z.literal('open'), instantSchema, z.uuid()]),
  z.tuple([z.literal('done'), instantSchema, instantSchema, z.uuid()]),
]);

export interface OpenTaskCursor {
  readonly status: 'open';
  readonly dueAt: string;
  readonly id: string;
}

export interface DoneTaskCursor {
  readonly status: 'done';
  readonly doneAt: string;
  readonly dueAt: string;
  readonly id: string;
}

export type TaskCursor = OpenTaskCursor | DoneTaskCursor;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function toTuple(cursor: TaskCursor): readonly string[] {
  return cursor.status === 'open'
    ? [cursor.status, cursor.dueAt, cursor.id]
    : [cursor.status, cursor.doneAt, cursor.dueAt, cursor.id];
}

export function encodeTaskCursor(cursor: TaskCursor): string {
  return Buffer.from(JSON.stringify(toTuple(cursor))).toString('base64url');
}

// Null for anything a list of this status did not produce; Buffer alone would skip invalid
// characters.
export function decodeTaskCursor(raw: string, status: TaskStatus): TaskCursor | null {
  if (!BASE64URL.test(raw)) {
    return null;
  }
  const tuple = cursorTupleSchema.safeParse(
    parseJson(Buffer.from(raw, 'base64url').toString('utf8')),
  );
  if (!tuple.success || tuple.data[0] !== status) {
    return null;
  }
  const { data } = tuple;
  return data[0] === 'open'
    ? { status: data[0], dueAt: data[1], id: data[2] }
    : { status: data[0], doneAt: data[1], dueAt: data[2], id: data[3] };
}
