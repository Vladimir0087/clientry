export type ProblemExtensions = Readonly<Record<string, unknown>>;

export abstract class DomainError extends Error {
  readonly code: string;
  readonly extensions: ProblemExtensions;

  constructor(code: string, detail: string, extensions: ProblemExtensions = {}) {
    super(detail);
    this.name = new.target.name;
    this.code = code;
    this.extensions = extensions;
  }
}
