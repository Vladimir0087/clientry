# 05 — Deploy, stage 1

Status: approved

## 1. Goal

The app runs on free hosting (the web on Vercel, the API on Render with Neon and Render Key Value),
every green commit on `main` reaches it through CI, and sign-up, login and refresh work through the
Vercel proxy on the live URL.

## 2. In scope / Out of scope

### In scope

**Layout**

```
.dockerignore
.gitignore                               # .vercel
.nvmrc                                   # 24
package.json                             # engines, infra:full, infra:down, @types/node
compose.yaml                             # profile full: the API image
.env.example                             # pointer to the runbook, APP_VERSION note
.github/
  actions/setup/action.yml               # input that skips the throwaway web variables
  workflows/ci.yml                       # image, deploy-api, deploy-web; manual dispatch
  scripts/
    smoke-api-container.sh               # checks the API container of the full profile
    wait-for-api-version.sh              # polls /health/live until the new version answers
    smoke-live.sh                        # checks the live web, proxy and API
apps/api/
  Dockerfile
  package.json                           # prisma moves to dependencies, files, @types/node
  src/infra/config/                      # APP_VERSION
  src/infra/prisma/                      # pool options and timeouts
  src/infra/redis/                       # command timeout
  src/infra/logger/http-logger-options.ts # client IP, no geolocation headers
  src/modules/health/                    # version in liveness
  src/main.ts                            # version in the startup line
apps/web/
  vercel.json
  turbo.json                             # Vercel system variables pass through
  package.json                           # @types/node
  src/shared/lib/server-log.ts
  src/app/(app)/_lib/prefetch-session.ts # logs failures
packages/shared/
  package.json                           # files
  src/health/                            # version in livenessResponseSchema
docs/deployment.md                       # runbook
docs/adr/0008-deployment.md
```

**Runtime: Node 24 LTS**

- Vercel runs functions on Node 24.x at most (20.x, 22.x and 24.x are offered; checked
  2026-10-06), and the web's server code runs there. One major everywhere: `.nvmrc` becomes `24`,
  so CI, the API image and Vercel run the same Node. `engines.node` becomes `>=24`, so a local
  Node 26 still installs without warnings.
- Every `@types/node` in the workspace moves to the latest 24.x, so typecheck rejects an API newer
  than the runtime. The root lists it too: pnpm resolves the peers it installs automatically
  (commitlint's, vitest's in `@clientry/shared`) from the root, which would otherwise pick 26.
- Moving back to 26 once Vercel offers it is a separate PR.

**API image (`apps/api/Dockerfile`)**

- Multi-stage on `node:24-slim`, `linux/amd64`, build context the repo root. pnpm comes from
  `packageManager` through corepack, which Node 24 still ships.
- A base stage adds `openssl` and `ca-certificates`, and both the build and the runtime stage
  start from it: Prisma's install script picks the schema engine binary by the OpenSSL it finds,
  and the engine's TLS uses the system's libraries and roots, which the slim image lacks.
- Build stage: the workspace manifests and the lockfile are copied before the sources, so a commit
  that changes only code keeps the install layer. Frozen install of `@clientry/api` and its
  workspace dependencies, the pnpm store as a BuildKit cache mount;
  `turbo run build --filter=@clientry/api` (shared, Prisma generate, Nest build); then
  `pnpm --filter @clientry/api deploy --prod` assembles a self-contained runtime tree with
  `@clientry/shared` copied in, not linked.
- `pnpm deploy` copies a package's whole directory, `src` and `test` included, unless its
  `package.json` lists `files`: `apps/api` lists `dist`, `prisma` and `prisma.config.ts`,
  `packages/shared` lists `dist`.
- Runtime stage holds only that tree: production dependencies, `dist`, `prisma/` (schema and
  migrations), `prisma.config.ts`, `package.json`. No sources, tests, dev dependencies
  (`pino-pretty`, `vitest`, `typescript`) or `.env`, neither in the API nor in `@clientry/shared`.
