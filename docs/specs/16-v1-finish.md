# 16 — Finishing v1

Status: approved

## 1. Goal

v1 leaves no loose ends: the fixes deferred from specs 08, 13 and 14 land, the docs match the live
setup, and v1.0.0 is released with a changelog.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/web/src/features/auth/ui/user-menu.tsx           # the account button
apps/web/src/features/auth/ui/user-menu.spec.tsx      # the icon and the name
apps/api/src/infra/prisma/pool-options.ts             # TimeZone=UTC on every connection
apps/api/src/infra/prisma/pool-options.spec.ts
apps/api/src/infra/prisma/prisma.integration.spec.ts  # the session reports UTC
apps/api/test/global-setup.ts                         # the test Postgres defaults to another zone
apps/e2e/support/axe.ts                               # the account button's exception goes
apps/e2e/support/                                     # one pause helper; centerOf; wait for dates
apps/api/scripts/dev-setup.ts                         # moved from scripts/, under lint and typecheck
package.json                                          # dev:setup points to the moved script
docs/media/                                           # regenerated: the header shows the icon
docs/deployment.md                                    # Render's source image pinned to a sha tag
docs/specs/README.md                                  # the index lists this spec
CHANGELOG.md                                          # v1.0.0
README.md                                             # links the changelog
```

**Account button**

The button shows the user's initials and is named "Account". The initials are already hidden from
assistive technology, yet axe's `label-content-name-mismatch` (WCAG 2.5.3, label in name) compares
the name with the visible text, so the e2e axe check excuses this one element.

A user icon replaces the initials, as the button already shows without a session; the name stays
"Account", so its selectors do not change. The menu still shows the name, email and role when
opened. The exception in `support/axe.ts` goes; the list of known violations stays, empty, for the
next one. The header's look changes, so `pnpm media` runs again and the files are committed.

**Postgres session time zone**

adapter-pg 7.10 sends a `Date` as UTC wall time without an offset, and Postgres reads it into a
`timestamptz` column in the session's `TimeZone`; on the way back the adapter replaces the offset
Postgres prints with `+00:00`. Both are correct only while the session runs in UTC, which holds
today because Docker and Neon default to it. Every connection of the API's pool starts with
`-c TimeZone=UTC` through pg's `options`. The API uses Neon's direct endpoint, not the pooler.
Before the merge, psql with the same option against it reported `TimeZone` as `UTC` with the
source `client`, so Neon applies it; the live check after the deploy confirms the API connects.

The integration suite's Postgres container defaults to `Pacific/Honolulu` (UTC−10, no daylight
saving), so the whole suite runs where a missing option would shift every stored moment, and a
dedicated test proves the option rather than the server's default.

**Local start**

`scripts/dev-setup.ts` runs through Node's type stripping and sits outside every lint and
typecheck. It moves to `apps/api/scripts/dev-setup.ts`, next to the key generator, so the API's
lint and typecheck cover it (its `tsconfig.json` already includes `scripts`); the root `dev:setup`
script points there, and `scripts/` goes. The API's `files` list leaves `scripts` out of the
image.

**E2E support**

- `hold` in `media/readme.spec.ts` and `pause` in `support/pointer.ts` are the same function; one
  exported helper replaces both.
- `centerOf` is geometry for the board and the pointer; it moves out of `support/board.ts` into
  its own module, with the one `Point` type both use.
- Dates render only after hydration, yet a screen's ready content can come from the server, so
  axe and the README stills could run on a page without its dates: the published `tasks.png` shows
  no due times and no "Overdue". Opening a screen also waits until no `<time>` is empty.

**Deployment docs**

The Render service's source image is pinned to the `sha-<commit>` tag of a tested version, with no
registry credential, not to `latest`, which any branch's manual run moves. "Move to another region"
already creates the service from such a tag. Setup step 6 and "Redeploy" still name `latest`; they
change to the pinned tag and say how to repoint it (Settings → Image → Update Source with the live
version's tag), and that Render's "Save and deploy" deploys the pinned tag, which can be older than
the live digest. CI deploys by digest either way.

**Changelog and release**

- `CHANGELOG.md`, Keep a Changelog format, with v1.0.0: what v1 does by area, each linking its
  spec. The README links it.
- After the merge, the owner publishes the GitHub release `v1.0.0` on the merge commit with the
  same notes.

### Out of scope

- Navigation prefetch. A main navigation link in the viewport prefetches its route, a server render
  with API calls, so each signed-in page view costs Netlify several function invocations. Netlify's
  usage from October 1 to 24 was 5,700 function invocations against the legacy Free limit of
  125,000 a month; a quiet day takes about 270 to 300, mostly the UptimeRobot monitor of the login
  page (288 a day). That projects to about 10,000 a month, under 8% of the limit, so the prefetch
  stays as it is.
- v2: the Telegram bot, realtime over WebSocket, custom fields and the rest of the roadmap.
- Tests of log content and nestjs-pino's root logger singleton: only once such tests appear.
- Node 26: once Netlify's functions run it.
- Spec 15.
- Dependency updates and the runner image behind `ubuntu-latest`.
- Package versions: the packages are private and stay at `0.0.0`; the release's version lives in
  the tag, the GitHub release and the changelog.
- Any other change to the interface.

## 3. Data model

No tables and no migration.

## 4. API

No endpoint changes. Every pooled connection starts with `TimeZone=UTC`.

## 5. UI

The account button, as decided above. Nothing else changes.

## 6. Tests

- Unit: `createPoolOptions` sets `options` to `-c TimeZone=UTC`.
- Component: the account button shows the icon, not initials, for a signed-in user and keeps the
  name "Account".
- Integration: a pooled connection reports `TimeZone` as UTC while the server's default is
  `Pacific/Honolulu`. Every other integration test passes against that server unchanged.
- E2E: axe passes on every screen in both themes without the account button's exception.
- `pnpm dev:setup` still creates `.env`, starts the containers and migrates from the moved path.
- Every other suite passes unchanged.
- Live, after the deploy: `/health/ready` answers 200, the demo signs in, the live tour passes.

## 7. Acceptance criteria

- [x] This spec is approved.
- [ ] The account button shows the icon; its axe exception is gone; e2e axe is green; the media
      are regenerated.
- [ ] The pool sets `TimeZone=UTC`, with unit and integration tests; the integration Postgres
      defaults to another zone; live after the deploy: `/health/ready` answers 200 and the live
      tour passes.
- [ ] `dev-setup.ts` lives in `apps/api/scripts/` and is covered by lint and typecheck.
- [ ] E2E support: one pause helper; `centerOf` in its own module; screens open with their dates
      rendered.
- [ ] `docs/deployment.md` describes the pinned source image.
- [ ] `CHANGELOG.md` holds v1.0.0, the README links it, and the release `v1.0.0` is published on
      the merge commit.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      CI on the pull request is green.
- [ ] `docs/specs/README.md` lists this spec.
- [ ] No new environment variables.
- [ ] This spec is part of the PR.
