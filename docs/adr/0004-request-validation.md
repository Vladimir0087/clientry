# 0004 — Request validation

Status: accepted
Date: 2026-10-01

## Context

The web app and the API must agree on every request and response shape. Forms validate on the
client, the API validates again, and Swagger documents the same contract. Three hand-kept copies
of each shape drift apart.

## Decision

- **zod schemas in `@clientry/shared`** are the single definition of each contract. The web app
  uses them in react-hook-form, the API uses them at the HTTP boundary.
- **Nest 12's native Standard Schema support** connects them to the API:
  - `StandardSchemaValidationPipe` is registered globally; handlers attach a schema with
    `@Body({ schema })`, `@Query({ schema })` or `@Param(name, { schema })` and type the
    parameter with the schema's inferred type. Validation failures become one problem details
    response with a `{ path, message }` entry per issue.
  - A strict subclass of `StandardSchemaSerializerInterceptor` is registered globally. Each
    handler declares its status and response schema with `@ResponseSchema(status, schema)`,
    which also sets the status and documents the response, and the returned value is parsed
    through it, so fields outside the contract never leave the API. Unlike Nest's interceptor,
    a body without a schema is an error rather than passed through, and every body, arrays and
    primitives included, is parsed as a whole.
  - `@nestjs/swagger` builds request and response schemas from the same zod schemas through
    their Standard JSON Schema export.
- No DTO classes.

## Alternatives

- **class-validator and class-transformer.** Nest's long-time default, but every shape becomes
  a decorated class that duplicates the zod schema the web app needs anyway. Rejected.
- **nestjs-zod.** Solved this problem before Nest supported Standard Schema, but it does not
  support Nest 12, and Nest 12 now covers validation, serialization and OpenAPI generation
  itself. Rejected.
- **A hand-written zod pipe and OpenAPI schemas.** The same result with more code to maintain.
  Rejected.

## Consequences

- Changing a contract is one edit in `@clientry/shared`; both apps fail typecheck where they
  disagree with it.
- Swagger stays accurate without hand-written schemas; error responses reference one
  `ApiProblem` component.
- Validation messages come from zod, so the web app can show server errors in the same fields.
- Response parsing costs a schema pass per response, negligible at this load.
- A handler that forgets its response schema fails its first test with 500 instead of leaking
  fields such as a password hash.