- `prisma` moves from dev dependencies to dependencies: the container runs `migrate deploy`.
- Runs as the image's `node` user with `NODE_ENV=production`. `APP_VERSION` comes from a build
  argument (the commit SHA in CI, `local` otherwise), declared last, so a new commit does not
  invalidate the earlier layers.
- Start: `prisma migrate deploy`, then `exec node dist/main.js`, so Node replaces the shell as
  PID 1 and receives SIGTERM itself. No init process: nothing forks once the migrations finish. A
  failed migration exits non-zero and the API never listens.
- Migrations run while the previous version still serves (Render deploys without downtime), so
  every migration must work with the code before it. The two-step rule for dangerous changes now
  matters in production.
- Listens on `PORT`; Render sets its own.
- OCI labels `org.opencontainers.image.source` (links the GHCR package to the repo, which keeps it
  private) and `org.opencontainers.image.revision`.
- `.dockerignore`: `.git`, every `node_modules`, `dist`, `.next`, `.turbo`, `.vercel`, coverage,
  `.env` and `.env.*`, `docs`, `.claude`, and the web app's sources (its `package.json` stays for
  the workspace install). `.gitignore` gains `.vercel`, which `vercel pull` writes.

**Compose profile `full`**

- `compose.yaml` gains service `api` under profile `full`: built from `apps/api/Dockerfile` as
  image `clientry-api:local`, starts after `postgres` and `valkey` are healthy, port
  `127.0.0.1:4000:4000`, `stop_grace_period` 15 s (the shutdown deadline is 10 s), healthcheck on
  `/health/ready` through `node -e` and `fetch`, since the slim image has no curl.
- Environment as in production: `NODE_ENV=production`, Postgres and Valkey by their Compose
  service names, `JWT_PRIVATE_KEY` from the root `.env`, `TRUSTED_ORIGINS=http://localhost:3000`,
  `TRUST_PROXY_HOPS=0`. The key is passed as `${JWT_PRIVATE_KEY}`, not `${JWT_PRIVATE_KEY:?}`:
  Compose interpolates services of inactive profiles too, so a required variable would break
  `pnpm infra:up` without a key. An empty key stops the container with the API's own config error
  naming the variable.
- `pnpm infra:full` runs `docker compose --profile full up -d --build --wait`. The container
  replaces the native API, and the web runs natively against it with
  `pnpm --filter @clientry/web build` and `start`. Secure cookies work: browsers treat
  `http://localhost` as a secure context. `pnpm infra:up` keeps starting only Postgres and Valkey;
  `pnpm infra:down` becomes `docker compose --profile full down`, so it removes the `api`
  container too.
- The profile holds the API only. The web ships to Vercel as a Vercel build on both hosting
  stages, so a web Dockerfile would be a third build path that nothing deploys.

**API changes**

- Pool options move into one function next to `PrismaService`:
  - `connectionTimeoutMillis` 5 s, as now;
  - `statement_timeout` 10 s: Postgres cancels a runaway statement;
  - `query_timeout` 15 s: the client gives up on a connection that stopped answering, and that
    client is destroyed rather than returned to the pool, so a dead network cannot exhaust it;
  - `idleTimeoutMillis` 10 s, pg's default written down: idle connections close soon after the
    last request, so an idle API never keeps Neon's compute awake.
- Redis: `commandTimeout` 2 s on the probe client, so a command on a connection that stopped
  answering rejects instead of waiting for TCP to notice. Queue connections in spec 08 set their
  own.
- `APP_VERSION`: optional, 1–64 characters of `[A-Za-z0-9._-]`, default `local`.
  `GET /health/live` answers `{ "status": "ok", "version": "<APP_VERSION>" }`, and the startup
  line names it. CI waits for this field to know the new deploy is serving, and it tells which
  commit is live.
