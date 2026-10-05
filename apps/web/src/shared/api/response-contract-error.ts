import type { z } from 'zod';

export class ResponseContractError extends Error {
  readonly path: string;

  constructor(path: string, cause: z.ZodError) {
    super(`Response from ${path} does not match its schema`, { cause });
    this.name = 'ResponseContractError';
    this.path = path;
  }
}
