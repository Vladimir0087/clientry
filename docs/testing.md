# Testing

Three levels, all in CI on every pull request. The end-to-end decisions are in
[ADR 0017](adr/0017-e2e-tests.md).

| Level       | Where                                          | Covers                                                                                                                        |
| ----------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `apps/api/src/**/*.spec.ts`, `packages/shared` | services with doubled repositories, guards, config, schemas                                                                   |
| Integration | `apps/api/**/*.integration.spec.ts`            | each API module over HTTP against real Postgres and Valkey in testcontainers, two workspaces per module, rate limits, workers |
| Component   | `apps/web/src/**/*.spec.tsx`                   | screens and hooks in jsdom with Testing Library; the API is faked at the network level with MSW                               |
| End-to-end  | `apps/e2e`                                     | the plan's five product scenarios, auth, tenancy, the demo, phone layout and axe checks in Chromium against production builds |

## Commands

| Command                                                                     | Does                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm test`                                                                 | unit, integration and component tests of every package; needs Docker     |
| `pnpm --filter @clientry/api test:unit`                                     | the API's unit tests only, no Docker                                     |
| `pnpm --filter @clientry/e2e exec playwright install --only-shell chromium` | once per machine: Playwright's Chromium headless shell into its cache    |
| `pnpm e2e`                                                                  | builds the API and the web for production, then runs the whole e2e suite |
| `pnpm --filter @clientry/e2e e2e tests/deals.spec.ts`                       | one file, against the builds already in `dist` and `.next`               |
| `pnpm --filter @clientry/e2e e2e --ui`                                      | Playwright's UI mode: pick tests, watch them, step through the DOM       |
| `pnpm --filter @clientry/e2e e2e --headed`                                  | runs in a visible browser window                                         |
| `pnpm --filter @clientry/e2e exec playwright show-trace <trace.zip>`        | opens a failed test's trace                                              |
| `pnpm --filter @clientry/e2e e2e:live`                                      | the read-only tour of the live demo; needs `WEB_PUBLIC_URL`              |
| `pnpm media`                                                                | builds the API and the web, then writes the README's media; see below    |

`pnpm test` never runs the e2e suite. The filtered `e2e` commands do not build: after a change to
the API or the web, run `pnpm e2e` once or build that app first.

The headless shell runs the suite but opens no window. `--headed` needs Playwright's full Chromium
too: `pnpm --filter @clientry/e2e exec playwright install chromium`. UI mode and the trace viewer
open it, or an installed Chrome or Edge when it is missing.

## The e2e stack

Global setup starts everything before the first test and stops it after the last:

1. Postgres 18 (`C.UTF-8` locale) and Valkey 8.1 in testcontainers, the images of the API's
   integration tests;
2. `prisma migrate deploy` from `apps/api`;
3. a throwaway ES256 key pair for the run;
4. the API, `node dist/main.js`, on port 4000 in production mode with `TRUST_PROXY_HOPS=1`;
5. the web, `next start`, on port 3000 with `API_URL=http://127.0.0.1:4000` and the public key;
6. a wait until `POST /api/auth/demo` answers 200: the API builds the demo at its first tick.

- Every variable the migration and both servers need is set explicitly. The web's and Prisma's
  loaders fill only variables that are not set from the root `.env`, so a run never touches the
  development database, Valkey or keys.
- The ports are fixed: the web build bakes its rewrite to `API_URL` in. Setup fails at once naming
  a busy port, so stop `pnpm dev` before a run.
- `pnpm e2e` builds the web with `API_URL` and `JWT_PUBLIC_KEY` from the root `.env`, so the file
  must exist with `API_URL=http://127.0.0.1:4000`, as in `.env.example`; the run's own key replaces
  the public key when the web starts.
- The API's cookies are `Secure` in production mode; Chromium accepts them on `http://localhost`.
- Server output goes to `apps/e2e/.logs/` (`migrate.log`, `api.log`, `web.log`).
- Setup takes about a minute, most of it the containers.

## Visitors and test data

- Every browser context sends its own `X-Forwarded-For` address from `198.18.0.0/15`, the range
  reserved for benchmarking. The API trusts one proxy hop, Next's rewrite, so each context has its
  own budget under the auth rate limits. The API has no switch that relaxes them.
