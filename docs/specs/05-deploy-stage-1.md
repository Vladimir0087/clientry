# 05 — Deploy, stage 1

Status: approved

Amended on 2026-10-11: Vercel declined the account at sign-up, so the web moves to Netlify
(ADR 0011). The API, the database, Valkey and the API's CI path are unchanged and live since the
first merge of this spec.

## 1. Goal

The app runs on free hosting (the web on Netlify, the API on Render with Neon and Render Key
Value), every green commit on `main` reaches it through CI, and sign-up, login and refresh work
through the web's proxy on the live URL.

## 2. In scope / Out of scope

### In scope

**Layout**

```
.dockerignore
.gitignore                               # .netlify
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
  netlify.toml
  package.json                           # @types/node, @netlify/plugin-nextjs
  src/shared/lib/server-log.ts
  src/shared/lib/submit-error.ts         # the waking-up alert
  src/shared/api/api-status.ts           # isApiUnreachable
  src/shared/config/env.ts               # the key's curve by its JWK name
  src/app/(app)/_lib/prefetch-session.ts # logs failures
packages/shared/
  package.json                           # files
  src/health/                            # version in livenessResponseSchema
docs/deployment.md                       # runbook
docs/adr/0008-deployment.md
docs/adr/0011-web-on-netlify.md
docs/specs/14-deploy-stage-2.md          # the web stays on Netlify
```

**Runtime: Node 24 LTS**

- Netlify's functions run on AWS Lambda with the Node major the build ran on, and new sites default
  to 24 (checked 2026-10-11); the web's server code runs there. One major everywhere: `.nvmrc`
  becomes `24`, so CI, the API image and the web's functions run the same Node. `engines.node`
  becomes `>=24`, so a local Node 26 still installs without warnings.
- Every `@types/node` in the workspace moves to the latest 24.x, so typecheck rejects an API newer
  than the runtime. The root lists it too: pnpm resolves the peers it installs automatically
  (commitlint's, vitest's in `@clientry/shared`) from the root, which would otherwise pick 26.
- Moving to 26 is a separate PR, once Lambda offers it.

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
- Zero-downtime deploys are a paid Render feature, so a free deploy may stop the old version
  first. Every migration must still work with the code before it, since a rollback runs that code
  against the migrated schema. The two-step rule for dangerous changes now matters in production.
- Listens on `PORT`; Render sets its own.
- OCI labels `org.opencontainers.image.source` (links the GHCR package to the repo, which keeps it
  private) and `org.opencontainers.image.revision`.
