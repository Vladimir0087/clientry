# 13 — End-to-end tests and full CI

Status: approved

## 1. Goal

Every pull request runs the plan's five product scenarios, the auth flows and the demo in a real
browser against the production builds of the web and the API, nothing deploys unless they pass, and
after each deploy a read-only tour checks the live demo.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/e2e/                                   # @clientry/e2e, private, never deployed
  package.json                              # e2e, e2e:live, lint, typecheck
  playwright.config.ts                      # the local stack; desktop and phone projects
  playwright.live.config.ts                 # the live tour: WEB_PUBLIC_URL, no stack
  tsconfig.json
  eslint.config.mjs                         # the shared config plus eslint-plugin-playwright
  global-setup.ts                           # starts the stack, returns its teardown
  support/
    origins.ts                              # the fixed ports and origins
    stack.ts                                # containers, migrations, keys, both servers, the demo wait
    visitor-address.ts                      # a random address in 198.18.0.0/15
    fixtures.ts                             # test.extend: the visitor header, a fresh owner, the demo owner, a second visitor
    api.ts                                  # arranging data through the web origin
    board.ts                                # board columns, a deal with its client, a mouse drag
    access-token.ts                         # an expired copy of the access token, signed with the run's key
    network.ts                              # the API requests a page sends
    axe.ts                                  # the axe scan and its rule set
    screens.ts                              # the pages the scans visit, each with content that marks its data loaded
  tests/
    auth.spec.ts
    clients.spec.ts
    deals.spec.ts
    tasks.spec.ts
    dashboard.spec.ts
    team.spec.ts
    tenancy.spec.ts
    demo.spec.ts
    phone.spec.ts
    accessibility.spec.ts
  live/
    demo-tour.spec.ts
apps/web/src/
  shared/api/query-client.ts                # typed mutation meta; a session end skips the hook
  features/auth/model/use-logout.ts         # logout marks itself as the session end
.github/workflows/ci.yml                    # the e2e job; deploy-api needs it; the live tour
turbo.json                                  # the e2e task
package.json                                # pnpm e2e
.gitignore                                  # apps/e2e/.logs
docs/testing.md
docs/deployment.md                          # deploys wait for e2e; the live tour
docs/adr/0017-e2e-tests.md
```

**The stack under test**

- `pnpm e2e` builds `@clientry/api` and `@clientry/web` for production through Turborepo and runs
  Playwright. The same command runs locally and in CI.
- Global setup, before any test:
  1. starts Postgres 18 with the `C.UTF-8` locale and Valkey 8.1 through testcontainers, the images
     of the API's integration tests;
  2. applies the migrations with `prisma migrate deploy` from `apps/api`;
  3. generates a throwaway ES256 key pair for the run;
  4. starts the API (`node dist/main.js`) on port 4000 with `NODE_ENV=production`, the containers'
     URLs, the private key, `TRUSTED_ORIGINS=http://localhost:3000` and `TRUST_PROXY_HOPS=1`, and
     waits for `/health/ready`;
  5. starts the web (`next start`) on port 3000 with `API_URL=http://127.0.0.1:4000` and the public
     key, and waits for `/login`;
  6. waits until `POST /api/auth/demo` answers 200: on a new database the API's first recurring
     tick, which runs at bootstrap, builds the demo (spec 12), so the suite also proves that path.
     Each attempt goes as a new visitor (Visitors and rate limits), since the demo route allows 10
     calls a minute per address.
- Teardown stops the web, the API, then the containers.
- The migration and both servers get every variable explicitly. The API never reads `.env`, and the
  web's and Prisma's loaders fill only variables that are not set, so a run never touches the
  development database, Valkey or keys.
- The ports are fixed: Next resolves the rewrite to `API_URL` at build time, and the builds of CI and
  `.env.example` both point it at `127.0.0.1:4000`. Global setup checks 3000 and 4000 first and
  fails at once naming a busy one, so a running `pnpm dev` is stopped before a run.