- A test that needs an account registers a fresh one from its own context (`owner` fixture), so
  its workspace is empty and its own. Emails look like `owner-<uuid>@e2e.example`.
- Data a test needs but is not about is arranged through the API from the same context
  (`support/api.ts`), with the request types of `@clientry/shared`; what the test is about goes
  through the UI.
- The demo workspace is shared by every test, so demo tests only read.
- Tests are independent and run fully parallel; saved sessions are not used, since contexts
  sharing one refresh token would trip its reuse detection.
- Locators go by role, label and text. An element a test cannot reach that way lacks an accessible
  name, and the fix belongs in the app.

## Projects and settings

- `desktop`: 1280×800, every file but `phone.spec.ts`. `phone`: 390×844 with touch and mobile
  emulation, `phone.spec.ts` only.
- In CI (`CI=true`): `test.only` fails the run, one retry, two workers, GitHub annotations. A test
  that passes only on its retry is marked flaky in the report. Locally: no retries, four workers;
  the servers share the machine, and more workers starve them past the 5 s assertions.
- A check of a page's layout, scan or absence first waits for content that only shows with the
  page's data (`support/screens.ts`): a page whose server prefetch timed out renders a skeleton.
- Trace, screenshot and video are kept for failed tests in `apps/e2e/test-results/`, the HTML report
  in `apps/e2e/playwright-report/`.
- Accessibility: `@axe-core/playwright` with the WCAG 2.1 A and AA rules, in the light and the dark
  theme; serious and critical violations fail. A known violation waits for its fix in `support/axe.ts`
  with its reason, excused for its one element only, so the rule still checks the rest.

## README media

`pnpm media` starts the e2e stack, drives the demo in Chromium and writes `docs/media/`, replacing
the files there. Run it by hand after a change to the interface and commit the files with the
change; neither CI nor `pnpm e2e` runs it. It needs what `pnpm e2e` needs: Docker, the browser and
free ports 3000 and 4000.

| File                 | What                                                                   | Theme | Viewport                   |
| -------------------- | ---------------------------------------------------------------------- | ----- | -------------------------- |
| `demo.gif`           | the tour: demo login, dashboard, a deal dragged, its history, the bell | light | 1280×800, encoded 960 wide |
| `dashboard.png`      | the owner's dashboard                                                  | light | 1280×800                   |
| `board.png`          | the deal board                                                         | dark  | 1280×800                   |
| `client.png`         | a client's card with its deals and tasks                               | light | 1280×800                   |
| `tasks.png`          | the task list with overdue and due-today tasks                         | dark  | 1280×800                   |
| `phone.png`          | the board on a phone, swiped one column on                             | light | 390×844 at device scale 2  |
| `social-preview.png` | the dashboard's top, for GitHub's link previews                        | light | 1280×640                   |

- The stack builds the same demo studio as the live site, on a fresh database each run. Its dates
  are relative to the run and the browser shows them in UTC, so the files change only with the
  interface and the time of the run. The tour moves a deal, which only the local stack may see; it
  runs after the stills.
- Stills wait for their page's loaded content (`support/screens.ts`) and for the charts' bars, with
  reduced motion so the charts draw at once. sharp compresses each PNG, under 400 KB.
- The tour records Playwright's screencast frames with their real timing (`support/recorder.ts`)
  and draws a pointer into the page that follows the mouse (`support/pointer.ts`), since headless
  frames show none. sharp scales the frames to 960 wide and joins them into a looping GIF under
  5 MB; no ffmpeg is involved.
- A test fails when its file goes over its budget. The social preview is uploaded by hand: GitHub →
  Settings → General → Social preview.

## Reading a CI failure

When `e2e` fails, the run has an `e2e-report` artifact, kept 7 days. Download and unpack it:

- `playwright-report/index.html`: every failed test with its error, screenshot and video;
- `test-results/<test>/trace.zip`: open with `show-trace` above, or drop it on
  https://trace.playwright.dev; the trace has each action, the DOM before and after, the console and
  the network;
- `.logs/api.log` and `.logs/web.log`: the servers' output, the API's as JSON lines with request ids.

When the live tour fails in `deploy-web`, its trace is in the `live-tour-trace` artifact, also kept
7 days.