- Request log lines:
  - gain `clientIp`, `req.ip` as Express resolves it with `trust proxy`, so `TRUST_PROXY_HOPS` is
    checked by reading one line;
  - drop `x-vercel-ip-*` headers: Vercel adds the visitor's city, region and coordinates to every
    proxied request, and the log has no use for them. `x-vercel-id` and `x-forwarded-for` stay.

**Web changes**

- `shared/lib/server-log.ts` (`server-only`) writes one JSON line per event to stdout in pino's
  shape (`level`, `time`, `msg`, then fields); Vercel keeps stdout as runtime logs. No logger
  dependency for one call site, and `no-console` stays an error.
- `prefetchSession` still renders without data on any failure, and now logs one `warn`
  `Session prefetch failed` with `reason` (`timeout`, `http`, `network`, `contract`,
  `unexpected`), plus `status`, `code` and `requestId` for an HTTP failure. Never a cookie or a
  token.
- `apps/web/vercel.json`:
  - `regions: ["fra1"]`: the proxy, page rendering and the prefetch run in Frankfurt, next to the
    API and the database;
  - `git.deploymentEnabled: false`: the project has no Git connection, and this keeps Vercel from
    building on push if one is ever added; production deploys come only from CI, and there are no
    preview deployments;
  - `installCommand` `pnpm install --frozen-lockfile` and `buildCommand`
    `turbo run build --filter=@clientry/web`, so `@clientry/shared` is built first.
- Vercel toolbar: it is injected into preview deployments, and there are none; it is also turned
  off for production in the project settings. The nonce CSP stays as it is, without `vercel.live`.
- HSTS: Vercel itself sends `Strict-Transport-Security: max-age=63072000; includeSubDomains;
preload` on `*.vercel.app`. Nothing in `next.config.ts`.
- `turbo.json` of the web lets Vercel's system variables (`VERCEL`, `VERCEL_*`) through strict env
  mode for `build`, without hashing them.

**CI and deploy**

Workflow `CI` runs on pull requests, on pushes to `main`, and by manual dispatch with input
`deploy` (default true).

| Job                         | Runs on                        | Does                                                                                        |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| `lint`, `typecheck`, `test` | every run                      | as now; `lint` also runs `shellcheck` on `.github/scripts`                                  |
| `image`                     | every run                      | builds the API image, starts the `full` profile, smoke test; on `main` and dispatch, pushes |
| `deploy-api`                | `main` push, dispatch `deploy` | after the four above: deploys the pushed digest to Render and waits for it                  |
| `deploy-web`                | same                           | after `deploy-api`: builds the web, deploys it to Vercel production, checks the live site   |

- `image`:
  - Buildx with the GitHub Actions cache, loaded into the runner's Docker as `clientry-api:local`.
    No Node setup: the job needs Docker and OpenSSL only.
  - `docker compose --profile full up -d --wait --no-build` with a key pair generated in the job,
    then `smoke-api-container.sh`: `/health/ready` 200; `POST /api/auth/register` 201, which
    proves the migrations ran; the process is not root; `pino-pretty` and `vitest` are absent, and
    so are `src` and `test`, in the API and in `@clientry/shared`;
    `docker compose stop api` ends with exit code 0 within the grace period, and the log has the
    shutdown lines of spec 02. This is the SIGTERM check spec 02 left to the container.
  - Publishing, on a `main` push and on dispatch only: `docker push` of the very image that passed,
    tagged `sha-<commit>` and `latest`, to `ghcr.io/vladimir0087/clientry-api`; the job outputs
    its digest. `packages: write` is granted to this job alone.
