import { ForbiddenError } from '../errors/forbidden.error.js';

export class UntrustedOriginError extends ForbiddenError {
  constructor() {
    super('UNTRUSTED_ORIGIN', 'Requests from this origin are not allowed');
  }
}