- `.dockerignore`: `.git`, every `node_modules`, `dist`, `.next`, `.turbo`, `.netlify`, coverage,
  `.env` and `.env.*`, `docs`, `.claude`, and the web app's sources (its `package.json` stays for
  the workspace install). `.gitignore` gains `.netlify`, where Netlify's CLI writes its state and
  the bundled functions.

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
- The profile holds the API only. The web ships to Netlify as a Netlify build on both hosting
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
  - drop the geolocation headers the web's host forwards, which the log has no use for. Netlify
    does not document them; the first live request log behind it showed `x-nf-geo` (base64 JSON
    with the visitor's city, postal code and coordinates) and `x-country`. `x-forwarded-for`,
    `x-nf-client-connection-ip` and `x-nf-request-id` stay.

**Web changes**

- `shared/lib/server-log.ts` (`server-only`) writes one JSON line per event to stdout in pino's
  shape (`level`, `time`, `msg`, then fields); Netlify keeps stdout as function logs. No logger
  dependency for one call site, and `no-console` stays an error.
- `prefetchSession` still renders without data on any failure, and now logs one `warn`
  `Session prefetch failed` with `reason` (`timeout`, `http`, `network`, `contract`,
  `unexpected`), plus `status`, `code` and `requestId` for an HTTP failure. Never a cookie or a
  token.
- `apps/web/netlify.toml`:
  - build command `pnpm turbo run build --filter=@clientry/web`, so `@clientry/shared` is built
    first; publish directory `apps/web/.next`, relative to the repository root although the file
    sits in `apps/web`, because the CLI resolves it from the base directory;
  - plugin `@netlify/plugin-nextjs`, a dev dependency of the web pinned to an exact version, so the
    adapter changes only through the lockfile.
- The adapter turns the app into one server function (pages, route handlers and the `/api/*`
  rewrite) and one edge function for `proxy.ts`, which runs the Node-runtime proxy on Deno through
  the adapter's polyfills. A local `netlify build` and `netlify serve` on 2026-10-10 packaged both
  and put the response's nonce on every `<script>` tag; a signed-in request is first checked live.
  That check found one gap: Deno names the P-256 curve `p256` where Node says `prime256v1`, so
  the web's key check compares the curve's JWK name, `P-256`, which both runtimes share.
- `next.config.ts` stays as it is. The rewrite's proxy timeout keeps Next's default of 30 s, which
  equals Netlify's limit for a synchronous function.
- No Git connection, so Netlify has nothing to build by itself (its build settings appear only
  once a repository is linked): production deploys come only from CI,
  and there are no deploy previews or branch deploys. Netlify's drawer is injected only into those,
  so the nonce CSP stays as it is.
- HSTS: Netlify itself sends `Strict-Transport-Security: max-age=31536000; includeSubDomains;
preload` on `*.netlify.app` (seen on another site on 2026-10-10). Nothing in `next.config.ts`
  while the first deploy shows it there; if it does not, the same header joins the security
  headers in `next.config.ts`. `smoke-live.sh` fails on every deploy if it goes missing.
- The web's `turbo.json` loses the Vercel pass-through and keeps its env list: the local Netlify
  build produced the adapter's standalone output in strict env mode without any change.

**CI and deploy**

Workflow `CI` runs on pull requests, on pushes to `main`, and by manual dispatch with input
`deploy` (default true).

| Job                         | Runs on                        | Does                                                                                        |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| `lint`, `typecheck`, `test` | every run                      | as now; `lint` also runs `shellcheck` on `.github/scripts`                                  |
| `image`                     | every run                      | builds the API image, starts the `full` profile, smoke test; on `main` and dispatch, pushes |
| `deploy-api`                | `main` push, dispatch `deploy` | after the four above: deploys the pushed digest to Render and waits for it                  |
| `deploy-web`                | same                           | after `deploy-api`: builds the web, deploys it to Netlify production, checks the live site  |

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
  every 10 s for up to 15 minutes until `version` equals the commit (until the switch the old
  version answers, or nothing does: a free deploy may stop it first), and checks `/health/ready`
  once, which wakes Neon once
  per deploy. A failed Render deploy leaves the old version live, the wait times out, the job
  fails.
- `deploy-web`: the setup action with the throwaway web variables skipped, then one
  `netlify deploy --prod` for `@clientry/web` in the production context, with the commit as the
  deploy's message. The CLI runs as `pnpm --package=netlify-cli@<exact version> dlx netlify`
  (pnpm's `dlx` refuses a package with two binaries otherwise): no dependency and nothing installed
  outside the runner. The command builds on CI's Node and pnpm, takes `API_URL` and
  `JWT_PUBLIC_KEY` only from the Netlify site, uploads the result and publishes it; a failed build
  publishes nothing. Then `smoke-live.sh`. The job runs on every deploy, without the temporary
  `VERCEL_PROJECT_ID` condition.
- The throwaway `API_URL` and `JWT_PUBLIC_KEY` of spec 04 stay in every other job. In
  `deploy-web` they could shadow the site's values and bake a local address and a throwaway key
  into production, hence the input; `smoke-live.sh` would catch a wrong `API_URL` anyway.
- `smoke-live.sh <web> <api> [<commit>]`: `GET <web>/login` 200 with the nonce CSP and HSTS, and
  every `<script>` tag carries the CSP's nonce; `GET <web>/` without cookies redirects to
  `/login`; `GET <web>/api/docs/openapi.json` 200 JSON, so the proxy reaches the API;
  `GET <api>/health/live` reports the commit when given. Requests through the web give up after
  35 s, past Netlify's 30 s; the direct API request waits up to 90 s for a sleeping service. The
  owner can run it by hand.
- The API deploys first, so a web build that calls a new endpoint never goes live before the API
  that serves it.
- `deploy-api` and `deploy-web` each have their own concurrency group (`deploy-api`,
  `deploy-web`) without cancelling: a running deploy always finishes. A group holds one running
  and one waiting job, and a newer waiting job cancels the older one, so the newest commit wins
  and the commits in between are skipped. Separate groups keep one run's `deploy-web` from
  cancelling another run's waiting `deploy-api`.
- Manual dispatch deploys the chosen branch. It is how this spec is checked on the live host before
  the merge, and later serves as a redeploy. It is also how a changed Netlify variable reaches
  production: the web is built in CI, and `API_URL` is baked into the rewrite there. A redeploy of
  the live commit passes the version wait at once, so only `smoke-live.sh` checks it. Dispatch with
  `deploy` false only publishes the image: the very first one, which the Render service is created
  from.
- Rollback uses the hosts' own tools: Render's rollback to an earlier deploy, and on Netlify
  "Publish deploy" on an earlier production deploy. The next CI deploy publishes over a Netlify
  rollback; a rollback that must hold also locks auto publishing, and CI's web deploy fails while
  the site is locked. Migrations are forward-only, so a rolled-back API must still work with the
  migrated schema.
- Platform auto-deploys are off: neither host is connected to the repository. The Render service
  is image-backed; the Netlify site is created through Netlify's API without a repository, so it
  has nothing to build from.

GitHub secrets and variables live at repo level: a private repo on the free plan has no
environments. They move to a `production` environment once the repo is public (spec 13).

| Name                               | Kind     | Value                                     |
| ---------------------------------- | -------- | ----------------------------------------- |
| `RENDER_DEPLOY_HOOK_URL`           | secret   | the service's deploy hook                 |
| `NETLIFY_AUTH_TOKEN`               | secret   | personal access token, the longest expiry |
| `NETLIFY_SITE_ID`                  | variable | the site's id from the creating request   |
| `API_PUBLIC_URL`, `WEB_PUBLIC_URL` | variable | live origins                              |

**Hosting**

Free plans, checked on 2026-10-06 (the web on 2026-10-11):

| Part     | Where                            | Plan, region                                      | Limits that matter                                                                                              |
| -------- | -------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| web      | Netlify                          | legacy Free; functions in `us-east-2` (Ohio)      | per month 125k function invocations per site, 1M edge function invocations, 100 GB; a function stops after 30 s |
| api      | Render web service, image-backed | Free, Frankfurt                                   | 512 MB, 0.1 CPU; sleeps after 15 min without traffic, about 1 min to wake; 750 h per month                      |
| Valkey   | Render Key Value                 | Free, Frankfurt                                   | 25 MB, 50 connections, no persistence, internal URL only                                                        |
| Postgres | Neon                             | Free, AWS `eu-central-1` (Frankfurt), Postgres 18 | 1 GB storage, 100 CU-hours per month, scales to zero after 5 min (cannot be disabled on Free)                   |
| images   | GHCR, private package            | —                                                 | storage and transfer currently free                                                                             |
| pinger   | UptimeRobot                      | Free                                              | 5-minute interval, non-commercial use                                                                           |

- Render and Neon in Frankfurt. The web's edge function (the proxy) runs at the edge nearest the
  browser, but its server function runs in Ohio: choosing a function region is a paid feature. A
  page render, the session prefetch and every proxied API call cross the Atlantic twice, about
  0.2 s more per call than a function in Frankfurt; the prefetch's 1 s budget includes that.
  Accepted for the demo.
- Netlify account: the owner's existing one, still on the legacy Free plan of accounts created
  before September 2025. Its plan must never change: credit-based plans are one-way, and their free
  tier pauses every site when the month's credits run out. Going over the legacy limits applies a
  paid add-on, which an account without a card cannot pay, so its sites are paused; the demo's
  traffic is far below them.
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
- Netlify site: created without a repository (one request to Netlify's REST API with the personal
  access token), so Netlify gets no access to it, like Render. Then in the panel: the "Powered by
  Netlify" badge off (new Free projects get it on, and Netlify injects its script without the
  nonce, so the CSP would block it on every page); the two variables below; analytics, forms and snippet injection left off (they would need CSP
  changes). The account's GitHub App from earlier projects keeps access only to those
  repositories.
- UptimeRobot: `GET <api>/health/live` every 5 minutes keeps the API awake without touching the
  database. 31 days × 24 h = 744 h fits the 750 h only while it is the workspace's single free
  web service. A second monitor on `GET <web>/login` shows the web's status in the dashboard. No
  notifications: the owner checks the dashboard instead.
- Actual names and URLs are recorded in `docs/deployment.md`; a suffix is fine where a name is
  taken.

**Configuration**

| Variable           | Render (api)           | Netlify (web)                  | Notes                                         |
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
| `API_URL`          | —                      | `https://<api host>`           | plain, see below                              |
| `JWT_PUBLIC_KEY`   | —                      | from the same `jwt:keygen` run | plain, see below                              |

- The production key pair is generated once on the owner's machine; the private half goes only to
  Render and the public half only to Netlify, nowhere else. A mismatch shows as a login that lands
  back on `/login`. Rotation: both panels, then a manual dispatch, which redeploys both and sends
  every user to `/login` once (ADR 0007).
- Both Netlify variables are plain, not marked as secret. Neither is one, and `API_URL` is baked
  into the build output, which Netlify's secret scanning rejects for a variable marked secret.
  Both reach builds, functions and edge functions: the proxy reads them at runtime.
- `.env.example` gains no hosting values: one comment points to `docs/deployment.md`, another
  says `APP_VERSION` comes from the image build.

**Client IP behind two proxies**

- A browser request reaches the API through Netlify (its edge, then the server function, whose
  rewrite forwards the incoming headers) and Render's proxy, which appends its own hops. Neither
  documents what it does to `X-Forwarded-For`; Netlify guarantees only `x-nf-client-connection-ip`.
  `TRUST_PROXY_HOPS` must equal the hops after the browser's address, so they are measured on the
  live host: deploy with `0`, log in once through the web, read `x-forwarded-for` and `clientIp` in
  the Render log, set the value at which `clientIp` is the browser's public address, redeploy.
  Then a login through the web with a forged `X-Forwarded-For: 203.0.113.9` must still log the
  real address: whatever Netlify does with a client's own header, it must not choose `clientIp`.
  The procedure stays in `docs/deployment.md`; a host change means measuring again.
- With `0` every visitor shares one rate-limit bucket; that lasts only for the measurement.
- Known gap: the API also answers at its Render URL. A client calling it there directly can put
  any address into `X-Forwarded-For` and spread attempts over many buckets. Closing it needs a
  secret that only the web adds: Next's `rewrites` cannot add one, and Netlify's signed proxy
  header exists only for Netlify's own proxy rules, which this setup does not use. Accepted for the
  demo; argon2 on 0.1 CPU caps throughput anyway.
- Server-side calls (the session prefetch) come from Netlify's function in Ohio and carry an AWS
  address; `me` has no rate limit.

**Docs**

- `docs/deployment.md`, the runbook: topology; first-time setup of every service in order; panel
  settings and variables; the production key pair; the `TRUST_PROXY_HOPS` measurement; deploy,
  rollback and redeploy; token and credential expiry dates and rotation; free-tier limits with the
  date they were checked.
- `docs/adr/0008-deployment.md`:
  - build once in CI and deploy the image digest to Render, over Render building from Git (a
    second build, and Render would need repo access) and over a public image (exposes the code
    before launch);
  - web built in CI and deployed prebuilt, over the host's Git builds (no gate on green CI, a
    second toolchain);
  - API before web; one region;
  - liveness as Render's health check because of Neon's compute budget;
  - neither host connected to the repository;
  - migrations at container start over Render's pre-deploy command, which free services lack and
    which would not carry over to the VPS of stage 2;
  - Node 24 everywhere;
  - Neon's direct connection over its pooler; `sslmode=verify-full` for pg and `sslaccept=strict`
    for Prisma's schema engine, so both readers of the URL verify the certificate;
  - the `X-Forwarded-For` gap of the direct Render URL;
  - repo-level secrets until the repo is public.

  It was written for Vercel and stays as accepted; its status line points to ADR 0011 for the web.