- The API runs in production mode, so its cookies are `Secure`; Chromium accepts them on
  `http://localhost`, as the Compose profile `full` already relies on (spec 05).
- Server output goes to `apps/e2e/.logs/api.log` and `web.log`, ignored by git and uploaded with the
  report from CI.

**Visitors and rate limits**

- Every browser context is its own visitor: it sends `X-Forwarded-For` with a random address from
  `198.18.0.0/15`, the range reserved for benchmarking (RFC 2544), through `extraHTTPHeaders`, so
  `page.request` sends it too. Next's rewrite passes the header to the API unchanged, and with
  `TRUST_PROXY_HOPS=1`, the one proxy in front of the API, the API counts that address.
- Each test thus has its own budget under the auth limits of specs 03, 09 and 12, and the suite
  never meets a 429, however many tests register.
- The API gets no switch to relax or turn off rate limits, the question spec 03 left to this spec:
  no code path in production turns them off. The limits stay proven by the integration tests.

**Test data**

- A test that needs an account registers a fresh one with `POST /api/auth/register` from its own
  browser context, so its page is signed in and its workspace is empty and its own. Emails are
  `<role>-<uuid>@e2e.example`.
- Data a test needs but is not about is arranged through the API from the same context (clients,
  deals, moves, tasks), with the request types of `@clientry/shared` and the `Origin` header that
  the API's origin check requires; what the test is about goes through the UI.
- The demo is shared, so demo tests only read: no record is created, moved, deleted or marked read
  in it. They run in parallel with the rest.
- Tests are independent and fully parallel: two workers in CI, four locally. The servers and the
  containers share the machine with the browsers, and Playwright's default of half the cores
  starved them past the 5 s assertions: 6 failures in 147 runs on a 12-core machine.
- Saved sessions (`storageState`) are not used: tests sharing one refresh token would rotate it
  against each other and trip reuse detection (spec 03).

**Locators**

- By role, label and text, as a user finds things; no test ids. An element a test cannot reach
  that way lacks an accessible name or label, and the fix goes into the app in this PR.
- A check of a page's layout, scan or absence waits first for content that only shows once the
  page's data has loaded: a page whose server prefetch timed out renders its skeleton first.

**Scenarios**

Desktop project unless marked. Scenario numbers are those of plan section 4.

| File            | Test                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | should land on the dashboard with the user's name when a visitor registers through the form                                                                                                       |
|                 | should show the server's error on the email field when the email is taken                                                                                                                         |
|                 | should return to the requested page when a signed-out visitor follows a link and logs in (`/deals` → `/login?next=/deals` → `/deals`)                                                             |
|                 | should keep the session when the access token has expired: opening a page renders it, the network shows one `refresh` 200                                                                         |
|                 | should end the session when the user logs out: `/login`, and Back stays signed out                                                                                                                |
|                 | should send no request after the logout's 204 when the user logs out from the dashboard                                                                                                           |
| `clients` (1)   | should open the client's card when the form is filled: name, email, phone, company, source, tags and notes shown                                                                                  |
|                 | should show field errors when the form is invalid                                                                                                                                                 |
|                 | should keep search and the tag filter in the URL after a reload and Back                                                                                                                          |
| `deals` (2)     | should show a new deal in New with its client and amount                                                                                                                                          |
|                 | should keep a deal in its new stage after a reload when it is dragged with the mouse; its history lists the move                                                                                  |
|                 | should move a deal when the keyboard is used: Space, an arrow, Space                                                                                                                              |
|                 | should return the card to its column with an error toast when the server rejects the move (`page.route` answers it with a 409 problem)                                                            |
|                 | should mark a deal won when it is moved to Paid                                                                                                                                                   |
| `tasks` (3)     | should list a task under its assignee when it is created for a client with a due time and the "1 hour before" reminder                                                                            |
|                 | should show the reminder in the bell when its time comes: a task arranged with a reminder 5 s ahead, reloads until "Notifications, 1 unread", the item names the task and opens it                |
|                 | should move a task to the done ones when it is marked as done                                                                                                                                     |
| `dashboard` (4) | should reflect the workspace's deals: with two open deals and one moved to Paid arranged, the open deals, the money in work, the won chart and the feed show them                                 |
| `team` (5)      | should let a manager join when a second visitor opens the owner's invite link and registers; the owner's team page lists them                                                                     |
|                 | should limit the joined manager to the role table: no stage settings link, no team actions, delete on their own client and none on the owner's                                                    |
|                 | should show a new stage on the board when the owner adds it in the stage settings                                                                                                                 |
| `tenancy`       | should show not found when a user opens another workspace's deal or client by its URL                                                                                                             |
| `demo`          | should open the filled studio as its owner when the visitor explores the demo: the banner names Ann, every tile and both charts filled, the feed, cards in every open stage, the bell at 2 unread |
|                 | should open the studio as a manager when the visitor picks it: the banner names Max, no stage settings link, the bell at 1 unread                                                                 |
|                 | should show the team without owner controls in the demo: the members, the demo line, no "Rename", no invites                                                                                      |
|                 | should refuse a password login with a demo email like a wrong password                                                                                                                            |
| `phone`         | should fit the whole login card, the demo entry included, without scrolling                                                                                                                       |
|                 | should not scroll sideways on any page of the demo: dashboard, clients, a client, the board, a deal, tasks, team                                                                                  |
|                 | should scroll the board sideways inside its own container                                                                                                                                         |
| `accessibility` | should report no serious or critical violations on login, register, the dashboard, the client list and form, the board, a deal, the task list and form, and team, in the light and the dark theme |

