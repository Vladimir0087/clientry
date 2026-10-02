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
}
