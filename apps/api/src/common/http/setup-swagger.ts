import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ContentObject, OpenAPIObject, OperationObject } from '@nestjs/swagger';

import { ACCESS_TOKEN_COOKIE } from '@clientry/shared/auth';

import { PROBLEM_MEDIA_TYPE } from './problem-details.js';
import { PUBLIC_OPERATION_EXTENSION } from '../auth/public.decorator.js';

const SWAGGER_PATH = 'api/docs';
const OPENAPI_JSON_PATH = 'api/docs/openapi.json';

const JSON_MEDIA_TYPE = 'application/json';

const OPERATION_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;

const ACCESS_COOKIE_SCHEME = 'accessCookie';

function operations(document: OpenAPIObject): OperationObject[] {
  return Object.values(document.paths).flatMap((pathItem) =>
    OPERATION_METHODS.map((method) => pathItem[method]).filter(
      (operation) => operation !== undefined,
    ),
  );
}

function toProblemContent(content: ContentObject): ContentObject {
  return Object.fromEntries(
    Object.entries(content).map(([type, media]) => [
      type === JSON_MEDIA_TYPE ? PROBLEM_MEDIA_TYPE : type,
      media,
    ]),
  );
}

// @nestjs/swagger puts every response under the operation's produces type.
function useProblemMediaType(document: OpenAPIObject): void {
  for (const operation of operations(document)) {
    for (const [status, response] of Object.entries(operation.responses)) {
      const isProblem = Number(status) >= 400 && response !== undefined;
      if (isProblem && 'content' in response && response.content) {
        response.content = toProblemContent(response.content);
      }
    }
  }
}

// Every route is protected unless @Public(), which marks its operation with an extension.
function applyAccessCookieSecurity(document: OpenAPIObject): void {
  for (const operation of operations(document)) {
    const isPublic = Reflect.get(operation, PUBLIC_OPERATION_EXTENSION) === true;
    Reflect.deleteProperty(operation, PUBLIC_OPERATION_EXTENSION);
    operation.security = isPublic ? [] : [{ [ACCESS_COOKIE_SCHEME]: [] }];
  }
}

function createOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Clientry API')
    .setDescription('Lightweight CRM for small teams.')
    .setVersion('1.0')
    .addCookieAuth(ACCESS_TOKEN_COOKIE, { type: 'apiKey', in: 'cookie' }, ACCESS_COOKIE_SCHEME)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  useProblemMediaType(document);
  applyAccessCookieSecurity(document);
  return document;
}

export function setupSwagger(app: NestExpressApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    raw: ['json'],
  });
}
