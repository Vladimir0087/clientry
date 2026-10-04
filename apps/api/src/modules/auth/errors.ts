import { ConflictError } from '../../common/errors/conflict.error.js';
import { ForbiddenError } from '../../common/errors/forbidden.error.js';
import { UnauthenticatedError } from '../../common/errors/unauthenticated.error.js';

export class EmailTakenError extends ConflictError {
  constructor() {
    super('EMAIL_TAKEN', 'An account with this email already exists');
  }
}

export class InvalidCredentialsError extends UnauthenticatedError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
}

export class InvalidRefreshTokenError extends UnauthenticatedError {
  constructor() {
    super('INVALID_REFRESH_TOKEN', 'The session has ended, sign in again');
  }
}

export class AuthenticationRequiredError extends UnauthenticatedError {
  constructor() {
    super('AUTHENTICATION_REQUIRED', 'A valid access token is required');
  }
}

export class InsufficientRoleError extends ForbiddenError {
  constructor() {
    super('INSUFFICIENT_ROLE', 'Your role does not allow this action');
  }
}

export class NoWorkspaceError extends ForbiddenError {
  constructor() {
    super('NO_WORKSPACE', 'This account is not a member of any workspace');
  }
}
