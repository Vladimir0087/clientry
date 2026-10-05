export class SessionExpiredError extends Error {
  constructor(options?: ErrorOptions) {
    super('The session can no longer be refreshed', options);
    this.name = 'SessionExpiredError';
  }
}
