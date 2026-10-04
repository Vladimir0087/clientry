import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface FakeRequest {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cookies?: Readonly<Record<string, string>>;
}

export interface HttpContext {
  readonly context: ExecutionContext;
  readonly request: Request;
}

// Guards read only the request, the handler and the controller class from the context.
export function createHttpContext<T extends object>(
  controller: abstract new (...args: never[]) => T,
  handlerName: keyof T & string,
  fake: FakeRequest = {},
): HttpContext {
  const handler: unknown = Reflect.get(controller.prototype, handlerName);
  const request = {
    method: fake.method ?? 'GET',
    headers: fake.headers ?? {},
    cookies: fake.cookies ?? {},
  } as unknown as Request;
  const context = {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}
