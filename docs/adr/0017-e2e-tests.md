# 0017 — End-to-end tests

Status: accepted
Date: 2026-10-19

## Context

Unit, integration and component tests each stop at a boundary: the API's tests never render a
page, the web's fake the API with MSW. Nothing proved that the plan's five product scenarios work
through a real browser, the Next proxy, cookies and the worker, and the deploy went out on the
lower levels alone. The suite has to run the same way on a laptop and in CI, stay within the auth
rate limits however many tests register, and never touch the live demo, which visitors share.

## Decision

- **Playwright**, Chromium only, in a new private package `apps/e2e`, run by `pnpm e2e` locally and
  in a CI job `e2e` that `deploy-api` needs.
- **Production builds against testcontainers.** Global setup starts Postgres and Valkey containers,
  migrates, makes a key pair for the run, then starts `node dist/main.js` and `next start` on the
  fixed ports 4000 and 3000 with every variable set explicitly.
- **A fresh account per test.** Each test registers its own owner from its own browser context;
  data the test is not about is arranged through the API, the rest goes through the UI.
- **A visitor address per context.** Each context sends a random `X-Forwarded-For` from
  `198.18.0.0/15`, and the API trusts one proxy hop in the stack, so every test has its own budget
  under the rate limits.
- **Role, label and text locators**, no test ids; axe with the WCAG 2.1 A and AA rules on the main
  pages in both themes.
- **Playwright's pinned Chromium headless shell**, the build the lockfile's Playwright version
  names, locally and in CI.
- **A read-only live tour** after each web deploy instead of the suite against the live host.

## Alternatives

- **Cypress.** Parallel runs need its paid service, and one test cannot drive two browser contexts,
  which the invite and tenancy cases need; Playwright's trace viewer also beats its screenshots.
  Rejected.
- **The Compose image of the API.** A second way to start the stack, slower to build locally; the
  web never ships as an image, and the image keeps its own smoke test in `image`. Rejected.
- **The development database and `pnpm dev`.** Tests would depend on local data and dev-mode
  behavior. Rejected.
- **A shared seeded workspace or saved sessions.** Tests would see each other's records, and
  contexts sharing one refresh token rotate it against each other and trip its reuse detection.
  Rejected.
- **A switch in the API that relaxes rate limits.** A production code path that turns them off.
  Rejected; the integration tests keep proving the limits.
- **Test ids.** Would let a control without an accessible name pass; role locators check names as
  they go. Rejected.
- **Firefox and WebKit as well.** Triple run time for a demo app; the phone viewport covers layout.
  Rejected for now.
- **The installed Chrome.** Its version moves with its own updates, so local and CI runs drift.
  Rejected.
- **The full suite against the live host.** It writes, and the demo is shared with visitors.
  Rejected.

## Consequences

- An e2e run needs Docker and free ports 3000 and 4000; `pnpm dev` has to stop first.
- Changed interface text or accessible names change tests, which is the point of the locators.
- Every CI run spends a few more minutes, against the private repository's monthly minutes until it
  goes public.
- A deploy fails if the live tour fails, after the new version is already live.
- New screens need a line in the accessibility test and, for a new scenario, an e2e test.