- The reminder test arranges its task through the API because the form offers times by the minute;
  the form itself is covered by the test before it. It waits on the worker and Valkey for real.
- The rejected move uses `page.route` because no user action makes the API refuse a valid move;
  every other test talks to the real API.
- The session test replaces the access cookie with an expired copy of its token, signed with the
  run's key, which global setup hands to the workers. Without the cookie the web proxy treats the
  visitor as signed out and redirects to `/login`; only an expired token reaches the page and its
  refresh. Waiting out the 15-minute lifetime is not an option. The cookie expires before any page
  opens: an open page would send a refresh of its own, which the next load cuts off.
- The user's name is checked in the account menu: the dashboard shows no greeting. The money in
  work is the open deals tile's total; a task's assignee shows in the list filtered to anyone.
- Accessibility runs `@axe-core/playwright` with the WCAG 2.1 A and AA rules. Login and register are
  scanned signed out, the other pages as the demo owner, who has data on every page and whose scans
  only read. The theme follows the system (`next-themes`), so the dark pass emulates
  `colorScheme: 'dark'`. The violations it finds are fixed in this PR; one that needs a redesign
  instead is excused in `support/axe.ts` for its rule and its element only, with a one-line reason,
  so the rule still checks every other element, and its fix goes to a separate PR. Only serious and
  critical violations fail the test.
- Found and excused: `label-content-name-mismatch` on the account button, which shows the user's
  initials but is named "Account". Its look is a design decision for a separate PR.

**Logout from the dashboard**

- Found on the live demo: logging out from the dashboard sent its three queries again after the
  logout's 204; they met 401, a `refresh` met 401 and a second logout followed. The page still
  reached `/login`, but every logout left failed requests behind.
- Cause: every successful mutation invalidates the dashboard and the feed (spec 10), the logout
  included, and an open dashboard refetches at once, before the page leaves.
- Fix: mutations get a typed `meta`; the logout carries `isSessionEnd`, and the query client skips
  its success hook for such a mutation. Any later mutation that ends the session does the same.
- Covered by a unit test of the query client, a component test of the user menu and the `auth`
  e2e test that watches the network.

**Browser and projects**

- Playwright's own Chromium headless shell, the build pinned by the Playwright version in the
  lockfile, locally and in CI; not the installed Chrome, whose version moves with its updates.
