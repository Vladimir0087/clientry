import type { z } from 'zod';

export interface ConfigIssue {
  readonly variable: string;
  readonly reason: string;
}

export class InvalidConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const lines = issues.map(({ variable, reason }) => `  ${variable}: ${reason}`);
    super(`Invalid environment configuration:\n${lines.join('\n')}`);
    this.name = 'InvalidConfigError';
    this.issues = issues;
  }

  // Built from paths and messages only: an issue's input may be a secret.
  static fromZodError(error: z.ZodError): InvalidConfigError {
    return new InvalidConfigError(
      error.issues.map((issue) => ({
        variable: issue.path.map(String).join('.'),
        reason: issue.message,
      })),
    );
  }
}
