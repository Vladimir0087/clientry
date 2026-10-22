# 11 — Backend region

Status: approved

## 1. Goal

The API, Valkey and Postgres move from Frankfurt to Ohio, next to the web's server function, so a
page render or a proxied API call no longer crosses the Atlantic between the function and the API.

## 2. In scope / Out of scope

### In scope

**Layout**

```
docs/specs/11-backend-region.md
docs/adr/0015-backend-in-ohio.md
docs/adr/0008-deployment.md        # status line: the region is superseded by 0015
docs/adr/0011-web-on-netlify.md    # status line: the double crossing is removed by 0015
docs/deployment.md                 # topology, live values, setup in Ohio, limits, moving a region
docs/specs/15-deploy-stage-2.md    # the Oracle region is open again
```

No code, no migration, no new variable. The hosts change; the repository records it.

**Why Ohio**

- Netlify deploys functions of new sites to `cmh` (Ohio); another region is a Pro and Enterprise
  feature, and the plan never changes (ADR 0011). The site was created on 2026-10-11, after the
  2023-10-04 cut-off for older defaults.
- Today a signed-in page goes edge (near the visitor) → function (Ohio) → API (Frankfurt) → Neon
  (Frankfurt), and so does every proxied API call: the function and the API are an ocean apart, so
  each call pays a transatlantic round trip, more when the connection is new. After the move only
  the edge-to-function leg can cross an ocean, and for a visitor in the Americas nothing does.
- Render has an Ohio region, Neon has AWS `us-east-2` (Ohio), so the function, the API, Valkey and
  Postgres share one region.

**Hosting terms, checked on 2026-10-14**

- Render: 750 free instance hours per workspace per calendar month; a sleeping service uses none;
  using them all suspends every free web service until the next month. **Only one free Key Value
  instance can be active per workspace.** A region cannot be changed: a service is created anew in
  the new region. The internal Key Value URL works only within one region. The docs do not say
  which regions offer the Free instance type; the create flow shows it.
- Neon Free: 100 projects; per project 1 GB of storage and 100 CU-hours a month; compute scales to
  zero after 5 minutes and cannot be kept on. `aws-us-east-2` is available. The region is fixed at
  project creation. New since 2026-10-05: Free projects inactive for 90 days are subject to
  deletion; the hourly reminder sweep keeps the project active.
- Netlify: unchanged since ADR 0011.

**The new stack**

The setup of `docs/deployment.md` with Ohio for the region, everything else as today:

| Part     | Where                         | Settings                                                                                                                                               |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres | Neon Free, AWS `us-east-2`    | Postgres 18, project and database `clientry`, role `clientry_owner`, compute fixed at 0.25 CU, direct URL with `?sslmode=verify-full&sslaccept=strict` |
| Valkey   | Render Key Value Free, Ohio   | `clientry-valkey`, `noeviction`, empty IP allow list, internal URL                                                                                     |
| api      | Render web service Free, Ohio | image-backed with the existing GHCR credential, health check `/health/live`, auto-deploy off, no disk                                                  |

- The old Neon project is renamed to `clientry-frankfurt` before the new one is created, so the
  console never shows two projects with one name.
- Neon's compute is fixed at 0.25 CU (minimum and maximum), not an autoscaling range up to 2 CU:
  the budget in `docs/deployment.md` is counted at 0.25 CU, and a spike to 2 CU spends the month's
  100 CU-hours eight times faster. The demo's load fits 0.25 CU.
- The new web service is created from `ghcr.io/vladimir0087/clientry-api:sha-<commit>`, the commit
  that `/health/live` reports live, not `latest`: a branch dispatch can move `latest` to an
  untested image. Later deploys come from CI by digest, as now.
- `clientry-api` is still taken by the old service until step 10, so the new one is
  `clientry-api-ohio`. A rename would not change the `onrender.com` host, and visitors never see
  the API origin, so the name stays.
- Render environment as today, with the new `DATABASE_URL` and `REDIS_URL`. `JWT_PRIVATE_KEY` is
  copied from the old service's environment, so Netlify's `JWT_PUBLIC_KEY` stays and the switch
  changes only `API_URL` there. A new pair would gain nothing: everyone signs in again anyway.