- Locally it is downloaded once into Playwright's cache with
  `pnpm --filter @clientry/e2e exec playwright install --only-shell chromium`.
- `desktop`: 1280×800, every file but `phone`.
- `phone`: 390×844 with touch and mobile emulation, `phone` only.

**Runner settings**

- In CI: `forbidOnly`, one retry, two workers, the `github` reporter next to the HTML one. Locally:
  no retries, four workers. A test that passes only on its retry shows as flaky in the report.
- Trace, screenshot and video kept for failed tests.
- Playwright's default timeouts: 30 s per test, 5 s per assertion.

**Live tour**

- `live/demo-tour.spec.ts`, run by `pnpm --filter @clientry/e2e e2e:live` against `WEB_PUBLIC_URL`,
  Chromium desktop, no stack, two retries for a cold function.
- `/login` renders; "Explore the demo" opens the dashboard with the banner and filled tiles; the
  board has cards; the bell shows, with or without a count, since visitors may have read every
  notification; logging out returns to `/login`. It writes nothing but its own session, which the
  logout ends, so visitors never see it.
- `deploy-web` runs it after `smoke-live.sh`; a failure fails the run, as the smoke check does, and
  uploads the tour's trace as an artifact kept 7 days.

**CI**

- A new job `e2e` on pull requests, pushes to `main` and dispatches, in parallel with `lint`,
  `typecheck`, `test` and `image`; 20-minute timeout:
  1. checkout and the setup action;
  2. `pnpm --filter @clientry/e2e exec playwright install --with-deps --only-shell chromium`,
     without a cache, as Playwright's CI guide advises: the system packages install either way, and
     restoring the browser takes as long as downloading it;
  3. `pnpm e2e`;
  4. on failure, the HTML report, traces and server logs as one artifact kept 7 days.
- `deploy-api` needs `e2e` too, so nothing deploys unless the scenarios pass.
- `deploy-web` installs Chromium the same way and runs the live tour after `smoke-live.sh`; when the
  tour fails, its trace goes up as the `live-tour-trace` artifact, kept 7 days.
- The workflow and job names stay (`CI`; `lint`, `typecheck`, `test`, `image`, `e2e`): the badge and
  later required checks refer to them.
- With this job CI is the plan's full set (section 9): lint with format and shellcheck, typecheck,
  unit and integration tests, the image and its smoke test, e2e on every pull request, the PR title.

**Turborepo**

- An `e2e` task that depends on `@clientry/api#build` and `@clientry/web#build` and is never cached:
  it depends on Docker and the clock. The root `pnpm e2e` runs it; `pnpm test` does not.
- Turborepo's strict environment mode hides undeclared variables from tasks, so the task passes
  through `CI`, which the Playwright config reads.

**Documentation**

- `docs/testing.md`: the three levels and what each covers; the commands (`pnpm test`, the API's
  `test:unit`, the one-time browser install, `pnpm e2e`, one file, `--ui`, `--headed`, the trace
  viewer); the e2e stack and its ports; visitors and test data; reading a CI failure from its
  artifact.
- `docs/deployment.md`: deploys wait for `e2e`; the live tour after the smoke check.

**Architecture decision record**

- `0017-e2e-tests.md`: Playwright over Cypress (parallel runs without a paid service, several
  browser contexts in one test for the invite and tenancy cases, the trace viewer); the production
  builds against testcontainers over the Compose image (one command locally and in CI; the web
  never ships as an image, and the API's image keeps its smoke test; no development database); a
  fresh account per test over a shared seeded workspace or saved sessions (independent, parallel
  tests; shared refresh tokens trip reuse detection); a visitor address per context over a
  rate-limit switch (no production path that turns limits off); role and label locators over test
  ids (the suite checks accessible names as it goes); Chromium only over three engines (run time;
  the phone viewport covers layout); Playwright's pinned Chromium over the installed Chrome (the
  same browser locally and in CI, fixed by the lockfile); a read-only live tour over the full suite
  against the live host (the demo is shared with visitors). Consequences: e2e needs Docker and the
  ports 3000 and 4000; changed interface text changes tests; CI minutes.

