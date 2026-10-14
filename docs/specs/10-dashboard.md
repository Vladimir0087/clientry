# 10 — Dashboard

Status: approved

## 1. Goal

The first screen after login shows how sales are going: open deals by stage, money in the pipeline,
deals won and the win rate over the last six months, who works on what, and a feed of what the team
did recently across deals, clients and tasks.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/schema.prisma                      # Activity: client and task subjects, new types
  prisma/migrations/<timestamp>_activity_feed/
  src/
    app.module.ts                           # ActivityModule, DashboardModule
    common/pagination/created-at-cursor.ts  # [createdAt, id] cursor: feed, notifications
    infra/prisma/visibility.ts              # the one visibility rule of deals and tasks
    infra/prisma/snapshot.ts                # a repeatable read transaction for consistent reads
    modules/
      activity/
        activity-log.repository.ts          # exported: the one writer of activities, in a given tx
        activity.controller.ts              # the feed
        activity.service.ts
        activity.repository.ts              # contract
        prisma-activity.repository.ts       # one statement per page, subjects through joins
        activity.module.ts
      dashboard/
        dashboard.controller.ts             # summary, closed deals
        dashboard.service.ts
        dashboard.repository.ts             # contract
        prisma-dashboard.repository.ts      # aggregates in one repeatable read snapshot
        dashboard.module.ts
      deals/                                # history entries through ActivityLog; visibility
                                            # from infra; imports ActivityModule
      tasks/                                # task_created and task_completed through
                                            # ActivityLog; visibility from infra
      clients/                              # create writes client_created in its transaction
      notifications/                        # notification-cursor.ts gives way to the common cursor
  test/create-test-app.ts                   # overrides a provider, for the atomicity tests
  test/fixtures/activity.ts                 # direct inserts for feed tests
apps/web/src/
  app/
    globals.css                             # chart tokens
    _providers/providers.tsx                # a successful mutation invalidates dashboard queries
    (app)/
      page.tsx, loading.tsx                 # the dashboard replaces the greeting
      _components/dashboard-view.tsx        # composes the sections, builds their links
      _components/home-greeting.tsx, home-greeting.spec.tsx,
        greeting-skeleton.tsx               # removed
      _components/main-nav.tsx              # Dashboard link
      _lib/prefetch.ts                      # summary and the first feed page
  features/
    dashboard-charts/                       # the only importer of recharts: pipeline and won
                                            # deals charts, the currency choice in the URL
  entities/
    dashboard/                              # keys, calls, queries, period bounds, tiles, team
    activity/                               # keys, feed call, useActivityFeed, entry text, list
    deal/                                   # money formatting moves to shared
  shared/
    api/query-client.ts                     # onMutationSuccess option
    lib/money.ts, money.spec.ts             # formatMoney and totals text, from entities/deal
apps/web/test/
  dashboard.ts                              # makeSummary, makeClosedDeals
  activity.ts                               # makeActivityEntry
  msw/handlers.ts                           # dashboard and feed defaults
packages/shared/
  package.json                              # exports ./dashboard and ./activity
  src/dashboard/                            # new entry point @clientry/shared/dashboard
  src/activity/                             # new entry point @clientry/shared/activity
