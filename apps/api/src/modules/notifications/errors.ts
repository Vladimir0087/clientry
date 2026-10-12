import { NotFoundError } from '../../common/errors/not-found.error.js';

export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super('NOTIFICATION_NOT_FOUND', 'Notification not found');
  }
}
