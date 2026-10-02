# 02 — API foundation

Status: approved

## 1. Goal

A Nest API in `apps/api` with validated env config, Prisma on Postgres, structured logs with
request ids, liveness and readiness probes, one error format, Swagger and an integration test
harness on real Postgres and Valkey, so every feature spec only adds a module.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/schema.prisma           # datasource + generator, no models yet
  prisma.config.ts
  src/
    main.ts                      # bootstrap only
    configure-app.ts             # createApp: adapter, options and setup shared by main.ts and tests
    process-handlers.ts          # shutdown deadline, fatal handlers for uncaught errors
    app.module.ts                # global pipe, interceptor, filter as APP_* providers
    common/
      errors/                    # DomainError, NotFoundError, ConflictError, ForbiddenError,
                                 # ServiceUnavailableError, RequestValidationError
      filters/                   # ProblemDetailsFilter, toApiProblem mapping
      http/                      # request id and path, Express adapter, @ResponseSchema,
                                 # @ApiProblemResponse, problem constants, Swagger setup
      interceptors/              # strict schema serializer, ResponseContractError
      pipes/create-validation-pipe.ts
    infra/
      config/                    # env schema, AppConfig provider
      logger/                    # pino instance, pino-http options, nestjs-pino module
      prisma/                    # PrismaService; generated/ is gitignored
      redis/                     # RedisService (ioredis)
    modules/health/              # controller, service, repository contract and its Prisma
                                 # implementation, errors, check timeout
  test/
    global-setup.ts              # testcontainers + migrate deploy
    create-test-app.ts
    silence-nest-logger.ts       # setup file: Nest's default logger off
    support/                     # test-only controller and module, never shipped
    *.integration.spec.ts        # HTTP pipeline, OpenAPI document, shutdown
  .swcrc
  eslint.config.mjs
  nest-cli.json
  tsconfig.json
  tsconfig.build.json
  turbo.json
  vitest.config.ts
packages/
  eslint-config/nest.js
  typescript-config/nest.json
  shared/src/common/api-problem.ts
  shared/src/health/
docs/adr/0002-backend-architecture.md, 0003-database-access.md, 0004-request-validation.md
```

**Runtime and build**

- Package `@clientry/api`, ESM (`"type": "module"`), Nest 12 on the Express platform (Nest's
  default; Fastify gives nothing at this load).
- Nest CLI with the SWC builder for `build` and `dev`; type checking stays in the separate
  `typecheck` task, as in every other package.
- Latest stable versions at implementation time, exact-pinned. `prisma`, `@prisma/client` and
  `@prisma/adapter-pg` are pinned explicitly to the same latest 7.x release (7.10.0 at the time
  of writing): the `latest` tag of `prisma` points at an 8.0 release candidate, so a plain
  `pnpm add` would install it.
- Dependency install scripts are decided in `allowBuilds` (`pnpm-workspace.yaml`). Allowed:
  `prisma`, `@prisma/engines` (downloads the schema engine that `migrate` needs) and
  `@swc/core`. Denied, none of them needed at runtime:
  - `ssh2` and its optional `cpu-features`, which `testcontainers` pulls in through `dockerode`
    for SSH to a remote Docker host, unused here;
  - `protobufjs`, also from `dockerode`;
  - `@scarf/scarf`, from `swagger-ui-dist` under `@nestjs/swagger`: its postinstall only sends
    install telemetry.

**Configuration (`infra/config`)**

- One zod schema parses `process.env` once at startup into a readonly, typed `AppConfig`,
  injected by class token. No `@nestjs/config`: typed access without string keys, and env file
  loading is Node's job.
- Invalid config stops the process with exit code 1 before the HTTP server listens. The message
  lists every invalid variable and the reason, never the value.

| Variable       | Required | Default      | Notes                               |
| -------------- | -------- | ------------ | ----------------------------------- |
| `NODE_ENV`     | no       | `production` | `development`, `test`, `production` |
| `PORT`         | no       | `4000`       | hosting injects it                  |
| `LOG_LEVEL`    | no       | `info`       | pino level or `silent`              |
| `DATABASE_URL` | yes      | —            | `postgresql://` URL with a host     |
| `REDIS_URL`    | yes      | —            | `redis://` or `rediss://` with host |

