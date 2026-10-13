import { INVITE_LIMITS } from '@clientry/shared/workspaces';

import { ConflictError } from '../../common/errors/conflict.error.js';
import { NotFoundError } from '../../common/errors/not-found.error.js';

export class MemberNotFoundError extends NotFoundError {
  constructor() {
    super('MEMBER_NOT_FOUND', 'Member not found');
  }
}

export class LastOwnerError extends ConflictError {
  constructor() {
    super('LAST_OWNER', 'A workspace needs at least one owner');
  }
}

// Not pending any more, or another workspace's: an owner's view, unlike a visitor's dead link.
export class InviteNotFoundError extends NotFoundError {
  constructor() {
    super('INVITE_NOT_FOUND', 'Invite not found');
  }
}

export class InviteLimitReachedError extends ConflictError {
  constructor() {
    super(
      'INVITE_LIMIT_REACHED',
      `A workspace can have at most ${String(INVITE_LIMITS.pending)} pending invites`,
    );
  }
}
