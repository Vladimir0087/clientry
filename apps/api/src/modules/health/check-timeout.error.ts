export class CheckTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Check timed out after ${String(timeoutMs)} ms`);
    this.name = 'CheckTimeoutError';
  }
}
