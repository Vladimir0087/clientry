import { z } from 'zod';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const cursorTupleSchema = z.tuple([z.iso.datetime(), z.uuid()]);

// The last row of a page in a list that runs newest first by created_at, then id.
export interface CreatedAtCursor {
  readonly createdAt: string;
  readonly id: string;
}

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

export function encodeCreatedAtCursor({ createdAt, id }: CreatedAtCursor): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString('base64url');
}

// Null for anything a list did not produce; Buffer alone would skip invalid characters.
export function decodeCreatedAtCursor(raw: string): CreatedAtCursor | null {
  if (!BASE64URL.test(raw)) {
    return null;
  }
  const tuple = cursorTupleSchema.safeParse(
    parseJson(Buffer.from(raw, 'base64url').toString('utf8')),
  );
  if (!tuple.success) {
    return null;
  }
  const [createdAt, id] = tuple.data;
  return { createdAt, id };
}
