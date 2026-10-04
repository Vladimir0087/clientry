import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@clientry/shared/auth';

import { ACCESS_TOKEN_TTL_SECONDS } from './access-token.service.js';
import { AppConfig } from '../../infra/config/app-config.js';

const REFRESH_COOKIE_PATH = '/api/auth';

export interface SessionCookies {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshMaxAgeMs: number;
}

function readCookie(request: Request, name: string): string | undefined {
  const cookies: Record<string, unknown> = request.cookies;
  const value = cookies[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// No Domain attribute: the cookies stay on the exact host the browser talks to.
@Injectable()
export class AuthCookies {
  private readonly accessOptions: CookieOptions;
  private readonly refreshOptions: CookieOptions;

  constructor(config: AppConfig) {
    const isSecure = config.nodeEnv === 'production';
    this.accessOptions = { path: '/', sameSite: 'lax', httpOnly: true, secure: isSecure };
    this.refreshOptions = {
      path: REFRESH_COOKIE_PATH,
      sameSite: 'strict',
      httpOnly: true,
      secure: isSecure,
    };
  }

  readAccessToken(request: Request): string | undefined {
    return readCookie(request, ACCESS_TOKEN_COOKIE);
  }

  readRefreshToken(request: Request): string | undefined {
    return readCookie(request, REFRESH_TOKEN_COOKIE);
  }

  set(response: Response, cookies: SessionCookies): void {
    response.cookie(ACCESS_TOKEN_COOKIE, cookies.accessToken, {
      ...this.accessOptions,
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, cookies.refreshToken, {
      ...this.refreshOptions,
      maxAge: cookies.refreshMaxAgeMs,
    });
  }

  // res.clearCookie in Express 5 sends only an expired date; Max-Age=0 is unambiguous.
  clear(response: Response): void {
    response.cookie(ACCESS_TOKEN_COOKIE, '', { ...this.accessOptions, maxAge: 0 });
    response.cookie(REFRESH_TOKEN_COOKIE, '', { ...this.refreshOptions, maxAge: 0 });
  }
}
