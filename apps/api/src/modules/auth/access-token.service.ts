import type { KeyObject } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';

import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  accessTokenClaimsSchema,
} from '@clientry/shared/auth';
import type { AccessTokenClaims } from '@clientry/shared/auth';

import { AuthenticationRequiredError } from './errors.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { AppConfig } from '../../infra/config/app-config.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const ALGORITHM = 'ES256';

@Injectable()
export class AccessTokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(config: AppConfig) {
    this.privateKey = config.jwtPrivateKey;
    this.publicKey = config.jwtPublicKey;
  }

  sign(user: AuthUser, sessionId: string): Promise<string> {
    return new SignJWT({ sid: sessionId, wid: user.workspaceId, role: user.role })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${String(ACCESS_TOKEN_TTL_SECONDS)}s`)
      .sign(this.privateKey);
  }

  // Missing, malformed, tampered and expired tokens all get one error: the client just refreshes.
  async verify(token: string): Promise<AccessTokenClaims> {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(token, this.publicKey, {
        algorithms: [ALGORITHM],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
      }));
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        throw new AuthenticationRequiredError();
      }
      throw error;
    }
    const claims = accessTokenClaimsSchema.safeParse(payload);
    if (!claims.success) {
      throw new AuthenticationRequiredError();
    }
    return claims.data;
  }
}
