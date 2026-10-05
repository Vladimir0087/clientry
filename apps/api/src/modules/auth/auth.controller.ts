import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  loginRequestSchema,
  registerRequestSchema,
  sessionResponseSchema,
} from '@clientry/shared/auth';
import type { LoginRequest, RegisterRequest, SessionResponse } from '@clientry/shared/auth';

import { AuthCookies } from './auth-cookies.js';
import { AuthService } from './auth.service.js';
import type { IssuedSession } from './auth.service.js';
import {
  AuthenticationRequiredError,
  EmailTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  NoWorkspaceError,
} from './errors.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { UntrustedOriginError } from '../../common/guards/untrusted-origin.error.js';
import {
  ApiErrorResponse,
  ApiUntrustedOrigin,
} from '../../common/http/api-error-response.decorator.js';
import { ApiProblemResponse } from '../../common/http/api-problem-response.decorator.js';
import { TOO_MANY_REQUESTS_DETAIL } from '../../common/http/problem-details.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Counted per client IP and per route, in memory: the API runs as a single process.
function RateLimit(limit: number, ttl: number, instance: string): MethodDecorator {
  return applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit, ttl } }),
    ApiProblemResponse(HttpStatus.TOO_MANY_REQUESTS, {
      code: 'TOO_MANY_REQUESTS',
      detail: TOO_MANY_REQUESTS_DETAIL,
      instance,
    }),
  );
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookies,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Create an account with its workspace and sign in' })
  @ResponseSchema(HttpStatus.CREATED, sessionResponseSchema)
  @ApiProblemResponse(HttpStatus.BAD_REQUEST, {
    code: 'VALIDATION_FAILED',
    detail: 'Request validation failed',
    instance: '/api/auth/register',
    errors: [{ path: 'password', message: 'Use at least 12 characters' }],
  })
  @ApiUntrustedOrigin('/api/auth/register')
  @ApiErrorResponse(HttpStatus.CONFLICT, '/api/auth/register', new EmailTakenError())
  @RateLimit(10, HOUR_MS, '/api/auth/register')
  async register(
    @Body({ schema: registerRequestSchema }) input: RegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    return this.respond(response, await this.auth.register(input));
  }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ResponseSchema(HttpStatus.OK, sessionResponseSchema)
  @ApiProblemResponse(HttpStatus.BAD_REQUEST, {
    code: 'VALIDATION_FAILED',
    detail: 'Request validation failed',
    instance: '/api/auth/login',
    errors: [{ path: 'email', message: 'Enter a valid email' }],
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, '/api/auth/login', new InvalidCredentialsError())
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    '/api/auth/login',
    new UntrustedOriginError(),
    new NoWorkspaceError(),
  )
  @RateLimit(10, MINUTE_MS, '/api/auth/login')
  async login(
    @Body({ schema: loginRequestSchema }) input: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    return this.respond(response, await this.auth.login(input));
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Exchange the refresh cookie for new session cookies' })
  @ResponseSchema(HttpStatus.OK, sessionResponseSchema)
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, '/api/auth/refresh', new InvalidRefreshTokenError())
  @ApiUntrustedOrigin('/api/auth/refresh')
  @RateLimit(30, MINUTE_MS, '/api/auth/refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const refreshToken = this.cookies.readRefreshToken(request);
    try {
      return this.respond(response, await this.auth.refresh(refreshToken));
    } catch (error) {
      // The browser stops presenting a dead token, and the web proxy sees a signed-out user.
      if (error instanceof InvalidRefreshTokenError) {
        this.cookies.clear(response);
      }
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the session of the refresh cookie and clear both cookies' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Signed out' })
  @ApiUntrustedOrigin('/api/auth/logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.auth.logout(this.cookies.readRefreshToken(request));
    } finally {
      // Cleared even when revoking fails: the user asked to sign out on this device.
      this.cookies.clear(response);
    }
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user with their workspace and role' })
  @ResponseSchema(HttpStatus.OK, sessionResponseSchema)
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, '/api/auth/me', new AuthenticationRequiredError())
  getSession(@CurrentUser() user: AuthUser): Promise<SessionResponse> {
    return this.auth.getSession(user);
  }

  private respond(response: Response, issued: IssuedSession): SessionResponse {
    this.cookies.set(response, {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      maxAgeMs: issued.refreshMaxAgeMs,
    });
    return issued.session;
  }
}