- `deploy-api`: POST to the Render deploy hook with
  `imgURL=ghcr.io/vladimir0087/clientry-api@sha256:<digest>` (URL-encoded), so Render runs exactly
  the tested image, never whatever `latest` points at. The hook answers 200 when the deploy starts
  and 202 when it is queued behind a running one; both continue. Anything else fails the job: 400
  (a bad `imgURL`), 401, 404 (an image outside the service's repository), 409 (a suspended
  service). Then
  `wait-for-api-version.sh` polls `/health/live`
  every 10 s for up to 15 minutes until `version` equals the commit (the old instance keeps
  answering with its own until the switch), and checks `/health/ready` once, which wakes Neon once
  per deploy. A failed Render deploy leaves the old version live, the wait times out, the job
  fails.
- `deploy-web`: the setup action with the throwaway web variables skipped, then
  `vercel pull --environment=production`, `vercel build --prod`, `vercel deploy --prebuilt --prod`,
  with the Vercel CLI run as `pnpm dlx vercel@<exact version>`: no dependency and nothing installed
  outside the runner. The build runs on CI's Node and pnpm and takes `API_URL` and `JWT_PUBLIC_KEY`
  only from the Vercel project. Then `smoke-live.sh`.
- The throwaway `API_URL` and `JWT_PUBLIC_KEY` of spec 04 stay in every other job. In
  `deploy-web` they would win over the pulled values and bake a local address and a throwaway key
  into production, hence the input; `smoke-live.sh` would catch a wrong `API_URL` anyway.
- `smoke-live.sh <web> <api> [<commit>]`: `GET <web>/login` 200 with the nonce CSP and HSTS;
  `GET <web>/` without cookies redirects to `/login`; `GET <web>/api/docs/openapi.json` 200 JSON,
  so the proxy reaches the API; `GET <api>/health/live` reports the commit when given. The owner
  can run it by hand.
- The API deploys first, so a web build that calls a new endpoint never goes live before the API
  that serves it.
- `deploy-api` and `deploy-web` each have their own concurrency group (`deploy-api`,
  `deploy-web`) without cancelling: a running deploy always finishes. A group holds one running
  and one waiting job, and a newer waiting job cancels the older one, so the newest commit wins
  and the commits in between are skipped. Separate groups keep one run's `deploy-web` from
  cancelling another run's waiting `deploy-api`.
- Manual dispatch deploys the chosen branch. It is how this spec is checked on the live host before
  the merge, and later serves as a redeploy. It is also how a changed Vercel variable reaches
  production: the web is built in CI, and `API_URL` is baked into the rewrite there. A redeploy of the live commit passes the version wait at once, so only `smoke-live.sh` checks it.
  Dispatch with `deploy` false only publishes the image: the very first one, which the Render
  service is created from. Rollback uses the hosts' own
  tools: Render's rollback to an earlier deploy and Vercel's Instant Rollback. Migrations are
  forward-only, so a rolled-back API must still work with the migrated schema.
- Platform auto-deploys are off: neither host is connected to the repository. The Render service
  is image-backed, the Vercel project is created without importing the repo, and
  `git.deploymentEnabled: false` guards against a later connection.

GitHub secrets and variables live at repo level: a private repo on the free plan has no
environments. They move to a `production` environment once the repo is public (spec 13).

| Name                                 | Kind     | Value                            |
| ------------------------------------ | -------- | -------------------------------- |
| `RENDER_DEPLOY_HOOK_URL`             | secret   | the service's deploy hook        |
| `VERCEL_TOKEN`                       | secret   | account token, expires in a year |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | variable | from the Vercel project          |
| `API_PUBLIC_URL`, `WEB_PUBLIC_URL`   | variable | live origins                     |

**Hosting**

Free plans, checked on 2026-10-06:

| Part     | Where                            | Plan, region                                      | Limits that matter                                                                            |
| -------- | -------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| web      | Vercel Hobby                     | functions in `fra1`                               | Node 24.x at most; HSTS on `*.vercel.app`; the proxy waits up to 120 s for the API            |
| api      | Render web service, image-backed | Free, Frankfurt                                   | 512 MB, 0.1 CPU; sleeps after 15 min without traffic, about 1 min to wake; 750 h per month    |
| Valkey   | Render Key Value                 | Free, Frankfurt                                   | 25 MB, 50 connections, no persistence, internal URL only                                      |
| Postgres | Neon                             | Free, AWS `eu-central-1` (Frankfurt), Postgres 18 | 1 GB storage, 100 CU-hours per month, scales to zero after 5 min (cannot be disabled on Free) |
| images   | GHCR, private package            | —                                                 | storage and transfer currently free                                                           |
| pinger   | UptimeRobot                      | Free                                              | 5-minute interval, non-commercial use                                                         |

- One region: Render and Neon in Frankfurt, Vercel functions in `fra1`. Browsers reach the nearest
  Vercel edge, which proxies `/api/*` to Render.
- Render web service:
  - image `ghcr.io/vladimir0087/clientry-api:latest` with a registry credential: the GitHub user
    and a classic token with `read:packages` only (fine-grained tokens cannot read packages),
    expiring in a year. Render gets no access to the repository;
  - health check path `/health/live`, not `/health/ready`: Render probes it continuously, and a
    probe that queries Postgres would keep Neon awake around the clock and spend the 100 CU-hours
    in under three weeks. Migrations finish before the server listens, so a live process has
    already reached the database;
  - auto-deploy off, no disk. The shutdown delay stays at Render's default 30 s, above the
    API's 10 s deadline; Render sets it only through its API or a Blueprint.
- Render Key Value: `maxmemory-policy noeviction`, which BullMQ (spec 08) requires, since eviction
  would drop queued jobs silently; an empty IP allow list, so only services in the same region
  reach it through the internal URL.
- Neon: project and database `clientry`, the direct (not pooled) connection string ending in
  `?sslmode=verify-full&sslaccept=strict` and nothing else. One long-lived process with pg's pool
  of 10 needs no PgBouncer, and Prisma migrations need a direct connection anyway. One role for
  migrations and the app. The URL has two readers, and each parameter is for one of them:
  - pg, in the app, reads `sslmode`: `verify-full` verifies the certificate and the host name;
    `require`, which Neon's copied string carries, means the same to pg today but prints a
    deprecation warning on every start. pg ignores `sslaccept`;
  - Prisma's schema engine, in `migrate deploy`, knows only `prefer`, `disable` and `require` as
    `sslmode` and silently falls back to `prefer` for other values; it verifies the certificate
    only with `sslaccept=strict`, against the system roots that the image's base stage installs.
    Neon refuses connections without TLS anyway, so migrations never run in plain text. Checked
    against the Prisma 7 connection URL reference at implementation time.
- Vercel project: created without importing the repository (one request to Vercel's REST API with
  the account token), so Vercel gets no access to it, like Render. Then in the panel: root
  directory `apps/web`, Node 24.x, toolbar off, Web Analytics and Speed Insights off (they would
  need CSP changes).
- UptimeRobot: `GET <api>/health/live` every 5 minutes keeps the API awake without touching the
  database. 31 days × 24 h = 744 h fits the 750 h only while it is the workspace's single free
  web service. A second monitor on `GET <web>/login` alerts when the web is down. Alerts by email.
- Actual names and URLs are recorded in `docs/deployment.md`; a suffix is fine where a name is
  taken.

**Configuration**