**Budget**

- GitHub Actions: the `e2e` job adds its minutes to every run, against the 2000 a month of a private
  repository until spec 14 makes it public; the duration goes into the PR description.
- Netlify: the live tour is a few dozen function invocations per deploy.
- Neon: the tour runs right after a deploy, when the migrations have woken the compute.

### Out of scope

- Firefox, WebKit and real devices; visual regression snapshots.
- e2e against Netlify's local build (`netlify serve`) or the Compose image.
- A switch in the API that relaxes or turns off rate limits.
- Load and performance tests, Lighthouse; coverage reports and a coverage badge.
- Badges (spec 14): the README stays out of git until then and is rewritten in English there; the
  stable workflow and job names above are what the CI badge will point at.
- Required status checks on `main`: branch protection on a private repository needs a paid plan, so
  it comes with the public repository in spec 14.
- Screenshots and the GIF for the README (spec 14), which may reuse this setup.
- The daily demo reset and reminder timing beyond one delivery: the integration tests cover them.
- Automated dependency updates.

## 3. Data model

No tables and no migration.

## 4. API

No changes. Root scripts:

| Script     | Does                                                        |
| ---------- | ----------------------------------------------------------- |
| `pnpm e2e` | `turbo run e2e`: builds the API and the web, runs the suite |

`@clientry/e2e` scripts:

| Script              | Does                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `e2e`               | `playwright test` with the local stack                                 |
| `e2e:live`          | `playwright test --config playwright.live.config.ts`                   |
| `lint`, `typecheck` | as in the other packages, so `pnpm lint` and `pnpm typecheck` cover it |

## 5. UI

No new screens. The one changed behavior is the logout fix of section 2: a logout sends nothing
after its 204. Accessibility fixes that the locators or the axe checks need (missing names, labels
or contrast) go into the app and are listed in the PR description.

## 6. Tests

- **e2e**: the scenarios of section 2, on the `desktop` and `phone` projects; the live tour after
  each deploy.
- **Unit, integration, component**: for the logout fix, the query client skips the success hook
  for a mutation that ends the session, and the user menu's logout does not run it; `pnpm test`
  does not run e2e, and every existing suite passes unchanged.
- **Tooling checks**, done once on throwaway changes that are not committed; each must fail:
  - a `test.only` with `CI=true`: the run fails before any test;
  - "Explore the demo" renamed in the interface: the demo and phone tests fail, and the trace shows
    the page;
  - `pnpm dev` running: global setup fails naming the busy port;
  - `TRUST_PROXY_HOPS=0` for the API in the stack: registrations meet 429 after the tenth, so the
    visitor address is what keeps the suite under the limits.

## 7. Acceptance criteria

- [ ] With Docker running and the ports 3000 and 4000 free, `pnpm e2e` builds, runs both projects
      and passes; afterwards no container, process or port of the run is left.
- [ ] `pnpm --filter @clientry/e2e e2e --repeat-each 3` passes with no flaky test.
- [ ] The tooling checks of section 6 fail as described.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      lint covers `apps/e2e` with the recommended rules of `eslint-plugin-playwright`.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `e2e`, `pr-title` green; the `e2e` job
      takes under 15 minutes, its duration and the suite's are in the PR description.
- [ ] `deploy-api` needs `e2e`; `deploy-web` runs the live tour after `smoke-live.sh` and uploads its
      trace when it fails.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged; the live
      tour reads the existing `WEB_PUBLIC_URL` variable.
- [ ] No changed behavior in the app but the logout fix: logging out from the dashboard sends only
      the logout, locally and on the live URL; accessibility fixes are listed in the PR description.
- [ ] `docs/testing.md` and `docs/deployment.md` are written; ADR 0017 is written.
- [ ] After the merge, the `main` run passes `e2e`, deploys by itself, and the live tour passes in
      `deploy-web`.
- [ ] This spec is part of the PR.