packages/eslint-config/next.js              # recharts only in features/dashboard-charts
docs/adr/0014-dashboard.md
```

**Tenancy and roles**

- Every repository method of the dashboard and activity modules takes `workspaceId` first, from
  `AuthUser`. The routes take no ids; period bounds and cursors carry none.
- Every member reads the dashboard and the feed of the whole workspace, as plan section 6 says
  ("Dashboard: yes, yes"). No route needs a permission. A manager already reads every deal and task
  of the workspace, so the aggregates reveal nothing new.

**Visibility (`infra/prisma/visibility.ts`)**

- The rules of specs 07 and 08 move here with their behaviour unchanged: a deal is visible when it
  and its client are not deleted; a task when it is not deleted and its client, or its deal and that
  deal's client, are not deleted. `deal-reads.repository.ts`, `task-reads.repository.ts` and the
  transaction repositories import them from here.
- Prisma forms: today both modules export a `visible(workspaceId)`, so here they get distinct names
  (`visibleDeal`, `visibleTask`, `deletedTaskWithVisibleLinks`).
- SQL forms become functions of the table aliases. `TASK_LINK_JOINS` and `TASK_LINKS_VISIBLE`
  hardcode `t`, `c`, `d` and `dc`, and the feed joins a deal subject and a task's linked deal in one
  statement, so fixed aliases would clash. A deal fragment joins the deal's client and checks both.
  Callers that keep today's aliases pass them explicitly.
- The dashboard and the feed read other modules' tables, as deals already read clients and
  memberships; one copy of each rule keeps the counts equal to what the lists show. The pattern is
  `pending-invite.ts` of spec 09: one rule, several readers.

**Summary (`GET /api/dashboard/summary`)**

- An open deal is a visible deal with `closed_at IS NULL`, which spec 07 keeps equal to "in an open
  stage"; spec 09's handover uses the same test.
- `stages`: every open stage in board order, each with `count` and `totals` per currency of its
  visible deals, empty stages included. Won and lost stages are not part of the pipeline; the
  closed deals below cover them.
- `openDeals`: `count` and `totals` over the same deals, summed from the stage rows in the service,
  so the tile and the chart always agree.
- `tasks`: `open`, the visible tasks with `done_at IS NULL`, and `overdue`, those with `due_at`
  before the server's now, summed from the per-assignee rows. Overdue needs no time zone: it
  compares instants.
- `members`: every current member in join order, each with `openDeals` (`count`, `totals`),
  `openTasks` and `overdueTasks` assigned to them. A former member has no open work after spec 09's
  handover, so the rows cover every open deal and task.
- Totals per currency are never added up (spec 07) and are ordered by `CURRENCIES`, as the board
  orders them.
- Four statements whatever the data, one after another in one `RepeatableRead` transaction: open
  stages with their aggregates, open deals per assignee, open and overdue tasks per assignee, and
  the members. One snapshot keeps the tiles, the pipeline and the team table consistent while deals
  move. Not `Promise.all`: concurrent queries on a transaction's one connection are deprecated by
  pg (the remark in `deal-reads.repository.ts`).
- The snapshot is `inSnapshot(db, work)` in `infra/prisma/snapshot.ts`: `$transaction(work)` with
  `isolationLevel: RepeatableRead`, the code base's first use of that option. Its integration test
  runs `SELECT current_setting('transaction_isolation')` inside and expects `repeatable read`. If
  the driver adapter rejects or ignores the option, implementation stops and the owner decides.

**Closed deals by period (`GET /api/dashboard/closed-deals?bounds=…`)**

- The API has no time zone (plan section 15, spec 08), so it cannot tell where a month starts for
  the reader. The browser sends the period bounds as instants: the start of each month in its own
  zone, ascending, plus the start of the next month. Six months need seven bounds.
- `bounds`: the query parser gives a string for one value and an array for several, as
  `oneOrMany` of `@clientry/shared/common` reads them; the schema turns both into an array and
  checks it itself, without `oneOrMany`'s own messages. Each bound is an instant through the
  package's `instantSchema` of spec 08 (UTC `Z`, 2000–2099); there are 2 to 13, strictly
  ascending. Any failure → 400 on `bounds`: "Use 2 to 13 bounds in ascending order".
- Response: one period per pair of neighbouring bounds, each with `start`, `end`, `won` and `lost`,
  both `{ count, totals }`. A deal counts in the period that holds its `closed_at`, by its current
  stage: a deal won in March, reopened and won again in May counts once, in May.
- One statement: the workspace's won and lost stages joined to their visible deals with `closed_at`
  in `[first bound, last bound)`, grouped by `width_bucket(closed_at, bounds)`, stage kind and
  currency. It reads the existing `(workspace_id, stage_id, closed_at, id)` index once per stage.
- The web derives two tiles from it: won this month (the last period) and the win rate, the won
  count divided by the won and lost counts together over all six periods, rounded to a whole
  percent.
- Bounds are bound as ISO strings with `Z` and cast in SQL (`::timestamptz[]`), and overdue tasks
  compare with SQL `now()`: no `Date` goes through the driver adapter, whose handling of the session
  time zone plan section 15 leaves open.

**Activity log (`modules/activity`)**

- `activities` gains two subjects next to deals. Each row has exactly one of `deal_id`, `client_id`,
  `task_id`, fixed by its type:

| Type             | Subject | Payload                              | Written when                        |
| ---------------- | ------- | ------------------------------------ | ----------------------------------- |
| `deal_*`         | deal    | as in spec 07                        | as in spec 07                       |
| `client_created` | client  | none                                 | a client is created                 |
| `task_created`   | task    | `assignee` (`{ id, name }`), `dueAt` | a task is created                   |
| `task_completed` | task    | none                                 | `complete` sets `done_at` from null |

- Not recorded: client edits, deletions and restores; task edits, reopening, deletions and
  restores; team events (joins, role changes, removals). The feed follows the sales
  work: new deals, clients and tasks, deals moving, tasks getting done. Edits would flood it.
- Completing a done task changes nothing (spec 08) and writes no entry. Complete, reopen, complete
  writes two entries: the task was done twice.
- Entries start with this migration. Clients and tasks created before it get none; the demo reset of
  spec 12 makes its own.
- `ActivityLog` is a stateless provider exported by `ActivityModule`, with a method that takes the
  transaction client it runs in and a batch of entries, written with one `createMany`. It parses
  each event through `activityEventSchema` and sets the subject column from the type. It replaces
  the three direct writes of the deals module (`addActivity` of the deal transaction repository,
  stage deletion, `DealHandover`) and is the only application code that writes `activities`, as
  spec 09 keeps every table with its writer; test fixtures still insert rows directly.
- Wiring: `DealsModule`, `TasksModule` and `ClientsModule` import `ActivityModule`. The Prisma
  repositories inject `ActivityLog` and hand it to the transaction-bound repositories they construct
  (`new PrismaDealsTransaction(tx, …)` and the like); `DealHandover` injects it. The units of work
  keep their contracts, so the service unit tests stay without a database.
- Client create: the clients module has no unit of work, so `PrismaClientsRepository.create` opens
  the transaction itself and writes the client row and its entry in it; the service is unchanged.
- Task create and complete already run in the tasks unit of work; the transaction repository gains
  an `addActivity` as the deals one has. Create records the entry from the task read back in the
  transaction, which carries the assignee's name. Complete records it only when `setDone` reports
  `isChanged`.
- Deal history (`GET /api/deals/:id/history`) is unchanged: it reads rows by `deal_id`, which only
  deal events set. Task events of a deal's tasks do not appear in it (spec 08 left this to here).

**Feed (`GET /api/activity`)**

- The workspace's entries, newest first (`created_at`, then id, descending), `limit` 20 by default
  (1–50), `cursor`, `{ items, nextCursor }`. The cursor follows spec 08's notifications: base64url
  JSON of `[createdAt, id]` of the last row; a broken one → 400 "Invalid cursor".
- An entry: `id`, `type`, `actor` (`{ id, name }`), `subject`, `payload`, `createdAt`. `subject` is
  `{ kind, id, label, isAvailable }`, its kind fixed by the type.
- `label` is the subject's current title or name, read through a join, so older entries show a
  renamed deal by its new title. Payload names stay snapshots, as in spec 07.
- `isAvailable` says whether the subject's page would open now, by the visibility rules above (a
  client: not deleted). Entries of deleted and hidden subjects stay in the feed, since it records
  what happened, deletions included; the web shows their label without a link.
- One statement per page whatever its size: the actor and the subject with its visibility joins,
  raw SQL as in specs 07 and 08. A stored row that does not parse fails the request with 500, as
  the deal history does.

**Web: dashboard page (`/`)**

- `/` shows the dashboard instead of the greeting of spec 04, which is removed with its skeleton.
  The page title is "Dashboard". The login redirect and the brand link already point at `/`.
- The main navigation gains "Dashboard" first, with `aria-current="page"` on `/` only: the
  current-page check matches `/` exactly, since every path starts with it.
- The server prefetches the summary and the first feed page through `(app)/_lib/prefetch.ts`, as
  other pages do. The file is at 250 lines and splits by entity if this pushes it past the limit.
- Closed deals load in the browser only, after hydration: their bounds come from the reader's zone,
  which the server does not know, as the task form of spec 08. The won chart and its two tiles show
  skeletons in the server HTML.

**Web: data layer (`entities/dashboard`, `entities/activity`)**

- `dashboardKeys`: `all`, `summary`, `closedDeals(bounds)`. `activityKeys`: `all`, `feed`.
- `useDashboardSummary()`, `useClosedDeals(bounds)`, `useActivityFeed()` (infinite, by cursor).
  `useNow` is `null` on the server and during hydration, so the bounds are too and the closed deals
  query waits until it has them.
- `periodBounds(now)`, pure: the start of the month five months before the current one through the
  start of the next month, seven instants built with `new Date(year, month, 1)` in the browser's
  zone. The current month comes from `useNow` of spec 08, so the key changes, and the data
  refetches, when the month turns while the page is open.
- `entities/dashboard` UI: the tiles, the team table and cards, skeletons. `entities/activity` UI:
  the feed list and the entry text. Neither imports another entity (lint): links to deals, tasks
  and clients are built in the app layer and passed in, as spec 07 does for client links.
- `formatMoney` and the totals text ("$4,500 · €1,200") move from `entities/deal` to
  `shared/lib/money.ts`, with a compact form for chart labels ("$12.5K"); `entities/deal` imports
  them from there.
- Freshness: every write in the app can change the dashboard, so instead of each feature
  invalidating it, `createQueryClient` takes an `onMutationSuccess` option and the app providers
  pass one that invalidates `dashboardKeys.all` and `activityKeys.all` with the default
  `refetchType: 'active'`. An open dashboard refetches at once, so an Undo pressed on it shows;
  a closed one only goes stale and refetches on the next visit to `/`. A feature added later
  cannot forget to.
- No polling and no live updates. Window focus refetches as everywhere (60 s stale time).

**Web: charts (`features/dashboard-charts`)**

- `recharts` lives only in this slice; an ESLint `no-restricted-imports` pattern rejects it anywhere
  else. Only the dashboard page imports the slice, so other routes never load the library.
- In flat config a later block's `no-restricted-imports` replaces the earlier options, it does not
  merge them. So in `packages/eslint-config/next.js` the recharts pattern joins every
  `restrictedImports(...)` call (all files, features, entities), and a block for
  `src/features/dashboard-charts/**` repeats the features patterns without it.
- Recharts measures its container in the browser. The charts render after mount, inside a box of
  the final height, so neither the server nor the first render draws at zero size and recharts logs
  no size warning.
- Pipeline: horizontal bars, one per open stage in board order, bar length the deal count, the count
  at the end of each bar. Stage names on the axis, cut at 18 characters with an ellipsis; full names
  in the tooltip and the table. Bars run sideways because stage names are long and a phone is
  narrow. Height 36 px per stage, at least 160 px.
- Won deals: six vertical bars, the won amount per month in one currency, a compact amount above
  each non-zero bar. Month labels "May" to "Oct"; the tooltip and the table say "October 2026".
  Height 240 px.
- Currency: amounts in different currencies are never added (spec 07), so the won chart shows one at
  a time. A "Currency" select lists the currencies with won deals in the six months, by won count,
  then code; the first is the default. It lives in the URL as `currency` through nuqs, left out at
  the default; a value not in the list shows the default. With one currency there is no select and
  the heading names it.
- Tooltips on hover and tap: the stage or month, the deal count, totals per currency; for months also
  "1 lost".
- Accessibility: each chart is a `figure` under its section heading. The SVG is `aria-hidden` and
  recharts' keyboard layer is off (`accessibilityLayer={false}`): a visually hidden table right after
  it holds every number of the chart and its tooltips, which a screen reader reads better than a
  focusable SVG. Visible labels carry the main numbers, so nothing needs hover.
- Animation runs only without `prefers-reduced-motion: reduce`.
- Colors: `globals.css` gains `--chart-1` (pipeline) and `--chart-2` (won) for both themes, each at
  least 3:1 against the card background (WCAG 1.4.11), checked with a contrast calculator; axis and
  label text use `muted-foreground`.
- Fixed heights in the server HTML, so nothing shifts when the charts draw after hydration.

**Neon and Netlify budget**

- The dashboard is the landing page, so every login reads it: one server render (the summary and the
  feed fetched by the server function from the API directly, as spec 08's unread count) and one
  browser request for closed deals through the rewrite. A focus refetch after a minute costs three
  invocations. No polling, so an open dashboard tab costs nothing while unfocused.
- Six SQL statements per full load, each bounded by indexes; no change to Neon's sleep pattern.

**Logging**

- No log lines: the new routes only read, like every list. Writes that now record an entry keep
  their spec 06–08 lines.

**Swagger**

- Tags `dashboard` and `activity`, the cookie scheme, 401 once per controller, 400 with examples.
  `bounds`, `cursor` and `limit` are listed as query parameters; `bounds` as an array.

**Shared contracts**

- `@clientry/shared/dashboard`, new entry point: `DASHBOARD_LIMITS` (bounds count),
  `dashboardSummaryResponseSchema` (`DashboardSummary`), `closedDealsQuerySchema` (`bounds` as
  above, with one message for every failure), `closedDealsResponseSchema` (`ClosedDeals`), inferred
  types. The currency total schema of `deals` is reused inside the package.
- `@clientry/shared/activity`, new entry point: `ACTIVITY_LIMITS` (page size, cursor length),
  `activityEventSchema` (an entry as written: spec 07's deal events plus `client_created`,
  `task_created`, `task_completed`), `activityEntrySchema` (`ActivityEntry`, a discriminated union on
  `type` with the subject), `activityFeedQuerySchema`, `activityFeedResponseSchema`, inferred types.
- `@clientry/shared/deals` keeps `dealEventSchema` and `dealActivitySchema` for the deal history.

**UI kit**

- No shadcn CLI run: the two charts use recharts directly with the theme tokens. shadcn's `chart`
  wrapper adds a config layer two charts do not need.

**Dependencies**

- Web: `recharts` 3.10.1 and its peer `react-is` 19.3.0, pinned to the React version, both
  exact-pinned. The plan names recharts for the dashboard (plan section 7, spec 04).

**Architecture decision record**

- `0014-dashboard.md`: aggregates computed on read in SQL over stored counters or materialized views
  (a few thousand rows per workspace, and counters drift with soft deletes and restores); period
  bounds sent by the browser over a time zone on the server (plan section 15 keeps the API free of
  zones until Telegram); one currency at a time over conversion (no rates, and spec 07 never adds
  currencies); one activity writer with a nullable foreign key per subject over a polymorphic
  `subject_kind` and `subject_id` without foreign keys and over a table per subject; a feed that
  keeps entries of deleted records over hiding them; one mutation hook for dashboard freshness over
  invalidations in every feature; recharts with a hidden table over a focusable chart. Consequences:
  the won chart and its tiles load after hydration; a new subject means a migration and an
  `ActivityLog` type; the dashboard can disagree with the board by the writes of the last minute.

### Out of scope

- Filtering the dashboard by member: the team table shows each member's numbers and links to their
  board and tasks.
- Choosing the period: the won chart always shows the current month and the five before it.
- Currency conversion, a workspace default currency.
- Conversion rates between stages, weighted pipeline, forecasts, average deal size or age, sales
  cycle length, targets.
- Feed filters by member, type or subject.
- A separate activity page, live updates (v2 WebSocket), notifications about feed events.
- Activity entries for other events (see the activity log), backfilled entries.
- Exports, printing, customizable or reorderable widgets.
- Stored aggregates: counters, materialized views, a cache.
- Indexes on `activities.actor_id`, `deals.assignee_id` and `deals.created_by_id` (deferred from spec
  07): no query of this spec filters by them alone; the team aggregates scan the workspace's open
  deals and tasks through the existing indexes (section 3).

## 3. Data model

One migration, `activity_feed`, made with `pnpm db:migrate`, without hand edits.

| Table        | Change                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activities` | `deal_id` becomes nullable; new `client_id?` and `task_id?`; index `(workspace_id, created_at, id)`; `NO ACTION` from clients and tasks, as from deals |

- Enum `activity_type` gains `client_created`, `task_created`, `task_completed`.
- In `schema.prisma`: `dealId String?` with `deal Deal?`; `clientId` and `taskId` with optional
  relations, `onDelete: NoAction`; `activities Activity[]` on `Client` and `Task`;
  `@@index([workspaceId, createdAt, id])`. `@@index([dealId, createdAt, id])` stays for the deal
  history.
- Exactly one subject column is set. No check constraint, as in specs 06 and 08: `ActivityLog` is
  the one writer and sets the column from the type. A comment in `schema.prisma` says so.
- `(workspace_id, created_at, id)` serves the feed, read backwards, and the workspace foreign key
  that spec 07 left without an index until a query read activities by workspace.
- No index on `client_id` and `task_id`: nothing reads activities by them, and clients and tasks are
  never deleted for real in v1.
- No new index on `deals` or `tasks`. Checked against the queries:
  - pipeline by stage: the board's `(workspace_id, stage_id, closed_at, id)`;
  - closed deals: the same index, once for the won and once for the lost stage, on a `closed_at`
    range;
  - open deals per assignee: the workspace's open deals through the same index, grouped; a few
    hundred rows;
  - tasks per assignee and counts: `(workspace_id, done_at, due_at, id)` with `done_at IS NULL`,
    overdue as a `due_at` range in it.
- Existing rows keep `deal_id`; nothing is backfilled.

## 4. API

All routes need the access cookie.

| Method | Path                          | Request                   | Success                              | Errors |
| ------ | ----------------------------- | ------------------------- | ------------------------------------ | ------ |
| GET    | `/api/dashboard/summary`      | —                         | 200 `dashboardSummaryResponseSchema` | —      |
| GET    | `/api/dashboard/closed-deals` | `closedDealsQuerySchema`  | 200 `closedDealsResponseSchema`      | 400    |
| GET    | `/api/activity`               | `activityFeedQuerySchema` | 200 `activityFeedResponseSchema`     | 400    |

Every route can also answer 401 `AUTHENTICATION_REQUIRED`.

`dashboardSummaryResponseSchema`:

```json
{
  "openDeals": {
    "count": 14,
    "totals": [
      { "currency": "USD", "amount": 4550000, "count": 12 },
      { "currency": "EUR", "amount": 120000, "count": 2 }
    ]
  },
  "stages": [
    {
      "stage": { "id": "0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c", "name": "New", "kind": "open" },
      "count": 5,
      "totals": [{ "currency": "USD", "amount": 900000, "count": 5 }]
    }
  ],
  "tasks": { "open": 23, "overdue": 4 },
  "members": [
    {
      "member": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
      "openDeals": { "count": 6, "totals": [{ "currency": "USD", "amount": 2100000, "count": 6 }] },
      "openTasks": 9,
      "overdueTasks": 1
    }
  ]
}
```

`GET /api/dashboard/closed-deals?bounds=2026-04-30T21:00:00.000Z&bounds=…` (seven bounds, Minsk),
one period shown:

```json
{
  "periods": [
    {
      "start": "2026-09-30T21:00:00.000Z",
      "end": "2026-10-31T21:00:00.000Z",
      "won": { "count": 3, "totals": [{ "currency": "USD", "amount": 1250000, "count": 3 }] },
      "lost": { "count": 1, "totals": [{ "currency": "USD", "amount": 300000, "count": 1 }] }
    }
  ]
}
```

An `activityFeedResponseSchema` entry:

```json
{
  "id": "0199b1f0-2a3b-7c4d-8e5f-6a7b8c9d0e1f",
  "type": "deal_moved",
  "actor": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
  "subject": {
    "kind": "deal",
    "id": "0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b",
    "label": "Landing page for Romashka",
    "isAvailable": true
  },
  "payload": {
    "from": { "id": "…", "name": "Contract", "kind": "open" },
    "to": { "id": "…", "name": "Paid", "kind": "won" }
  },
  "createdAt": "2026-10-13T09:05:00.000Z"
}
```

Web pages:

| Path | Access    | Title     |
| ---- | --------- | --------- |
| `/`  | protected | Dashboard |

## 5. UI

**Shell.** The main navigation starts with "Dashboard", `aria-current="page"` on `/` only. On a
phone the navigation row scrolls inside itself if its five links overflow (spec 08).

**Dashboard (`/`).**

- Heading "Dashboard". Sections in reading order: tiles, Pipeline, Won deals, Team, Activity.
- From `lg`: tiles in one row of four; Pipeline and Won deals side by side; Team over two thirds
  with Activity beside it. Below `lg`: one column, tiles two by two.

**Tiles.**

| Tile           | Value                   | Line below                                                 |
| -------------- | ----------------------- | ---------------------------------------------------------- |
| Open deals     | the count               | totals per currency, or "Nothing in the pipeline"          |
| Won this month | the count of won deals  | totals per currency, or "No deals won yet this month"      |
| Win rate       | `42%`, or `—` with none | "5 won of 12 closed in 6 months", or "No deals closed yet" |
| Overdue tasks  | the count               | "of 23 open tasks"                                         |

- Counts lead because they never mix currencies; amounts follow in the line below.
- Each tile is a labelled group whose name is the tile's label, so a screen reader hears "Open
  deals, 14, $45,500 · €1,200".
- Overdue above zero shows the value in the `danger` color; the label already says it, so color is
  not the only cue.

**Pipeline.**

- Heading "Pipeline" and a link "Open board" to `/deals`.
- The chart of section 2. Empty (no open deals): "No open deals. Add one on the board." with the
  link.

**Won deals.**

- Heading "Won deals, last 6 months" (with the currency when only one exists: "Won deals in USD,
  last 6 months"), the Currency select when several.
- The chart of section 2. Empty (nothing won in six months, so no currency to show): "No deals won
  in the last 6 months." Lost deals still count in the win rate tile.

**Team.**

- Heading "Team". From `md` a table: Member (with "You" on the caller's row), Open deals, In
  pipeline (totals per currency), Open tasks, Overdue. Below `md`: one card per member with the same
  content.
- The open deals count links to the board filtered by that member (`/deals?assignee=<id>`), named
  "6 open deals of Ann"; the open tasks count to the task list filtered by them
  (`/tasks?assignee=<id>`), named "9 open tasks of Ann". The filters of spec 09 read the ids. Zero
  counts are plain text.
- Overdue above zero shows as a `danger` badge.

**Activity.**

- Heading "Activity", the 20 newest entries, then "Show older".
- Each entry: one line per sentence, then the date and time (`LocalDate` with time, spec 07). The
  subject is a link to its page when `isAvailable`, plain text otherwise.
- Sentences, with `<deal>`, `<client>` and `<task>` the subject's label:
  - `deal_created`: "Ann created the deal <deal> in New · $1,500";
  - `deal_moved`: "Ann moved <deal> from Contract to Paid", with a "Won" or "Lost" badge when the
    target stage is closed, and "… when Contract was deleted" for that reason;
  - `deal_updated`, one line per change: "Ann renamed <deal> from “Old” to “New”", "Ann changed the
    amount of <deal> from $1,000 to $1,500", "Ann changed the client of <deal> from A to B", "Ann
    changed the assignee of <deal> from Ann to Max";
  - `deal_deleted`, `deal_restored`: "Ann deleted the deal <deal>", "Ann restored the deal <deal>";
  - `client_created`: "Ann added the client <client>";
  - `task_created`: "Ann created the task <task> for Max · due Oct 15, 3:00 PM", without "for Max"
    when the actor is the assignee;
  - `task_completed`: "Max completed the task <task>".
- The actor's name is current, as in the deal history; stage, client, member names and amounts come
  from the payload snapshots; the subject is its current label.
- The "Won" and "Lost" badges use `shared/ui/badge` (`success`, `danger`): `StageKindBadge` lives in
  `entities/deal`, which `entities/activity` cannot import.
- The due time of `task_created` renders through `LocalDate`, so it shows after hydration in the
  reader's zone; the rest of the sentence is in the server HTML.
- Empty: "No activity yet. New deals, clients and tasks show up here."

**States.**

- Loading: skeletons of every section in the route's `loading.tsx` and while queries run; the won
  chart and its two tiles stay skeletons until the browser loads closed deals.
- The summary failing: one error, "We could not load the dashboard." with "Try again", in place of
  the tiles, Pipeline and Team. Closed deals failing: "We could not load won deals." with "Try
  again" in their section, and `—` in their two tiles. The feed failing: "We could not load
  activity." with "Try again" in its section.
- "Show older" keeps the old entries while it loads, with a spinner; its failure shows a toast "Could
  not load older activity." and the button stays.

**Focus.**

- "Try again" moves focus to the heading of what reloads (`RetryMessage` of spec 07): "Dashboard"
  for the summary, "Won deals, …" and "Activity" for theirs.
- "Show older" keeps focus as entries are appended, as "Load more" in spec 06.
- The Currency select returns focus to its trigger.

Every screen is checked at 390×844 and 1280×800, in light and dark themes, at 360 px for horizontal
scroll of the page, and by keyboard only.

## 6. Tests

- **Unit, packages/shared**
  - Closed deals query: one bound and 14 bounds rejected; seven ascending accepted; equal or
    descending neighbours rejected; an offset other than `Z` rejected.
  - Activity events: each new type parses with its payload; `task_created` without `dueAt`
    rejected; an unknown type rejected; every deal event of spec 07 still parses.
  - Feed entries: the subject kind must match the type; feed query `limit=51` rejected.
- **Unit, apps/api**
  - Created-at cursor (common): round trip; a broken or forged one → null.
  - `ActivityLog`: sets `deal_id`, `client_id` or `task_id` from the type and nothing else; a
    payload that does not parse throws before any write; a batch is one `createMany`.
  - Dashboard service, repository doubled: `openDeals` is the sum of the stage rows per currency;
    members without work get zero rows; the summary passes `workspaceId` from the caller.
  - Tasks service: complete of an open task records `task_completed`, of a done task records nothing;
    create records `task_created` with the assignee snapshot.
  - Deals: `addActivity`, stage deletion and `DealHandover` write through `ActivityLog`; the spec 07
    and 09 unit tests pass.
- **Integration, apps/api** (testcontainers, supertest, two workspaces, the first with an owner and
  a manager, `resetDatabase` before each test)
  - Summary: open stages in board order, empty ones included, counts and totals per currency;
    deleted deals and deals of deleted clients absent; won and lost stages absent; tasks open and
    overdue, hidden tasks absent; members in join order with their open deals, tasks and overdue
    tasks, a member with nothing at zero; a manager gets the same body as the owner; another
    workspace's records never counted.
  - Summary statements: the same number for an empty workspace and for one with 30 deals, 40 tasks
    and three members (Prisma query events), inside one transaction.
  - Snapshot: `inSnapshot` runs its work at `repeatable read`.
  - Closed deals: deals won and lost in different months land in their periods by `closed_at`; a
    deal on a bound lands in the later period; one before the first or at the last bound is absent;
    a reopened deal is absent, a reopened and won again one counts in its new month; totals per
    currency; deleted and hidden deals absent; another workspace's absent; one statement.
  - Feed: entries of every type, newest first; the subject's current label after a rename; a
    deleted deal, a deal of a deleted client, a deleted client, and a task of a deleted deal are in
    the feed with `isAvailable: false`, restored ones with `true`; 45 entries over three pages each
    once, the last `nextCursor` null; one statement per page; another workspace's entries absent; a
    broken cursor → 400.
  - Writers: creating a client writes one `client_created` entry with the creator as actor; with
    `ActivityLog` overridden in the test app to throw, a client create answers 500 and leaves no
    client row, and so does a task create; creating a task writes `task_created` with the
    assignee's name;
    completing writes `task_completed` once, completing again nothing, reopening nothing;
    deal events of spec 07 and the handover of spec 09 still write their entries; deal history
    shows only deal events.
  - Schema: the foreign keys from activities to clients and tasks are `NO ACTION`; `deal_id` is
    nullable; the feed index exists.
  - Without the access cookie every route → 401.
  - OpenAPI: the three new operations with their tags, the cookie scheme and 401; `bounds`, `cursor`
    and `limit` as query parameters.
  - The suites of specs 03–09 pass unchanged after the visibility move and the `ActivityLog`
    wiring.
  - Migrations: deploy and the drift check in global setup pass.
- **Unit, apps/web (node)**
  - Prefetch: `/` fills the summary key and the feed's first page key the hooks read; a failure →
    one `warn` line; closed deals are not prefetched.
  - `periodBounds`: seven month starts in a fixed zone (`TZ` set for the file), across a year end,
    in a month with a daylight saving change.
- **Unit and component, apps/web (jsdom, MSW)**
  - Tiles: counts, totals text, the win rate rounding and `—`, the empty lines, the labelled groups.
  - Pipeline: the hidden table lists every open stage with count and totals; the empty state.
  - Won deals: the request carries seven bounds; the select lists currencies by won count and
    defaults to the first; choosing writes `currency` to the URL, the default leaves it out; an
    unknown `currency` shows the default; no select with one currency; the hidden table holds every
    month; the empty state. Recharts draws nothing measurable in jsdom; the browser check covers
    the drawing.
  - Team: the table and the cards, "You", the links with their names and filter ids, the overdue
    badge.
  - Feed: every sentence of section 5, a link only when available, "Show older" appends and keeps
    focus, its failure toast.
  - States: the summary error with "Try again" focusing "Dashboard"; the closed deals error with `—`
    in two tiles; the feed error.
  - Freshness: on a client built with the providers' `onMutationSuccess`, a successful mutation
    refetches observed summary and feed queries, leaves unobserved ones stale without a refetch;
    a failed one leaves them fresh.
  - Money: `formatMoney` tests of spec 07 pass from `shared/lib`; the compact form gives `$12.5K`.
  - Main nav: `aria-current` on `/` and not on `/deals`; "Dashboard" first.
  - The default MSW handlers gain the summary, the closed deals and the feed with empty data, since
    `/` requests all three and unhandled requests fail tests.
- **e2e**: none (spec 13).
- **Tooling checks**, done once on throwaway changes that are not committed; each must fail:
  - `entities/dashboard` importing `recharts` (lint);
  - `app/(app)/_components/dashboard-view.tsx` importing `recharts` (lint);
  - `entities/activity` importing `@/entities/deal` (lint);
  - `features/dashboard-charts` importing `@/features/move-deal` (lint).

## 7. Acceptance criteria

- [ ] `pnpm db:migrate` applies `activity_feed` locally; `\d activities` in `psql` shows the nullable
      `deal_id`, the new columns, the feed index and the foreign keys of section 3.
- [ ] With 2 000 deals over a year, 2 000 tasks and 5 000 activities generated in one workspace
      through `psql` and `ANALYZE` run, `EXPLAIN ANALYZE` of the summary statements, the closed
      deals statement and a feed page, taken from the Prisma debug log, use the indexes of section
      3, and each answers within 100 ms locally. The SQL and the plans go into the PR description.
- [ ] In the browser: after login the dashboard shows the tiles, both charts, the team and the
      feed; moving a deal to the won stage, completing a task and adding a client, then opening the
      dashboard, shows them in the tiles, the charts and the feed without a reload.
- [ ] With deals in two currencies the won chart offers both; the choice lives in the URL, survives
      a reload and comes back with Back.
- [ ] The team table's links open the board and the tasks filtered by that member.
- [ ] Deleting a deal leaves its entries in the feed without links; Undo brings the links back.
- [ ] A reload of `/` within 15 minutes of logging in: the server HTML contains the summary and the
      feed, and the browser requests only closed deals after hydration.
- [ ] Recharts is in no chunk that routes other than `/` load: after `pnpm build`, the chunks that
      contain recharts code are referenced by the client reference manifest of `/` only.
- [ ] On a 390 px phone the tiles sit two by two, the charts fit the width, the team shows cards; at
      360 px the page has no horizontal scroll.
- [ ] Charts in both themes: bars and labels readable, colors at least 3:1 against their
      background.
- [ ] `browser-verify` over the dashboard at both sizes and in both themes: no failed requests except
      the expected 401 before a refresh, no console errors, no hydration warnings.
- [ ] Keyboard only and with the accessibility tree: tiles read as labelled groups, the hidden tables
      hold the chart numbers, the currency select and every link work, "Show older" keeps focus;
      focus always visible.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; the `image` smoke test
      applies the new migration in the container.
- [ ] Every tooling check from section 6 fails as described.
- [ ] `recharts` and `react-is` exact-pinned at the versions of section 2; clean install has no
      engine, peer dependency or ignored build script warnings; no shadcn CLI run.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] One migration, `activity_feed`, in the PR with the code that uses it.
- [ ] After the merge, the `main` run deploys by itself; the Render log shows the migration applied
      on Neon; on the live URL the dashboard loads after login, a won deal shows in the chart and
      the feed; `browser-verify` against the live URL over the dashboard passes.
- [ ] ADR 0014 is written.
- [ ] This spec is part of the PR.
