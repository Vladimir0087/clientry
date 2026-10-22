# 0008 — Deployment

Status: accepted; the web host is superseded by 0011, the region by 0015, the private image by 0018
Date: 2026-10-06

## Context

The demo must live on free hosting: the web on Vercel Hobby, the API on Render's free web service,
Postgres on Neon Free, Valkey on Render Key Value. The repository is private until launch. Every
green commit on `main` has to reach the live host without manual steps, the cookie session of
ADR 0005 and ADR 0007 has to work through Vercel's proxy, and nothing may quietly spend the free
budgets: Neon gives 100 CU-hours a month and Render sleeps an idle service.

## Decision

- **Build the API image once in CI and deploy its digest.** CI builds the image, runs it in the
  Compose profile `full` with a smoke test, pushes that very image to a private GHCR package and
  calls Render's deploy hook with `imgURL=<image>@sha256:<digest>`. Render runs exactly the tested
  image, never whatever `latest` points at.
- **Build the web in CI and deploy it prebuilt.** `vercel pull`, `vercel build --prod`,
  `vercel deploy --prebuilt --prod`, with the CLI version pinned in the workflow.
- **API before web.** `deploy-web` waits for `deploy-api`, which waits until `/health/live`
  reports the new commit, so a web build that calls a new endpoint never goes live before the API
  that serves it.
- **One region.** Render and Neon in Frankfurt, Vercel functions in `fra1`.
- **Liveness as Render's health check.** Render probes continuously; a probe of `/health/ready`
  would query Postgres every few seconds and keep Neon awake around the clock. Migrations finish
  before the server listens, so a live process has already reached the database.
- **Neither host is connected to the repository.** The Render service is image-backed with a
  `read:packages` token; the Vercel project is created through the REST API instead of importing
  the repository, and `git.deploymentEnabled: false` guards against a later connection.
- **Migrations at container start.** `prisma migrate deploy`, then `exec node dist/main.js`; a
  failed migration exits and the API never listens. Zero-downtime deploys are a paid Render
  feature, so a free deploy may stop the API briefly; every migration must still work with the
  code before it, since a rollback runs that code against the migrated schema.
- **Node 24 everywhere.** Vercel offers Node 24.x at most, and the web's server code runs there;
  `.nvmrc`, CI, the image and `@types/node` follow, so typecheck rejects newer APIs.
- **Neon's direct connection, verified TLS.** One long-lived process with pg's pool needs no
  PgBouncer, and Prisma migrations need a direct connection anyway. The URL ends in
  `?sslmode=verify-full&sslaccept=strict`: pg reads `sslmode` and verifies the certificate and the
  host name; Prisma's schema engine knows only `prefer`, `disable` and `require`, treats other
  values as `prefer`, and verifies the certificate only with `sslaccept=strict`.
- **Repository-level secrets** until the repository is public; then a `production` environment.

## Alternatives

- **Render builds from Git.** A second build of the same code, not gated on green CI, and Render
  would need access to the repository. Rejected.
- **A public image.** Render would need no credential, but the code would be public before
  launch. Rejected.
- **Vercel's Git builds.** No gate on green CI, a second toolchain, Vercel detects pnpm only up
  to 10, and preview deployments would appear. Rejected.
- **Render's pre-deploy command for migrations.** Free services lack it, and it would not carry
  over to the VPS of stage 2. Rejected.
- **Readiness as the health check.** Keeps Neon awake and spends its compute budget in under
  three weeks. Rejected.
- **Neon's pooler.** Pointless for one process with its own pool, and it does not support
  migrations. Rejected.
- **A secret header between Vercel and the API.** `rewrites` cannot add one; it would need a
  function in front of every API call. Rejected for the demo, see below.

## Consequences

- A broken image or migration fails CI or Render's deploy, and the previous version keeps serving;
  `deploy-api` times out and the run is red.
- A Vercel variable reaches production only through a CI run, since the web is built there. A
  manual dispatch redeploys both hosts.
- Rollback uses the hosts' own tools: Render's rollback and Vercel's Instant Rollback. Migrations
  stay forward-only.
- `TRUST_PROXY_HOPS` is measured on the live host, because Render does not document its proxy
  hops; a host change means measuring again.
- The API also answers at its Render URL, where a client can forge `X-Forwarded-For` and spread
  login attempts over many rate-limit buckets. Accepted for the demo; argon2 on 0.1 CPU caps
  throughput anyway.
- Tokens expire: the Vercel token and the GHCR token after a year. The runbook
  (`docs/deployment.md`) keeps their dates and the rotation steps.
