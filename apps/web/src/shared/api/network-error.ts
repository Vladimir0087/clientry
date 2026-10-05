export class NetworkError extends Error {
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Request to ${path} failed without a response`, { cause });
    this.name = 'NetworkError';
    this.path = path;
  }
}