| Variable           | Render (api)           | Vercel (web, production)       | Notes                                         |
| ------------------ | ---------------------- | ------------------------------ | --------------------------------------------- |
| `NODE_ENV`         | `production`           | —                              | Secure cookies                                |
| `LOG_LEVEL`        | `info`                 | —                              |                                               |
| `DATABASE_URL`     | Neon direct URL        | —                              | secret                                        |
| `REDIS_URL`        | Key Value internal URL | —                              |                                               |
| `JWT_PRIVATE_KEY`  | from `jwt:keygen`      | —                              | secret                                        |
| `TRUSTED_ORIGINS`  | `https://<web domain>` | —                              | the web origin only; Swagger opens through it |
| `TRUST_PROXY_HOPS` | measured, below        | —                              |                                               |
| `PORT`             | Render's own           | —                              | not set by us                                 |
| `APP_VERSION`      | baked into the image   | —                              | not set in the panel                          |
| `API_URL`          | —                      | `https://<api host>`           | not sensitive, see below                      |
| `JWT_PUBLIC_KEY`   | —                      | from the same `jwt:keygen` run | not sensitive, see below                      |

- The production key pair is generated once on the owner's machine; the private half goes only to
  Render and the public half only to Vercel, nowhere else. A mismatch shows as a login that lands
  back on `/login`. Rotation: both panels, then a manual dispatch, which redeploys both and sends
  every user to `/login` once (ADR 0007).
- Both Vercel variables are created as plain, not sensitive: `vercel pull` does not return
  sensitive values, so the CI build would stop at the web's env check. Neither is a secret.
- `.env.example` gains no hosting values: one comment points to `docs/deployment.md`, another
  says `APP_VERSION` comes from the image build.

**Client IP behind two proxies**

- A browser request reaches the API through Vercel's edge and Render's proxy. Vercel overwrites
  `X-Forwarded-For` with the visitor's address, so a client cannot spoof it through Vercel, and
  Render appends its own hops. `TRUST_PROXY_HOPS` must equal those hops; Render does not document
  them, so they are measured on the live host: deploy with `0`, log in once through the web, read
  `x-forwarded-for` and `clientIp` in the Render log, set the value at which `clientIp` is the
  browser's public address, redeploy. The procedure stays in `docs/deployment.md`; a host change
  means measuring again.
- With `0` every visitor shares one rate-limit bucket; that lasts only for the measurement.
- Known gap: the API also answers at its Render URL. A client calling it there directly can put
  any address into `X-Forwarded-For` and spread attempts over many buckets. Closing it needs a
  secret that only Vercel adds, which `rewrites` cannot do without sending every API call through
  a function. Accepted for the demo; argon2 on 0.1 CPU caps throughput anyway.
- Server-side calls (the session prefetch) come from Vercel's function and carry its address; `me`
  has no rate limit.

**Docs**

- `docs/deployment.md`, the runbook: topology; first-time setup of every service in order; panel
  settings and variables; the production key pair; the `TRUST_PROXY_HOPS` measurement; deploy,
  rollback and redeploy; token and credential expiry dates and rotation; free-tier limits with the
  date they were checked.
- `docs/adr/0008-deployment.md`:
  - build once in CI and deploy the image digest to Render, over Render building from Git (a
    second build, and Render would need repo access) and over a public image (exposes the code
    before launch);
  - web built in CI and deployed prebuilt, over Vercel's Git builds (no gate on green CI, a second
    toolchain, and Vercel detects pnpm only up to 10);
  - API before web; one region;
  - liveness as Render's health check because of Neon's compute budget;
  - neither host connected to the repository: the Vercel project is created through the API, not
    by importing the repo;
  - migrations at container start over Render's pre-deploy command, which free services lack and
    which would not carry over to the VPS of stage 2;
  - Node 24 everywhere because of Vercel;
  - Neon's direct connection over its pooler; `sslmode=verify-full` for pg and `sslaccept=strict`
    for Prisma's schema engine, so both readers of the URL verify the certificate;
  - the `X-Forwarded-For` gap of the direct Render URL;
  - repo-level secrets until the repo is public.

### Out of scope

- A web Docker image.
- A custom domain; preview deployments; a staging environment.
- A secret between Vercel and the API; a function in front of `/api/*`.
- Separate database roles for migrations and the app; Neon's pooler and branches.
- GHCR retention, image signing, SBOM, vulnerability scanning, Dockerfile linting.
- Error tracking, log drains, alerts beyond UptimeRobot's email; Vercel Analytics and Speed
  Insights.
