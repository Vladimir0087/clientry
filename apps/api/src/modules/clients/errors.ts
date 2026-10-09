import { ForbiddenError } from '../../common/errors/forbidden.error.js';
import { NotFoundError } from '../../common/errors/not-found.error.js';

export class ClientNotFoundError extends NotFoundError {
  constructor() {
    super('CLIENT_NOT_FOUND', 'Client not found');
  }
}

export class ClientDeleteForbiddenError extends ForbiddenError {
  constructor() {
    super('CLIENT_DELETE_FORBIDDEN', 'Managers can delete only clients they created');
  }
}
