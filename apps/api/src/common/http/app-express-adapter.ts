import { BadRequestException } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { RequestHandler } from 'express';

const IDLE_SWEEP_INTERVAL_MS = 100;
const MALFORMED_JSON_DETAIL = 'Malformed JSON body';

function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed';
}

export class AppExpressAdapter extends ExpressAdapter {
  // body-parser's message quotes a fragment of the body, which may hold a password or a token.
  override mapException(error: unknown): unknown {
    if (isJsonParseError(error)) {
      return new BadRequestException(MALFORMED_JSON_DETAIL);
    }
    return super.mapException(error);
  }

  // Nest mounts its 404 handler under the global prefix only; any other path would get
  // Express's HTML page instead of problem details.
  override setNotFoundHandler(handler: RequestHandler, prefix?: string): this {
    super.setNotFoundHandler(handler, prefix);
    this.use(handler);
    return this;
  }

  // server.close() drops only sockets idle at that moment; a keep-alive one that finishes later
  // would take new requests for keepAliveTimeout, so idle sockets are swept until it closes.
  override close(): Promise<unknown> | undefined {
    const closing = super.close();
    if (!closing) {
      return closing;
    }
    const server = this.getHttpServer();
    const sweep = setInterval(() => {
      server.closeIdleConnections();
    }, IDLE_SWEEP_INTERVAL_MS).unref();
    return closing.finally(() => {
      clearInterval(sweep);
    });
  }
}
