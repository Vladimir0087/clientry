import type { ReadinessChecks } from '@clientry/shared/health';

import { ServiceUnavailableError } from '../../common/errors/service-unavailable.error.js';

export class NotReadyError extends ServiceUnavailableError {
  constructor(checks: ReadinessChecks) {
    super('NOT_READY', 'One or more dependencies are unavailable', { checks });
  }
}
