import type { Request, Response } from 'express';
import type { LevelWithSilent, Logger } from 'pino';
import type { Options } from 'pino-http';

import { pathWithoutQuery } from '../../common/http/request-path.js';

const HEALTH_PATH_PREFIX = '/health/';
// Vercel adds the visitor's city, region and coordinates to every proxied request.
const GEOLOCATION_HEADER_PREFIX = 'x-vercel-ip-';

export function resolveRequestLogLevel(
  request: Request,
  response: Response,
  error?: Error,
): LevelWithSilent {
  const isFailed = error !== undefined || response.statusCode >= 500;
  // The pinger probes every few minutes; only a failing probe is worth a line.
  if (
    !isFailed &&
    response.statusCode < 400 &&
    request.originalUrl.startsWith(HEALTH_PATH_PREFIX)
  ) {
    return 'silent';
  }
  if (isFailed) {
    return 'error';
  }
  return response.statusCode >= 400 ? 'warn' : 'info';
}

// The shapes pino-http hands to custom serializers after its standard ones ran.
export interface SerializedRequest {
  readonly id: unknown;
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly remoteAddress?: string;
  readonly remotePort?: number;
  // Non-enumerable in pino's object: the Express request the rest was read from.
  readonly raw: Pick<Request, 'ip'>;
}

export interface LoggedRequest extends Omit<SerializedRequest, 'raw'> {
  // Resolved through trust proxy, so one line shows whether TRUST_PROXY_HOPS is right.
  readonly clientIp?: string;
}

interface SerializedResponse {
  readonly statusCode: number;
}

function withoutGeolocation(
  headers: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !name.startsWith(GEOLOCATION_HEADER_PREFIX)),
  );
}

export function serializeRequest(request: SerializedRequest): LoggedRequest {
  const { id, method, url, headers, remoteAddress, remotePort, raw } = request;
  return {
    id,
    method,
    url: pathWithoutQuery(url),
    headers: withoutGeolocation(headers),
    remoteAddress,
    remotePort,
    clientIp: raw.ip,
  };
}

export function createHttpLoggerOptions(logger: Logger): Options<Request, Response> {
  return {
    logger,
    // Service logs carry only the request id, not the whole request object.
    quietReqLogger: true,
    customLogLevel: resolveRequestLogLevel,
    serializers: {
      req: serializeRequest,
      // Response headers add about 1.5 KB per line and say nothing the status does not.
      res: ({ statusCode }: SerializedResponse) => ({ statusCode }),
    },
  };
}