- Demo data and "Log in as demo" (spec 11); e2e against the live host (spec 12); README and badges
  (spec 13); the VPS (spec 14).
- Moving back to Node 26.

## 3. Data model

No tables and no migration. The first deploy applies the existing migrations to the empty Neon
database.

## 4. API

| Method | Path           | Change                                                                             |
| ------ | -------------- | ---------------------------------------------------------------------------------- |
| GET    | `/health/live` | 200 `livenessResponseSchema`, now `{ "status": "ok", "version": "<APP_VERSION>" }` |

`@clientry/shared/health`: `livenessResponseSchema` gains `version`, a non-empty string. Nothing
else in the contract changes.

Root scripts:

| Script            | Does                                                 |
| ----------------- | ---------------------------------------------------- |
| `pnpm infra:full` | `docker compose --profile full up -d --build --wait` |
| `pnpm infra:down` | `docker compose --profile full down`, `api` included |

Live URLs, filled in at setup and kept in `docs/deployment.md`:

| What       | URL                                                           |
| ---------- | ------------------------------------------------------------- |
| web        | `https://<project>.vercel.app`                                |
| Swagger UI | `https://<project>.vercel.app/api/docs`                       |
| API probes | `https://<service>.onrender.com/health/live`, `/health/ready` |

## 5. UI

No new screens. The screens of spec 04 now run on the live host:

- `/login` and `/register` render without the API, so a visitor sees the form at once even while
  Render wakes up. The first request after a sleep can take about a minute; Vercel's proxy waits up
  to 120 s and the button keeps its spinner meanwhile. With the pinger running this is rare.
- Every screen is checked on the live host at 390×844 and 1280×800, in light and dark themes.

## 6. Tests

- **Unit, apps/api**
  - Env schema: `APP_VERSION` missing → `local`; `0123abc` and `v1.2.3-rc_1` accepted; a space, a
    slash or 65 characters → invalid config naming the variable, not the value.
  - Pool options: connection timeout 5 s, statement timeout 10 s, query timeout 15 s, idle timeout
    10 s, connection string from config.
  - Redis client options: command timeout 2 s; the other options as before.
  - Health service: liveness returns the configured version.
  - Request serializer: `clientIp` from `req.ip`; `x-vercel-ip-city` and `x-vercel-ip-latitude`
    dropped; `x-vercel-id` and `x-forwarded-for` kept; `cookie` and `authorization` still
    redacted.
- **Integration, apps/api**
  - `/health/live` → 200 with the version from the test config.
  - `SHOW statement_timeout` through the app's Prisma client → `10s`.
- **Unit, packages/shared**: `livenessResponseSchema` rejects a missing or empty `version`.
- **Unit, apps/web (node)**
  - Server log: one line per call, valid JSON with `level`, `time`, `msg` and the fields, written
    to stdout.
  - Session prefetch: a 503 with a request id, a 401, a response slower than 1 s, a refused
    connection and a body off the schema → exactly one `warn` line each with the matching `reason`,
    plus `status`, `code` and `requestId` for HTTP; success and an `expired` cookie → no line; the
    cookie value never appears. The existing prefetch tests stay.
- **Container**: `smoke-api-container.sh` in the `image` job, as in section 2.
- **Live**: `wait-for-api-version.sh` and `smoke-live.sh` on every deploy, as in section 2.
- **e2e**: none (spec 12). The live checks of section 7 are done by hand and with
  `browser-verify` against the live URL.
- **Tooling checks**, done once on throwaway changes that are not committed; each must fail:
  - a migration with invalid SQL: `pnpm infra:full` fails, the `api` container exits non-zero and
    never listens;
  - an unquoted variable in a script under `.github/scripts` (`shellcheck` in `lint`);
  - a call to an API that exists only in Node 26 (typecheck).

