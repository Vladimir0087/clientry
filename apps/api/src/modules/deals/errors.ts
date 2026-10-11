import { ConflictError } from '../../common/errors/conflict.error.js';
import { ForbiddenError } from '../../common/errors/forbidden.error.js';
import { NotFoundError } from '../../common/errors/not-found.error.js';

export class DealNotFoundError extends NotFoundError {
  constructor() {
    super('DEAL_NOT_FOUND', 'Deal not found');
  }
}

export class DealDeleteForbiddenError extends ForbiddenError {
  constructor() {
    super('DEAL_DELETE_FORBIDDEN', 'Managers can delete only deals they created');
  }
}

export class DealChangedError extends ConflictError {
  constructor() {
    super('DEAL_CHANGED', 'The deal was changed by someone else');
  }
}

export class BoardChangedError extends ConflictError {
  constructor() {
    super('BOARD_CHANGED', 'The board changed; reload it and try again');
  }
}

export class StageNotFoundError extends NotFoundError {
  constructor() {
    super('STAGE_NOT_FOUND', 'Stage not found');
  }
}

export class StageNameTakenError extends ConflictError {
  constructor() {
    super('STAGE_NAME_TAKEN', 'A stage with this name already exists');
  }
}

export class StageLimitReachedError extends ConflictError {
  constructor() {
    super('STAGE_LIMIT_REACHED', 'A pipeline can have at most 10 open stages');
  }
}

export class LastOpenStageError extends ConflictError {
  constructor() {
    super('LAST_OPEN_STAGE', 'A pipeline needs at least one open stage');
  }
}

export class StageNotDeletableError extends ConflictError {
  constructor() {
    super('STAGE_NOT_DELETABLE', 'Won and lost stages cannot be deleted');
  }
}

export class StagesChangedError extends ConflictError {
  constructor() {
    super('STAGES_CHANGED', 'The stages changed; reload them and try again');
  }
}