- `NODE_ENV` defaults to `production`, so a host that forgets it never tries to load the
  dev-only `pino-pretty`. Local development sets `development` explicitly.
- Local development uses the existing root `.env` for both Compose and the API, no `dotenv`.
  The `dev` script passes it with Nest CLI's `--env-file`, which is strict: without the file the
  process fails, as it would without `DATABASE_URL` anyway.
- `prisma.config.ts` loads the root `.env` only when it exists and reads
  `process.env.DATABASE_URL` directly, not through Prisma's `env()` helper, which throws on a
  missing variable: `prisma generate` runs in CI without `.env` and needs no database.
- Tests do not depend on `.env`: the harness passes `DATABASE_URL` and the other variables
  explicitly, and a variable already set in the process wins over the file that
  `prisma.config.ts` may load.
- `.env.example` gains the variables above with `NODE_ENV=development`, and `127.0.0.1` rather
  than `localhost` in URLs, since Compose binds IPv4 only.

**HTTP pipeline**

- Global prefix `/api` for application routes, so the Next proxy maps paths one to one and
  cookies with `Path=/api/...` behave the same on both origins. `/health/*` stays outside the
  prefix: it is infrastructure, called by the host and the pinger directly, not through the proxy.
- Nest 12's `app.useSecurityHeaders()` with its defaults, the same headers as helmet 8, so no
  `helmet` dependency; the content security policy is relaxed only as far as Swagger UI needs.
  No `enableCors`: the browser reaches the API only through the same-origin proxy, so no
  CORS headers are sent and browsers cannot read cross-origin responses. This is not CSRF
  protection, since simple cross-origin requests still reach handlers; that comes with cookies in
  spec 03.
- Validation: Nest 12's `StandardSchemaValidationPipe`, registered globally. Handlers attach a
  zod schema from `@clientry/shared` with `@Body({ schema })`, `@Query({ schema })` or
  `@Param(name, { schema })` and type the parameter with the type inferred from that schema.
  No DTO classes, no `class-validator`. The pipe's `exceptionFactory` throws
  `RequestValidationError` with one `{ path, message }` entry per issue.
- Responses: a strict subclass of Nest 12's `StandardSchemaSerializerInterceptor`, registered
  globally. Each handler declares its status and response schema from shared with
  `@ResponseSchema(status, schema)`, which also documents it in Swagger, and the returned value
  is parsed through it, so fields outside the contract never leave the API. Unlike Nest's
  interceptor, every body goes through the schema as a whole, primitives and falsy values
  included, so `z.array(...)` works; a handler that returns a body without a schema fails with
  500, so a forgotten schema cannot leak fields. `@ResponseSchema` also sets the handler's
  status with `HttpCode`, so the status sent and the one documented cannot differ.
- `createApp(factory)` builds the app with `AppExpressAdapter` and the same options everywhere,
  then mounts the request id and pino-http middleware with `app.use`. Nest registers its body
  parser later, at init, so even a request with a malformed or oversized body gets an id, a log
  line and a `requestId` in its problem details.
- `main.ts` passes `NestFactory.create` as the factory, the test harness passes
  `createNestApplication` of a testing module; global pipe, interceptor and filter are `APP_*`
  providers in `AppModule`. Tests exercise the production pipeline, adapter included, not a copy.

**Errors**

- `DomainError` base class with a stable `code`, a human `detail` and optional `extensions`
  (extra problem members, such as readiness `checks`). Kinds, each a subclass that
  modules extend in their own `errors.ts`: `NotFoundError` (404), `ForbiddenError` (403),
  `ConflictError` (409), `ServiceUnavailableError` (503). `RequestValidationError` (400) lives
  next to them.
