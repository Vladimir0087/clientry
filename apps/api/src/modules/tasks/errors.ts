import { ForbiddenError } from '../../common/errors/forbidden.error.js';
import { NotFoundError } from '../../common/errors/not-found.error.js';

export class TaskNotFoundError extends NotFoundError {
  constructor() {
    super('TASK_NOT_FOUND', 'Task not found');
  }
}

export class TaskDeleteForbiddenError extends ForbiddenError {
  constructor() {
    super('TASK_DELETE_FORBIDDEN', 'Managers can delete only tasks they created');
  }
}
