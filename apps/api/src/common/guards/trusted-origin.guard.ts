import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { UntrustedOriginError } from './untrusted-origin.error.js';
import { AppConfig } from '../../infra/config/app-config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Browsers always send Origin on unsafe requests; clients that omit it carry no ambient cookies.
@Injectable()
export class TrustedOriginGuard implements CanActivate {
  private readonly trustedOrigins: ReadonlySet<string>;

  constructor(config: AppConfig) {
    this.trustedOrigins = new Set(config.trustedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (SAFE_METHODS.has(request.method) || origin === undefined) {
      return true;
    }
    if (!this.trustedOrigins.has(origin)) {
      throw new UntrustedOriginError();
    }
    return true;
  }
}