- `TRUST_PROXY_HOPS` starts at `5`, the last measurement. The chain should be the same five hops
  (browser, Netlify's edge, Netlify's function, Cloudflare, Render's proxy), but a host change
  means measuring again, so the runbook's procedure runs, forged header included.

**Data**

The new database starts empty and gets its schema from the migrations at the first container
start. Nothing is copied: the live database holds only test accounts, the repository is private,
nobody else has the link, and the demo data comes with spec 12. Everyone signs in again, since the
sessions stay behind. A copy (Neon's Import Data Assistant, or `pg_dump` 18 in Docker, since the
local one is 17) would need the old API stopped first, so that no write lands after it.

**The move, in order**

The owner works the panels; the values and commands are prepared beforehand, and each step is
measured and checked in a browser.

1. Before anything changes:
   - the baseline latency, as in section 6;
   - Render → Billing: free hours used this month plus 24 for each remaining day, plus a few
     hours of overlap, stay under 750;
   - Netlify → Project configuration → Functions → Region shows Ohio;
   - the Render and Neon create flows offer the Free instance type in Ohio and `us-east-2`; the
     forms are left without submitting.
2. Neon: rename the old project, create the new one, fix its compute at 0.25 CU, copy its direct
   URL with the query string replaced; `SHOW TimeZone` in its SQL editor.
3. Render: delete the Frankfurt Key Value, then create `clientry-valkey` in Ohio. From here until
   step 6 the Frankfurt API keeps serving, but readiness fails and reminders are not queued: a
   queue add fails within seconds, and the write that triggered it still succeeds.
4. Render: create the web service in Ohio with its environment. Its first start runs the
   migrations on the empty database; `<new api>/health/ready` answers 200.
5. GitHub: secret `RENDER_DEPLOY_HOOK_URL` and variable `API_PUBLIC_URL` to the new service's.
   Netlify: `API_URL` to the new origin.
6. Actions → CI → Run workflow on `main`, deploy checked. `deploy-api` deploys the same commit to
   Ohio and passes the version wait at once; `deploy-web` builds the web with the new `API_URL`, and
   `smoke-live.sh` checks it. The web now talks to Ohio.
7. UptimeRobot: the API monitor's URL to the new origin. The Frankfurt service sleeps 15 minutes
   later and stops using free hours.
8. `TRUST_PROXY_HOPS`: the runbook's measurement; a different value is saved with Save only and
   shipped by another manual run.
9. The live checks and the second latency measurement of section 6.
10. Render: delete the Frankfurt web service. Neon: delete `clientry-frankfurt`.
11. `docs/deployment.md` gets the actual names, URLs, ids and the measurement date.

Rollback until step 10: the old hook, `API_PUBLIC_URL`, `API_URL` and the UptimeRobot URL back; the
Ohio Key Value deleted and a Frankfurt one created (one free instance per workspace), its URL on the
old service with Save only; a manual run. Accounts created in Ohio are lost. After step 10 there is
no rollback: the setup is repeated in any region.

If step 3 or 4 finds no Free instance type in Ohio, the move stops and rolls back.

**Docs**

- `docs/adr/0015-backend-in-ohio.md`:
  - the API, Valkey and Postgres follow the web's server function, whose region the free plan fixes;
  - alternatives: stay in Frankfurt (two crossings per call); a paid function region (the plan
    never changes); a new Vercel account (it would sidestep Vercel's decision); Virginia for Render
    and Neon (both have it, but it is a second region next to the function's); proxying `/api/*`
    from the edge function in `proxy.ts` straight to Frankfurt (API calls would skip the function,
    but page renders and the session prefetch still run in Ohio and cross twice, and the whole API
    path would move onto the edge runtime's polyfills);
  - consequences: one region for the function, the API and the data; a European visitor still pays
    the edge-to-function crossing; the data lives in the US; `TRUST_PROXY_HOPS` measured again;
    spec 15's region is open again; the measured latency before and after.
- `docs/adr/0008-deployment.md`: status line, the region is superseded by 0015. Its body stays.
- `docs/adr/0011-web-on-netlify.md`: status line, the double crossing is removed by 0015. Its body
  stays.
- `docs/deployment.md`:
  - topology: Render and Neon in Ohio;
  - Live and Consoles: the new service origin, Neon project id, `TRUST_PROXY_HOPS` with its date;
  - first-time setup: Ohio and `us-east-2` in steps 2, 3 and 7; Neon's compute fixed at 0.25 CU
    in step 2;
  - free-tier limits checked on 2026-10-14: per project for Neon, the 90-day deletion of inactive
    Free projects, one free Key Value per workspace;
  - Operations gains "Move to another region": the order of section 2, why the Key Value goes
    first, the free-hours overlap, the rollback window.
- `docs/specs/15-deploy-stage-2.md`: the Oracle home region was chosen next to Neon in Frankfurt;
  Neon is now in Ohio, and Oracle has no Ohio region, so the region is chosen again if the spec is
  revived.

### Out of scope

- Any code change. The session prefetch keeps its 1 s budget.
- Moving the web, a paid function region, any change of the Netlify plan.
- Pinning `TimeZone=UTC` for the pool (deferred from spec 08, a separate PR); section 3 only checks
  the new database's default.
- Neon's pooler, branches, separate roles; a custom domain.
- The Oracle region of spec 15; demo data (spec 12).

## 3. Data model

No tables and no migration. The new database gets the existing migrations at the API's first start.

`SHOW TimeZone` on the new database answers `GMT` or `UTC`, as in Frankfurt: adapter-pg sends dates
without an offset, and Postgres reads them in the session's zone, so another default would shift
every stored moment.

## 4. API

No contract change. The API origin changes to the new Render service; the web origin
`https://clientry.netlify.app` and Swagger at `<web>/api/docs` stay.

## 5. UI

No change. Pages and API calls answer faster; the "waking up" alert behaves as before.

## 6. Tests

- **Unit, integration, e2e**: nothing new; CI runs as is.
- **Live, automatic**: `wait-for-api-version.sh` and `smoke-live.sh` in the manual run of step 6.
- **Live, by hand and with `browser-verify`** at 390×844 and 1280×800: register on the empty
  database → `/` with the name; log out and in; after 15 idle minutes a reload makes one `refresh`
  200; a client, a deal moved on the board, a task with a reminder two minutes ahead whose toast
  and bell entry arrive (the queues and workers on the new Valkey); the dashboard; Swagger
  "Try it out" on `me`. No failed request except the expected 401 before a refresh, no console
  error except the browser's line for it.
- **Latency**, the same way before the move (step 1) and after it (step 9), from the owner's
  machine:
  - the proxy: one warm-up, then 20 sequential
    `curl -s -o /dev/null -w '%{time_starttransfer}\n' https://clientry.netlify.app/api/auth/me`
    without cookies; the median. A 401 from the guard touches neither Postgres nor Valkey, isn't
    cached, and has no rate limit, so it measures the edge, the function and the function-to-API
    leg;
  - a signed-in page: `browser-verify` reloads `/` ten times after a warm-up and reads
    `responseStart − requestStart` of the navigation, which covers the render and its prefetch
    calls; the median.

  Both medians go into the PR description and ADR 0015. The proxy median is expected to drop by
  about one transatlantic round trip (~0.1 s); if it does not drop, the move stops before step 10.

## 7. Acceptance criteria

- [ ] The step 1 checks are done and the baseline is recorded before anything changes.
- [ ] Neon: project `clientry` in `us-east-2`, Postgres 18, Free, compute fixed at 0.25 CU (minimum
      and maximum); `DATABASE_URL` on Render ends in `?sslmode=verify-full&sslaccept=strict`;
      `migrate deploy` in the first deploy log connects without a TLS error; `SHOW TimeZone`
      answers `GMT` or `UTC`.
- [ ] Render: Key Value and web service in Ohio on Free, with the settings of section 2; the web
      service's health check is `/health/live`; neither is connected to the repository.
- [ ] GitHub `RENDER_DEPLOY_HOOK_URL` and `API_PUBLIC_URL`, Netlify `API_URL` (plain) and the
      UptimeRobot API monitor point at the new service; the Netlify account is still on the legacy
      Free plan.
- [ ] A manual run on `main` deploys: `deploy-api` sees the commit on the new `/health/live`,
      `deploy-web` deploys and `smoke-live.sh` passes.
- [ ] `TRUST_PROXY_HOPS` is measured: `clientIp` in the Render log is the browser's public address,
      also with a forged `X-Forwarded-For`; the eleventh wrong password within a minute gets the
      429 alert.
- [ ] Every live check of section 6 passes.
- [ ] The proxy median and the page median are lower than before; both pairs are in the PR
      description and ADR 0015.
- [ ] The Frankfurt web service, Key Value and Neon project are deleted; nothing of the project is
      left in Frankfurt.
- [ ] `docs/deployment.md`, ADR 0015, the status lines of ADR 0008 and 0011, and spec 15 are
      written; `Frankfurt` is left in `docs/deployment.md` only in the history of the measurement
      and of the move, and `eu-central-1` nowhere.
- [ ] No new variable, so `.env.example` is unchanged.
- [ ] After the merge, the `main` run deploys by itself to Ohio and `/health/live` reports the merge
      commit.
- [ ] A day after the move, Render's memory graph for the new service stays under 450 MB, and Neon's
      monitoring shows compute suspended between the hourly sweeps while nobody uses the demo.
- [ ] This spec is part of the PR.
