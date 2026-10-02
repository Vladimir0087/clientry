export class ResponseContractError extends Error {
  constructor(handler: string, problem: string) {
    super(`${handler} ${problem}`);
    this.name = 'ResponseContractError';
  }
}
