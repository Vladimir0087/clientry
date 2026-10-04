import { z } from 'zod';

// Postgres text cannot store NUL, so it is rejected at validation instead of failing the insert.
export const textSchema = z.string().regex(/^[^\0]*$/, 'Must not contain NUL characters');