- `docs/adr/0011-web-on-netlify.md`:
  - Netlify's legacy Free plan on the owner's existing account, over Cloudflare Workers (the free
    plan's 10 ms of CPU per request and 3 MB per worker do not fit a Next server), a second Render
    service (the pinged API already uses 744 of the workspace's 750 free hours) and a new Vercel
    account (it would sidestep Vercel's decision);
  - CLI build and deploy in CI, with the site created through the API, without a repository;
  - Next's rewrite for `/api/*` kept, over Netlify's proxy rules: those time out after 26 s, and
    the adapter's catch-all function would likely be matched before them;
  - the consequences: functions in Ohio, a 30 s limit on a proxied call, the plan that must not
    change, `TRUST_PROXY_HOPS` measured again, rollback that the next deploy overrides.
- `docs/specs/14-deploy-stage-2.md`: the web stays on Netlify; `API_URL` changes there.

### Out of scope

- A web Docker image.
- A custom domain; preview deployments; a staging environment.
- A secret between the web and the API; a function in front of `/api/*`; Netlify's proxy rules.
- A paid Netlify plan or function region; moving the account to credit-based pricing.
- Separate database roles for migrations and the app; Neon's pooler and branches.
- GHCR retention, image signing, SBOM, vulnerability scanning, Dockerfile linting.
- Error tracking, log drains, downtime notifications; Netlify Analytics.
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
| web        | `https://<site>.netlify.app`                                  |
| Swagger UI | `https://<site>.netlify.app/api/docs`                         |
| API probes | `https://<service>.onrender.com/health/live`, `/health/ready` |

## 5. UI

No new screens. The screens of spec 04 now run on the live host:

- `/login` and `/register` render without the API, so a visitor sees the form at once even while
  Render wakes up. Waking takes about a minute, and Netlify's function gives up after 30 s, so the
  first submit after a sleep fails; a retry once the API is up succeeds. With the pinger running
  the API does not sleep.
- A form alert tells that case apart: a server error whose body is not the API's problem details
  (the hosts' 500, 502 or 504 while the API is unreachable) shows "The server is waking up or
  busy. Try again in a minute." without a reference. The API's own errors keep "Something went
  wrong. Try again." with the request id. Every form and the delete dialog share it through
  `unexpectedAlert`; toasts stay as they are.
- Every screen is checked on the live host at 390×844 and 1280×800, in light and dark themes.

## 6. Tests

- **Unit, apps/api**
  - Env schema: `APP_VERSION` missing → `local`; `0123abc` and `v1.2.3-rc_1` accepted; a space, a
    slash or 65 characters → invalid config naming the variable, not the value.
  - Pool options: connection timeout 5 s, statement timeout 10 s, query timeout 15 s, idle timeout
    10 s, connection string from config.
  - Redis client options: command timeout 2 s; the other options as before.
  - Health service: liveness returns the configured version.
  - Request serializer: `clientIp` from `req.ip`; `x-nf-geo` and `x-country` dropped;
    `x-nf-request-id` and `x-forwarded-for` kept; `cookie` and `authorization` still redacted.
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
- **Unit, apps/web (jsdom)**
  - Unexpected alert: a 504 without problem details → the waking-up message without a reference;
    the API's own 500 → the generic message with its request id; a 404 without problem details →
    the generic message.
  - Login form: an HTML 502 from MSW → the waking-up alert without a reference.
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
- [ ] Neon, Render (service and Key Value), the GHCR credential, Netlify, GitHub secrets and
      variables, and UptimeRobot are set up as `docs/deployment.md` describes; every hosting
      variable of section 2 is set in its panel; `.env.example` is updated. Neither Render nor
      Netlify is connected to the repository (the site shows "Not linked"); both Netlify
      variables are plain; the account is still on the legacy Free plan.
- [ ] `DATABASE_URL` on Render ends in `?sslmode=verify-full&sslaccept=strict`; the API starts
      without pg's SSL deprecation warning, and `migrate deploy` in the Render deploy log connects
      without a TLS or certificate error.
- [ ] A manual dispatch of this branch deploys: `deploy-api` deploys the digest and sees the commit
      on `/health/live`, `deploy-web` deploys and `smoke-live.sh` passes.
- [ ] Live: register → `/` with the name; both cookies on the web domain with `Secure`, `HttpOnly`
      and the `SameSite` and paths of spec 03; no token in the page source.
- [ ] Live: after 15 idle minutes a reload renders without visiting `/login`, and Network shows one
      `refresh` 200, so the refresh cookie crosses the Netlify proxy both ways.
- [ ] Live: log out → `/login`; Back stays signed out.
- [ ] Live: `curl` login through the web with `Origin: https://evil.example` → 403
      `UNTRUSTED_ORIGIN`.
- [ ] `TRUST_PROXY_HOPS` is measured and set: `clientIp` in the Render log is the browser's public
      address, also when the request carries a forged `X-Forwarded-For`; the eleventh wrong
      password within a minute gets the 429 alert, and right after it a login from another
      network (a phone on mobile data) still works.
- [ ] Live: pages carry the nonce CSP, HSTS and the headers of spec 04; every `<script>` tag carries
      the nonce; no CSP violation in the console; a signed-in page renders through the edge proxy.
- [ ] Live: Swagger UI opens at `<web>/api/docs`, and "Try it out" on `me` works after logging in.
- [ ] Render's health check is `/health/live`; 10 minutes without visitors leave Neon's compute
      suspended in its console while the API stays awake.
- [ ] With the pinger paused until the API sleeps, the login form renders at once; the first
      submit ends within about 30 s in "The server is waking up or busy. Try again in a minute.",
      and a retry once the API is up logs in.
- [ ] Render logs: one JSON line per request with `clientIp`, no geolocation headers, no cookies.
      A failed session prefetch shows one `warn` line in Netlify's function logs.
- [ ] `browser-verify` against the live URL over the screens of spec 04 at both sizes and in both
      themes: no failed requests except the expected 401 before a refresh, and no console errors
      except the browser's own line for that 401.
- [ ] After the merge, the `main` run deploys by itself and the live `/health/live` reports the
      merge commit.
- [ ] `prisma` is in `dependencies`; every install script is allowed or denied in `allowBuilds`;
      the Netlify CLI version is pinned in the workflow and the adapter's in the web's
      `package.json`.
- [ ] Every tooling check from section 6 fails as described.
- [ ] `docs/deployment.md`, ADR 0008 and ADR 0011 are written; ADR 0008's status points to 0011;
      spec 14 names Netlify; no `vercel` is left in code, CI or the runbook.
- [ ] This spec is part of the PR.