## 7. Acceptance criteria

- [ ] `.nvmrc` is `24`, `engines.node` is `>=24`, every `@types/node` is on 24.x. Install,
      `build`, `lint`, `typecheck`, `test` and `format:check` pass on Node 24 in CI and on the
      owner's Node 26, without engine warnings.
- [ ] `pnpm infra:full` builds the image and brings `api` to healthy; the web, built and started
      natively against it, registers, logs in and refreshes. `docker compose stop api` exits
      with 0 within 15 s and logs the shutdown lines.
- [ ] `pnpm infra:up` starts Postgres and Valkey even with an empty `JWT_PRIVATE_KEY`;
      `pnpm infra:down` after `pnpm infra:full` leaves no container of the project.
- [ ] The image runs as non-root and holds no dev dependencies, sources, tests or `.env`, neither in
      the API nor in `@clientry/shared`; its size is in the PR description.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; nothing is pushed to
      GHCR from a pull request.
- [ ] Neon, Render (service and Key Value), the GHCR credential, Vercel, GitHub secrets and
      variables, and UptimeRobot are set up as `docs/deployment.md` describes; every hosting
      variable of section 2 is set in its panel; `.env.example` is updated. Neither Render nor
      Vercel is connected to the repository; both Vercel variables are plain, not sensitive.
- [ ] `DATABASE_URL` on Render ends in `?sslmode=verify-full&sslaccept=strict`; the API starts
      without pg's SSL deprecation warning, and `migrate deploy` in the Render deploy log connects
      without a TLS or certificate error.
- [ ] A manual dispatch of this branch deploys: `deploy-api` deploys the digest and sees the commit
      on `/health/live`, `deploy-web` deploys and `smoke-live.sh` passes.
- [ ] Live: register → `/` with the name; both cookies on the web domain with `Secure`, `HttpOnly`
      and the `SameSite` and paths of spec 03; no token in the page source.
- [ ] Live: after 15 idle minutes a reload renders without visiting `/login`, and Network shows one
      `refresh` 200, so the refresh cookie crosses the Vercel proxy both ways.
- [ ] Live: log out → `/login`; Back stays signed out.
- [ ] Live: `curl` login through the web with `Origin: https://evil.example` → 403
      `UNTRUSTED_ORIGIN`.
- [ ] `TRUST_PROXY_HOPS` is measured and set: `clientIp` in the Render log is the browser's public
      address; the eleventh wrong password within a minute gets the 429 alert, and right after it
      a login from another network (a phone on mobile data) still works.
- [ ] Live: pages carry the nonce CSP, HSTS and the headers of spec 04; no CSP violation in the
      console; no Vercel toolbar.
- [ ] Live: Swagger UI opens at `<web>/api/docs`, and "Try it out" on `me` works after logging in.
- [ ] Render's health check is `/health/live`; 10 minutes without visitors leave Neon's compute
      suspended in its console while the API stays awake.
- [ ] With the pinger paused until the API sleeps, the login form renders at once and the first
      login succeeds through the proxy within Vercel's 120 s.
- [ ] Render logs: one JSON line per request with `clientIp`, no `x-vercel-ip-*` headers, no
      cookies. A failed session prefetch shows one `warn` line in Vercel's runtime logs.
- [ ] `browser-verify` against the live URL over the screens of spec 04 at both sizes and in both
      themes: no failed requests except the expected 401 before a refresh, and no console errors
      except the browser's own line for that 401.
- [ ] After the merge, the `main` run deploys by itself and the live `/health/live` reports the
      merge commit.
- [ ] `prisma` is in `dependencies`; every install script is allowed or denied in `allowBuilds`;
      the Vercel CLI version is pinned in the workflow.
- [ ] Every tooling check from section 6 fails as described.
- [ ] `docs/deployment.md` and ADR 0008 are written.
- [ ] This spec is part of the PR.
