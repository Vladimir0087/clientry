import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ContentObject, OpenAPIObject } from '@nestjs/swagger';

import { PROBLEM_MEDIA_TYPE } from './problem-details.js';

const SWAGGER_PATH = 'api/docs';
const OPENAPI_JSON_PATH = 'api/docs/openapi.json';

const JSON_MEDIA_TYPE = 'application/json';

const OPERATION_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;

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
  for (const pathItem of Object.values(document.paths)) {
    for (const method of OPERATION_METHODS) {
      const responses = pathItem[method]?.responses ?? {};
      for (const [status, response] of Object.entries(responses)) {
        const isProblem = Number(status) >= 400 && response !== undefined;
        if (isProblem && 'content' in response && response.content) {
          response.content = toProblemContent(response.content);
        }
      }
    }
  }
}

function createOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Clientry API')
    .setDescription('Lightweight CRM for small teams.')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  useProblemMediaType(document);
  return document;
}

export function setupSwagger(app: NestExpressApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    raw: ['json'],
  });
}
