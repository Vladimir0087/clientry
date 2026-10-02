import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from './create-test-app.js';
import type { TestApp } from './create-test-app.js';
import { TestOnlyModule } from './support/test-only.module.js';

const PROBLEM_REF = { $ref: '#/components/schemas/ApiProblem' };

describe('OpenAPI document', () => {
  let testApp: TestApp;
  let document: Record<string, unknown>;

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TestOnlyModule] });
    const response = await testApp.http.get('/api/docs/openapi.json');
    document = response.body as Record<string, unknown>;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should serve Swagger UI when /api/docs is opened', async () => {
    const response = await testApp.http.get('/api/docs').redirects(1);

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });

  it('should describe the request body when a handler validates it with a zod schema', () => {
    expect(document).toMatchObject({
      paths: {
        '/api/test/echo': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string', minLength: 1 }, email: {} },
                    required: ['name', 'email'],
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('should describe the response when a handler declares a zod response schema', () => {
    expect(document).toMatchObject({
      paths: {
        '/api/test/echo': {
          post: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'object', required: ['received'] },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('should document only the declared status when a POST answers 201', () => {
    const paths = document.paths as Record<string, { post?: { responses: object } }>;

    expect(Object.keys(paths['/api/test/users']?.post?.responses ?? {})).toEqual(['201']);
  });

  it('should describe an array when the response schema is a zod array', () => {
    expect(document).toMatchObject({
      paths: {
        '/api/test/users': {
          get: {
            responses: {
              '200': { content: { 'application/json': { schema: { type: 'array' } } } },
            },
          },
        },
      },
    });
  });

  it('should reference ApiProblem with an example when an error response is documented', () => {
    expect(document).toMatchObject({
      paths: {
        '/api/test/echo': {
          post: {
            responses: {
              '400': {
                content: {
                  'application/problem+json': {
                    schema: PROBLEM_REF,
                    example: { status: 400, code: 'VALIDATION_FAILED' },
                  },
                },
              },
              '500': { content: { 'application/problem+json': { schema: PROBLEM_REF } } },
            },
          },
        },
      },
      components: {
        schemas: { ApiProblem: { type: 'object', properties: { code: {}, requestId: {} } } },
      },
    });
  });

  it('should leave health probes out when the document is built', () => {
    const paths = Object.keys(document.paths as Record<string, unknown>);

    expect(paths.filter((path) => path.includes('health'))).toEqual([]);
  });
});
