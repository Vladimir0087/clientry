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

  describe('auth operations', () => {
    const AUTH_OPERATIONS = [
      ['post', '/api/auth/register'],
      ['post', '/api/auth/login'],
      ['post', '/api/auth/refresh'],
      ['post', '/api/auth/logout'],
      ['get', '/api/auth/me'],
    ] as const;

    interface Operation {
      readonly security?: unknown;
      readonly responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
    }

    function operation(method: string, path: string): Operation | undefined {
      const paths = document.paths as Record<string, Record<string, Operation> | undefined>;
      return paths[path]?.[method];
    }

    it.each(AUTH_OPERATIONS)('should document %s %s when the document is built', (method, path) => {
      expect(operation(method, path)).toBeDefined();
    });

    it('should require the access cookie only on me when auth security is documented', () => {
      const security = AUTH_OPERATIONS.map(([method, path]) => operation(method, path)?.security);

      expect(security).toEqual([[], [], [], [], [{ accessCookie: [] }]]);
      expect(document).toMatchObject({
        components: {
          securitySchemes: {
            accessCookie: { type: 'apiKey', in: 'cookie', name: 'clientry_access' },
          },
        },
      });
    });

    it.each(['RegisterRequest', 'LoginRequest'])(
      'should describe the email with its format and length when %s is documented',
      (name) => {
        expect(document).toMatchObject({
          components: {
            schemas: {
              [name]: { properties: { email: { format: 'email', maxLength: 254 } } },
            },
          },
        });
      },
    );

    it('should list both 403 codes of login when one status has two causes', () => {
      expect(document).toMatchObject({
        paths: {
          '/api/auth/login': {
            post: {
              responses: {
                '403': {
                  content: {
                    'application/problem+json': {
                      examples: {
                        UNTRUSTED_ORIGIN: { value: { code: 'UNTRUSTED_ORIGIN' } },
                        NO_WORKSPACE: { value: { code: 'NO_WORKSPACE' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    it.each(AUTH_OPERATIONS)(
      'should reference ApiProblem in every error response when %s %s is documented',
      (method, path) => {
        const errors = Object.entries(operation(method, path)?.responses ?? {}).filter(
          ([status]) => Number(status) >= 400,
        );

        expect(errors.length).toBeGreaterThan(0);
        for (const [, response] of errors) {
          expect(response.content?.['application/problem+json']?.schema).toEqual(PROBLEM_REF);
        }
      },
    );
  });

  it('should leave health probes out when the document is built', () => {
    const paths = Object.keys(document.paths as Record<string, unknown>);

    expect(paths.filter((path) => path.includes('health'))).toEqual([]);
  });
});