- One global `ProblemDetailsFilter` catches everything and answers with
  `Content-Type: application/problem+json` in RFC 9457 format:
  - `type` is `about:blank` and `title` is the HTTP status phrase, as RFC 9457 defines for
    problems fully described by their status. The machine-readable identity is the `code`
    extension, so real type URIs can come later without breaking clients.
  - `code`: the domain error's own code (`CLIENT_NOT_FOUND`), otherwise the status name in
    `UPPER_SNAKE_CASE` (`NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `INTERNAL_SERVER_ERROR`). Validation
    uses `VALIDATION_FAILED`.
  - `detail`: the domain error's message, the message of a 4xx Nest `HttpException` or of an
    exposed 4xx `http-errors` error, or a generic sentence for anything else, 5xx
    `HttpException`s included. Stack traces and internal messages never reach the body. An
    unknown route answers `Cannot <METHOD> <path>` built from `instance`, since Nest's own
    message carries the query string, which may hold secrets; any other `NotFoundException`
    keeps its message. A malformed JSON body answers `Malformed JSON body`, since the parser's
    message quotes a fragment of the body.
  - `instance`: the request path without the query string.
  - `requestId`: the request id; `errors`: field errors for validation only; plus the domain
    error's `extensions`.
- Nest `HttpException`s (unknown route, malformed JSON) keep their status and are mapped to the
  same format. Nest itself converts only `SyntaxError` and `URIError` from Express middleware, so
  the filter also treats an error with a 4xx `status` and `expose: true` as an HTTP error: that
  is how body-parser reports an oversized body (413) or an unsupported charset (415).
- Nest mounts its not-found handler under the global prefix only, so `/` or `/health/nope` would
  get Express's HTML page. `AppExpressAdapter` mounts the same handler at the root as well, and
  every unknown path answers problem details.
- Everything else becomes 500 and is logged at `error` with the stack; 4xx are not logged by the
  filter, the request log already has the status.
- A linter rule forbids importing `*Exception` from `@nestjs/common` or any of its deep paths in
  `*.service.ts` and `*.repository.ts`: services throw domain errors only.

**Logging and request id**

- One pino instance: JSON logs, `pino-pretty` only when `NODE_ENV=development` (a dev
  dependency, absent from the production install). Level from `LOG_LEVEL`. Application code logs
  through Nest's `Logger` backed by `nestjs-pino`; bootstrap logs are buffered until pino is
  ready.
- pino-http is mounted by `createApp`, not by nestjs-pino's module middleware, which Nest
  registers after the body parser. nestjs-pino runs with `useExisting: true`: it reuses that
  `req.log` and only binds it to the request context, so service logs carry the request id.
- Every request is logged once on completion, including requests rejected before a handler
  (unknown route, body parse error), which an interceptor would miss. Successful `/health/*`
  responses get level `silent` through `customLogLevel`, since the pinger calls every 5 minutes;
  a failing readiness probe is logged like any other request.
- Request id: incoming `X-Request-Id` is reused when it is 1–128 characters of
  `[A-Za-z0-9._:-]`, otherwise a new UUID is generated. It is returned in the `X-Request-Id`
  response header, attached to every log line of the request, including service logs, and put
  into problem details.
- Redacted: `authorization` and `cookie` request headers. The request URL is logged without its
  query string and without the parsed `query`, which may carry tokens or emails. Response headers
  are not logged at all, only the status code: they add about 1.5 KB per line, and `set-cookie`
  never reaches the log.
- `uncaughtException` and `unhandledRejection` are logged as `fatal`, then the process exits
  with code 1. These handlers and the shutdown deadline live in `process-handlers.ts`, outside
  `main.ts`, so they are unit-tested on their own.

**Prisma (`infra/prisma`)**

- Prisma 7: `prisma-client` generator with output in `src/infra/prisma/generated` (gitignored),
  `@prisma/adapter-pg`, datasource URL in `prisma.config.ts`. Generation needs no database.
- `PrismaService` is the only place the client is constructed. `PrismaService`, the generated
  client and `@prisma/*` may be imported only from `src/infra/prisma/**` and
  `**/*.repository.ts`, enforced by `no-restricted-imports`, so services reach the database only
  through repositories. Health is no exception: its `SELECT 1` lives in `PrismaHealthRepository`.
- Repositories sit behind a contract: an abstract class (`HealthRepository`) is the DI token,
  the Prisma implementation is bound with `useClass`, and services and their unit tests depend
  only on the abstract class, so test doubles are plain objects checked by the compiler.
- Prisma `warn` events go to pino at `warn`; `error` events and queries with duration go to pino
  at `debug`, which is how N+1 is checked during development. Prisma emits `error` for every
  failed query, handled ones included (an expected unique violation becomes a 409), and real
  failures reach the caller and the exception filter anyway.
- The pg pool connects on first query, so the API starts while Postgres is down or asleep
  (Neon), and readiness reports it.
- Pool `connectionTimeoutMillis` is 5 s. The pg default is no timeout, so connects to a host that
  drops packets would hang and pile up in the pool even after the probe gives up.

**Redis (`infra/redis`)**

- `RedisService` wraps one `ioredis` client for the readiness probe. It connects at startup
  without blocking it and reconnects with backoff, so the API starts and keeps serving while
  Valkey is down. Connection errors are logged on state change, not on every retry. Only `ping`
  is used in this spec.
- The offline queue stays enabled, so a probe right after startup waits for the connection
  instead of failing before it is up. Fast failure while Valkey is down comes from a small
  `maxRetriesPerRequest` and the probe's own timeout.
- Queue connections are not promised to share this client: BullMQ workers need
  `maxRetriesPerRequest: null`, the opposite of a fast-failing probe. Spec 08 decides.

**Health (`modules/health`)**

- `GET /health/live`: 200, no dependency calls.
- `GET /health/ready`: pings Postgres (`SELECT 1`) and Valkey (`PING`) in parallel, each with a
  3-second timeout, so a hanging dependency reports `down` instead of hanging the probe.
- All up: 200. Any down: `ServiceUnavailableError` with code `NOT_READY` and `checks` in its
  extensions, answered as 503 matching `readinessProblemSchema`.
- Hidden from Swagger (`@ApiExcludeController`), now and later: probes are infrastructure, not
  part of the client contract, and the Vercel proxy does not forward `/health/*`, so
  "Try it out" from the demo would return 404.
- No `@nestjs/terminus`: two checks do not need it, its 503 body bypasses the common error
  format, and it has no Redis indicator without `@nestjs/microservices`.

**Swagger**

- UI at `/api/docs`, OpenAPI JSON at `/api/docs/openapi.json`, enabled in every environment:
  the live contract is part of the demo, and through the proxy it opens on the frontend domain.
- Request and response schemas come from the shared zod schemas through `@nestjs/swagger`'s
  native Standard Schema support (zod ≥ 4.2). No hand-written OpenAPI schemas.
- `ApiProblem` is one component; every operation documents its error responses with it and an
  example.
- The document has no operations in this spec; auth in spec 03 adds the first. Generation from
  zod is proven by the test-only controller (section 6).

**Graceful shutdown**

- `enableShutdownHooks(signals, { useProcessExit: true })`. Without `useProcessExit` Nest
  re-sends the signal to itself after cleanup: the exit code becomes 130 or 143 and a pino
  transport can lose its last lines.
- Nest's order is `onModuleDestroy` → `beforeApplicationShutdown` → HTTP server close →
  `onApplicationShutdown`. The server stops accepting connections and waits for in-flight
  requests. `server.close()` drops only connections idle at that moment; a keep-alive connection
  that finishes its request later would stay open for `keepAliveTimeout` and keep taking
  requests, which under the host's proxy traffic runs into the deadline. `AppExpressAdapter`
  therefore sweeps idle connections every 100 ms until the server has closed. Prisma disconnects
  and Redis quits in
  `onApplicationShutdown`, so a request still running never loses its connections. Then logs are
  flushed and the process exits with code 0.
- No `forceCloseConnections`: with it Nest's Express adapter destroys every open socket,
  including ones serving in-flight requests.
- Shutdown deadline of 10 s. Nest ignores repeated signals while shutting down, so a hung
  request would block even a second Ctrl+C. When the deadline passes, a `fatal` line is logged
  and the process exits with code 1. The timer is unref'd and never delays a clean exit.

**Shared contracts (`@clientry/shared`)**

- `@clientry/shared/common` adds `fieldErrorSchema` (`path`: dot-joined string, `""` for the
  root, ready for react-hook-form's `setError`; `message`: string) and `apiProblemSchema`:
  `problemDetailsSchema` plus required `code` and `requestId`, optional `errors`. `code` is a
  plain string, not an enum, so new codes never break old clients. Types `FieldError` and
  `ApiProblem`.
- New entry point `@clientry/shared/health`: `livenessResponseSchema`,
  `readinessResponseSchema` (`status: 'ok'`, `checks: { database, redis }`, each `up` or `down`),
  `readinessProblemSchema` (`apiProblemSchema` plus the same `checks`) and their types.

**Tooling**

- `@clientry/typescript-config/nest.json` (extends base): `nodenext` modules,
  `experimentalDecorators`, `emitDecoratorMetadata`, source maps, no declarations.
- `@clientry/eslint-config/nest` (extends base): `no-extraneous-class` allows decorated classes
  (modules); `consistent-type-imports`, with the parser told about decorator metadata so its
  fixes keep the value imports that injection needs; and the `*Exception` rule from the Errors
  section.
- `apps/api/eslint.config.mjs` holds the app-specific rules: the Prisma import restriction and an
  ignore for `src/infra/prisma/generated/**`, since flat config does not read `.gitignore` and
  the generated client would fail the strict typed rules, `filename-case` and `max-lines`.
- `apps/api/turbo.json` extends the root: a cached `generate` task (`prisma generate`, inputs
  `prisma/**` and `prisma.config.ts`, outputs the generated client); `build`, `typecheck`,
  `lint`, `test` and `dev` depend on it and on `^build`. CI needs no change.
- Vitest with `unplugin-swc` for decorator metadata, reading the same `.swcrc` as the build.
  `.swcrc` pins `useDefineForClassFields: false`, which Nest CLI forces on its own, so class
  fields behave the same in tests and in `dist`. Two Vitest
  projects: `unit` (`src/**/*.spec.ts` excluding `*.integration.spec.ts`, runs without Docker)
  and `integration` (`**/*.integration.spec.ts`).

**Integration test harness**

- Global setup starts one `postgres:18` and one `valkey/valkey:8.1` container per run (same
  images as Compose) through `@testcontainers/postgresql` and `@testcontainers/valkey`, runs
  `prisma migrate deploy`, then checks with `prisma migrate diff` that the migrated database
  matches `schema.prisma`: a schema change without a migration fails the run.
- `createTestApp(overrides?)` builds `AppModule` with `AppConfig` from the container URLs and
  `LOG_LEVEL=silent` through `createApp`, and returns the app and a supertest agent.
  Overrides allow unreachable URLs for dependency-down tests.
- Integration files run sequentially against the shared containers. Per-test data reset comes
  with the first tables in spec 03.

**Architecture decision records**

- `0002-backend-architecture.md`: separate Nest API over Next fullstack; modular monolith with
  controller → service → repository over hexagonal and CQRS.
- `0003-database-access.md`: PostgreSQL and Prisma 7 with the pg driver adapter and Prisma
  Migrate, over MongoDB, TypeORM and Drizzle.
- `0004-request-validation.md`: shared zod schemas validated and documented through Nest 12's
  native Standard Schema support, over `class-validator` and `nestjs-zod`.

### Out of scope

- Auth, guards, roles, rate limiting, `trust proxy` (spec 03).
- Dockerfile, image build in CI, Compose `full` profile, hosting variables (spec 05). The image
  is built and checked where it runs; the `full` profile also needs the web app from spec 04.
- BullMQ and queues (spec 08); only the Redis client exists here.
- First models and migration (spec 03).
- API versioning, response compression (the hosts compress), OpenTelemetry and `@nestjs/observe`.

## 3. Data model

None. `schema.prisma` has the datasource and generator only; there is no migration yet, and the
harness runs `migrate deploy` on the empty chain so the pipeline is proven before spec 03 adds
the first tables.

## 4. API

| Method | Path                     | Success                                           | Errors                                         |
| ------ | ------------------------ | ------------------------------------------------- | ---------------------------------------------- |
| GET    | `/health/live`           | 200 `livenessResponseSchema` `{ "status": "ok" }` | —                                              |
| GET    | `/health/ready`          | 200 `readinessResponseSchema`                     | 503 `readinessProblemSchema`, code `NOT_READY` |
| GET    | `/api/docs`              | Swagger UI                                        | —                                              |
| GET    | `/api/docs/openapi.json` | OpenAPI document                                  | —                                              |

The health endpoints are not in the OpenAPI document (see Health).

Every response carries `X-Request-Id`. Every error body matches `apiProblemSchema`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "Request validation failed",
  "instance": "/api/clients",
  "requestId": "0b6f4a1e-6c1d-4a3e-9f57-2a3c1d9e8b10",
  "errors": [{ "path": "email", "message": "Invalid email address" }]
}
```

Developer scripts in `apps/api`:

| Script                   | Does                                               |
| ------------------------ | -------------------------------------------------- |
| `pnpm dev`               | Nest watch mode, `--env-file` with the root `.env` |
| `pnpm build`             | Nest CLI build (SWC) to `dist/`                    |
| `pnpm start`             | `node dist/main.js`                                |
| `pnpm generate`          | `prisma generate`                                  |
| `pnpm db:migrate`        | `prisma migrate dev && prisma generate`            |
| `pnpm db:deploy`         | `prisma migrate deploy`                            |
| `pnpm test`              | both Vitest projects                               |
| `pnpm test:unit`         | unit project only, no Docker                       |
| `pnpm lint`, `typecheck` | as in other packages                               |

Prisma 7's `migrate dev` no longer runs generators, so `db:migrate` regenerates the client
itself. It takes no arguments, because pnpm would append them to `prisma generate`; the
migration name is asked interactively.

## 5. UI

None. Swagger UI is generated.

## 6. Tests

- **Unit**
  - Config: defaults applied, `NODE_ENV` falls back to `production`; every missing or invalid
    variable named in one error; values never appear in the message; `rediss://` accepted,
    `http://` rejected for `REDIS_URL`; URLs without a host (`redis:`, `redis://`,
    `postgresql:x`, `postgresql://`) rejected.
  - Shutdown deadline (fake timers): cleanup that never finishes → nothing at 10 s minus 1 ms,
    then `fatal` logged and exit code 1; cleanup that finishes in time → no `fatal`, timer does
    not fire.
  - Problem details filter: each `DomainError` kind → its status and code, `extensions` merged
    into the body; `HttpException` → status kept, code from status name, a 5xx one with the
    generic detail; error with a 4xx `status` and `expose: true` → that status; the same with
    `expose: false` or a 5xx status → 500; unknown error → 500 with generic detail and no
    internal message; validation error → `errors` array; `instance` without query string;
    unknown route → detail without the query string, any other `NotFoundException` keeps its
    message; headers already sent → the response is ended without a body.
  - Validation issues to field errors: one entry per issue, path segments joined with dots
    (`items.0.name`), `""` for the root.
  - Request id: valid header reused; too long, empty or forbidden characters replaced; missing
    header generates a UUID.
  - Request log level: 2xx on `/health/*` → `silent`; 503 on `/health/ready` → logged; other
    requests → normal level. Request serializer: URL without query string, no `query` field.
  - Health service, with the repository and Redis mocked: both up → ok; one down →
    `ServiceUnavailableError` with code `NOT_READY` and `checks`; a check that never resolves →
    still pending at the timeout minus 1 ms, `down` at the timeout (fake timers).
- **Integration** (testcontainers, supertest, `createTestApp`)
  - `/health/live` → 200; `/health/ready` → 200 with both checks `up`.
  - Valkey URL unreachable → app boots, live 200, ready 503 matching `readinessProblemSchema`
    with `code: NOT_READY`, `redis: down` and `database: up`; same for an unreachable Postgres
    URL.
  - Unknown route, under `/api` and outside it → 404 `application/problem+json`,
    `code: NOT_FOUND`, `requestId` equals the `X-Request-Id` header.
  - Valid `X-Request-Id` echoed; missing one generated.
  - Malformed JSON → 400 problem details with the fixed detail, nothing of the body quoted; body
    over the parser limit → 413 `PAYLOAD_TOO_LARGE`. In both, `requestId` is present and equals
    the `X-Request-Id` header.
  - Test-only controller, registered in the test module and never shipped: invalid body → 400
    with field errors; valid body → handler receives parsed output with unknown keys stripped;
    thrown unknown error → 500 without stack or message; response with an extra field → the
    field is not in the body; array response with a `z.array` schema → every item parsed;
    POST with `@ResponseSchema(201, …)` → 201; primitive body off its schema → 500; body
    returned without a response schema → 500, and in both the body does not leak.
  - OpenAPI document of the test app: contains the test-only controller's request and response
    schemas generated from zod, an array schema for a `z.array` response, only `201` for the
    POST, references `ApiProblem`, has no `/health` paths.
  - Migrations: deploy and the drift check in global setup pass.
  - Shutdown order: a slow test-only request that queries Postgres after a delay, in its handler
    when `app.close()` is called (the handler signals entry), completes with 200; after `close()`
    resolves, the Prisma and Redis connections are closed.
  - Keep-alive: the same request over a keep-alive agent completes with 200 and `close()`
    resolves well before Node's 5-second `keepAliveTimeout`.
- **e2e**: none.
- **Tooling checks**, done manually once on a throwaway file that is not committed; each must
  fail with the named rule: importing the generated Prisma client or `PrismaService` in a
  `*.service.ts` and in a file under `src/infra/redis`; importing `NotFoundException` from
  `@nestjs/common` and from `@nestjs/common/exceptions/index.js` in a `*.service.ts`.

## 7. Acceptance criteria

- [ ] `pnpm infra:up` + `pnpm dev`: the API listens on `PORT` with pretty logs; Swagger UI opens
      at `/api/docs` with no operations and no health endpoints.
- [ ] `/health/live` → 200 and `/health/ready` → 200 with infra up. `docker compose stop valkey`:
      ready → 503 with `redis: down`, live still 200; `docker compose start valkey`: ready
      recovers without restarting the API. Same for `postgres`.
- [ ] The API starts with both containers stopped.
- [ ] Without `DATABASE_URL` the process exits with code 1 before listening; the message names
      the variable and contains no secret values.
- [ ] One request's log lines share one request id; `X-Request-Id` is echoed; `authorization`
      and `cookie` are redacted. A successful health probe leaves no log line, a failing
      readiness probe does.
- [ ] After `pnpm build`, in `apps/api`: `node --env-file=../../.env dist/main.js`, started
      directly, not through pnpm or the Nest CLI, which on Windows terminate the child
      forcibly. Ctrl+C shuts down gracefully, the shutdown log lines are printed and the exit
      code is 0. SIGTERM is checked in the container in spec 05.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass
      locally with Docker running; a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test` (with integration tests), `pr-title` green.
- [ ] Every tooling check from section 6 fails as described.
- [ ] Clean install has no engine, peer dependency or ignored build script warnings; every
      install script is either allowed or denied in `allowBuilds`; all new dependencies are the
      latest stable versions, exact-pinned.
- [ ] `.env.example` lists the API variables; no `.env` in the repo.
- [ ] ADRs 0002–0004 are written.
- [ ] This spec is part of the PR.
