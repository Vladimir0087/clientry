# 12 — Seed and demo

Status: approved

## 1. Goal

A visitor opens the live link, presses "Explore the demo" and lands, without signing up, in a web
studio's workspace full of clients, deals, tasks and history, as its owner or as one of its
managers to see what each role may do; the shared demo cannot be taken over
or broken for good, since team actions are off in it and its data is rebuilt every day; and
`prisma db seed` builds the same studio locally.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  package.json                              # db:seed
  prisma.config.ts                          # migrations.seed
  prisma/schema.prisma                      # Workspace.isDemo
  prisma/migrations/<timestamp>_demo_workspace/
  src/
    app.module.ts                           # DemoModule
    demo-seed.ts                            # prisma db seed: one reset in a standalone context
    common/auth/auth-user.ts                # isDemo
    modules/
      demo/
        demo.module.ts
        demo-seed.module.ts                 # config, logger, Prisma and the reset; no worker
        demo-reset.service.ts               # builds the rows and hands them to the repository
        demo-reset.worker.ts                # the daily recurring job on the demo queue
        demo.repository.ts                  # contract
        prisma-demo.repository.ts           # replaces the demo's rows in one transaction
        demo-workspace.ts                   # buildDemoWorkspace(now): every row, pure
        uuid-v7.ts                          # an id from a row's own created_at
        data/                               # people, clients, deal stories, tasks
      auth/
        auth.controller.ts                  # POST /api/auth/demo
        auth.service.ts                     # startDemoSession
        accounts.repository.ts              # findDemoAccount; isDemo in Account
        prisma-accounts.repository.ts
        prisma-sessions.repository.ts       # the live membership carries the workspace flag
        permissions.guard.ts                # the demo lock after the role check
        errors.ts                           # DemoUnavailableError, DemoLockedError
        auth.module.ts                      # exports PasswordHasher
      workspaces/
        invites.controller.ts, members.controller.ts, workspace.controller.ts
                                            # 403 responses list DEMO_LOCKED
  test/
    fixtures/demo.ts                        # resetDemo, enterDemo
apps/web/src/
  app/
    (auth)/login/page.tsx                   # LoginView instead of LoginForm
    (app)/
      layout.tsx                            # DemoBanner above the header
      _components/demo-banner.tsx
      team/_components/team-view.tsx        # the demo line; checks through can
      deals/_components/board-view.tsx      # can
  features/
    auth/
      ui/login-view.tsx                     # the login form, then the demo entry
      ui/demo-entry.tsx
      model/use-demo-login.ts
    manage-stages/, team-invites/                   # can
apps/web/test/fixtures.ts                   # the session fixture gains isDemo: false
packages/shared/src/auth/
  demo.ts                                   # demoLoginRequestSchema
  permissions.ts                            # DEMO_LOCKED_PERMISSIONS, can
  session.ts                                # workspace.isDemo
docs/deployment.md                          # the demo queue, connections, Neon budget
docs/adr/0016-demo-workspace.md
```

**Demo workspace**

- One workspace is the demo: `workspaces.is_demo` is true for it and for no other. Only the demo
  module sets the flag, always on the same row.
- The demo module keeps fixed ids for the workspace and its five people in its data files, so every
  reset rebuilds the same workspace with the same users: sessions, the access guard's membership
  read and the member ids in visitors' filter URLs (`/deals?assignee=<id>`) stay valid. Every other
  record gets new ids at each reset.
- People: Ann Carter, owner; Max Novak, Sofia Reyes, Liam Brooks and Nina Petrova, managers. The
  demo entries sign in Ann or Max. Emails at `pixel-studio.example`: the `.example` top-level
  domain is reserved and never receives mail.
- Join dates, the "Joined" column of the team page, come from the data files relative to the `now`
  of the reset that creates the membership, at least 30 days before the oldest record; later resets
  leave them, so they only grow older and always precede every record. Max joined first of the
  managers.
- No password opens these accounts. Each user row is created with the argon2 hash of 32 random
  bytes that nobody keeps, through `PasswordHasher`, which the auth module now exports. A password
  login with a demo email answers 401 `INVALID_CREDENTIALS` like any wrong password, so the demo
  button is the only way in.
- The workspace is "Pixel Studio", the studio of five from plan section 4, with `DEFAULT_STAGES`
  of registration (spec 03): New, Call, Proposal sent, Contract, Paid (won), Lost (lost), the
  stages of scenario 2.
- Other modules never see the fixed ids: the auth module finds the demo by its flag (Demo login),
  and the access guard reads the flag with the membership (Demo lock).

**The studio's data**

| What          | Count | Spread                                                                                                                                                                                                                             |
| ------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clients       | 40    | created over the last 200 days by all five people; every source; 0–3 tags from `ecommerce`, `startup`, `b2b`, `repeat`, `urgent`, `nonprofit`; most with a company, an email and a phone, about a third with notes                 |
| Deals         | 45    | 18 open (New 5, Call 5, Proposal sent 4, Contract 4); 19 won and 8 lost, closed over the last 180 days; 6 in EUR, 3 of them won, the rest in USD; $800 to $15,000                                                                  |
| Tasks         | 36    | 20 open, 16 done; Ann has 8 open: 2 overdue, 2 due within 8 hours of the reset, 4 within the next 7 days; Max has 5 open: 1 overdue, 1 due within 8 hours, 3 within the next 7 days; about two thirds linked to a client or a deal |
| Reminders     | 13    | 4 of Ann's and 2 of Max's open tasks remind in the future, the first of each within 3 hours of the reset; 5 of Ann's and 2 of Max's tasks were reminded already                                                                    |
| Notifications | 7     | the sent reminders: Ann's 5, 2 of them unread; Max's 2, 1 unread                                                                                                                                                                   |
| Activity      | ~230  | one entry for each event in the histories below                                                                                                                                                                                    |

- Max created some of the clients, deals and tasks, so as a manager he sees delete buttons on his
  own records and none on the others' (spec 06).
- Every member has open deals and tasks, so the dashboard's team table has no empty row; every one
  of the last six 30-day spans holds at least two won deals, so the won chart has no empty month;
  EUR deals give the chart its currency select (spec 10).
- Fictional companies and people; client emails at `.example` domains, phones in the fictional
  `+1 555-01xx` range. One deal is the plan's "Landing page for Romashka" at $1,500. English, as
  the interface (plan section 7).
- Every client, deal and task, put in its request shape (a task's link as `related`), passes its
  create request schema from `packages/shared`, so the demo holds nothing a user could not have
  typed. Rules the services check against the current time, such as a reminder in the future, apply
  to new records only.
- Times are relative to the reset's `now`. Nothing that happened (created, closed, completed, sent,
  read) lies after it; only due and reminder times lie ahead.
- A deal in the data files is a story: its client, assignee, creator, amount, the stages it went
  through with the days between steps, and where it ended. The builder turns a story into the deal
  row and its history: `deal_created` in New, one `deal_moved` per step, `closed_at` at the move
  into Paid or Lost. Four stories add a `deal_updated` with an amount or an assignee change. The
  deal's `version` is 1 plus its moves and updates, as spec 07 counts them; `updated_at` is its last
  event.
- Positions in each stage come in story order from `positionsAfter` of `deals/deal-position.ts`
  (spec 07 kept the library defaults so a seed can extend any column). The builder imports it and
  `DEFAULT_STAGES` from their files: plain functions and constants, no providers.
- Each client gets `client_created` by its creator at its `created_at`. A client's deals and tasks
  start after it, a deal's tasks after the deal.
- Each task gets `task_created` with the assignee snapshot and due time, each done task
  `task_completed` at its `done_at`.
- A sent reminder has `reminder_sent_at` and a notification for its assignee written at that moment,
  with the payload of spec 08, so the hourly sweep delivers none of them again. A future reminder
  is unsent, so the worker delivers it on the day: a visitor can see the bell change.
- Ids are UUIDv7 built from each row's own `created_at`, so id order follows time as it does for
  rows the API writes, and the cursors' id tie-breaks read the same.
- `buildDemoWorkspace(now)` is pure and returns every row. It parses each activity payload through
  `activityEventSchema` and each notification payload through `notificationEventSchema` as it builds
  them, so a broken story fails the builder and its tests, never the feed.
- The data files hold compact rows, one record per line; they and the builder split by kind before
  any file passes 400 lines.

**Reset**

- `DemoResetService.reset(now)` builds the rows and hands them to `DemoRepository.replace`, which
  runs one transaction:
  1. locks the workspace row `FOR UPDATE`, or inserts it when missing; sets its name and `is_demo`;
  2. inserts the users that are missing, with an unusable hash computed only then, and sets the name
     and email of the others from the data files;
  3. deletes the workspace's notifications, activities, tasks, deals, clients, stages and invites,
     in that order, which the foreign keys need;
  4. inserts the memberships that are missing, with the roles and join dates of the data files;
     existing ones stay as they are, since nothing in the demo can change them (Demo lock);
  5. inserts stages, clients, deals, tasks, activities and notifications, one `createMany` each.
- Kept across resets: the workspace row, the users, their memberships and sessions. A visitor stays
  signed in; their open page refetches into the new data, and a record they had open answers 404 as
  a deleted one would.
- The lock comes first. Inserts in the demo check the workspace foreign key with `FOR KEY SHARE`,
  and stage writes take `lockWorkspace`'s `FOR NO KEY UPDATE`; both conflict with `FOR UPDATE`, so
  such a write that arrives during a reset waits and lands in the new data, or fails if it refers to
  a record the reset removed. Reads never wait.
- A write that already holds a demo row when the reset starts (a deal being moved, a task being
  edited) can deadlock with it, and Postgres fails one side after a second: the reset is retried by
  its job, the visitor's request answers 500 once. Accepted: it takes a write inside the reset's
  sub-second window, once a day; locking every table in the writers' order, as spec 09's removal
  does, would cost more than it saves.
- The same number of statements on every reset after the first, whatever the data and whatever
  visitors added; the first adds the user and membership inserts.
- The reset queues no reminders: the hourly sweep (spec 08) picks up the new tasks' reminders, at
  most an hour late. A job still queued for a task the reset removed is skipped as `not_found`.
- The transaction waits up to 10 s for a connection and runs up to 30 s, above Prisma's defaults:
  its first statement may wake Neon. A failure rolls everything back, the previous demo stays as it
  was, and the job is retried (three attempts, spec 08).
- The demo repository writes every table itself. It is the one exception to "tables keep their
  writers" (specs 09 and 10), `ActivityLog` included: the reset loads a whole workspace as data with
  backdated times, which no domain operation writes. The builder's schema checks and the tests that
  read the demo through every list route stand in for the writers' checks.
- Schedule: `DemoResetWorker` registers `reset-demo` on a new `demo` queue with `RecurringJobs`
  (spec 08), a period of 24 hours, a worker with concurrency 1. The first tick against a Valkey
  without the job's deduplication key resets at once: after this spec's deploy, after Valkey loses
  its data, and on a new database, where it creates the demo. Then once a day; the time of day
  drifts by up to one tick per day.
- Seed: `migrations.seed` in `prisma.config.ts` runs
  `node --env-file-if-exists=../../.env dist/demo-seed.js`, and
  `pnpm --filter @clientry/api db:seed` runs `nest build` first: the sources import `.js` paths,
  which Node cannot run as TypeScript. `src/demo-seed.ts` loads the config and the logger as
  `main.ts` does and creates a Nest application context of `DemoSeedModule`: the config, the logger,
  Prisma, `PasswordHasher` and the demo reset, without the worker, queues or HTTP server
  (`DemoModule` starts the worker, so the seed cannot use it). It runs one reset, closes and exits
  non-zero on failure. Prisma 7 never runs a seed by itself.
- Locally the demo also appears on its own at the first tick of `pnpm dev`.

**Demo login**

- `POST /api/auth/demo` with `{ role }`, `owner` or `manager`, public. It finds the demo account,
  the earliest-joined member with that role in the workspace with `is_demo` (Ann or Max); deletes
  that user's ended sessions, as login does; starts a session and sets both cookies → 200
  `sessionResponseSchema`. No demo workspace yet → 503 `DEMO_UNAVAILABLE`; another role → 400 on
  `role`.
- It lives in the auth controller next to register, login and the invite routes, for the reason
  spec 09 gave: one place for the cookies, `Cache-Control: no-store`, the origin check and rate
  limits of every route that starts a session.
- Demo sessions are ordinary sessions: 30 days absolute, 14 idle (spec 03). Visitors share one user
  and each gets a session of their own; logout ends only theirs.
- `sessionResponseSchema.workspace` gains `isDemo`, true only in the demo; register, login, the
  invite joins, refresh and `me` carry it.

**Demo lock**

- In the demo, `team.manage` and `workspace.manage` are off for everyone: invites (create, list,
  revoke), role changes, member removal and the workspace rename. With the demo owner's session
  anyone could otherwise invite a second account, promote it to owner and remove the demo owner, so
  the next visitor's button would meet `NO_WORKSPACE` until the reset; or rename the workspace that
  every visitor sees in the header. Without invites the demo also adds no rows to `invites`, which
  spec 09 left without a purge.
- Stage settings, deleting any record and everything else stay on: they are what the demo shows, and
  the next reset repairs them.
- The demo manager meets the role table as any manager does (spec 09): no team actions, no stage
  settings, deleting only his own records. The lock changes nothing for him.
- `@clientry/shared/auth` exports `DEMO_LOCKED_PERMISSIONS` and `can({ role, isDemo }, permission)`:
  the role table, then the demo lock. `hasPermission` keeps its meaning, the role alone, so the
  role re-reads inside spec 09's workspace lock stay as they are.
- `AuthUser` gains `isDemo`, read with the membership in the access guard's one statement.
  `PermissionsGuard`: a role without the permission → 403 `INSUFFICIENT_ROLE`, as now; then a locked
  permission in the demo → 403 `DEMO_LOCKED`.
- The access token stays as it is: the flag is read from the database per request, like the role,
  and never signed into the token.
- The web checks permissions with `can`, the session's role and `workspace.isDemo`;
  `canDeleteRecord` is unchanged, since `records.delete_any` is not locked.

**Logging**

- `info` "Demo session started" with the user id and role; `info` "Demo workspace reset" with the workspace
  id, the counts of clients, deals, tasks, activities and notifications, and the duration.
- A failed reset is logged by the worker's failure handling (spec 08). No names or emails in any
  line.

**Errors**

`modules/auth/errors.ts` adds:

| Class                  | Kind               | Code               | Detail                                          |
| ---------------------- | ------------------ | ------------------ | ----------------------------------------------- |
| `DemoUnavailableError` | ServiceUnavailable | `DEMO_UNAVAILABLE` | The demo is not ready yet                       |
| `DemoLockedError`      | Forbidden          | `DEMO_LOCKED`      | This action is turned off in the demo workspace |

**Rate limiting**

| Route  | Limit      |
| ------ | ---------- |
| `demo` | 10 per min |

- The same as `login`.

**Swagger**

- `POST /api/auth/demo` under `auth` with `security: []`, 200, 400, 403 `UNTRUSTED_ORIGIN`, 429
  and 503.
- Operations behind `team.manage` and `workspace.manage` list `DEMO_LOCKED` in their one 403
  response next to `INSUFFICIENT_ROLE`. The OpenAPI test checks that every operation whose
  `x-permission` is locked in the demo lists it.

**Budget**

- Neon: one reset a day. When it misses the hourly sweep it wakes Neon once more, about 2.5 of the
  100 CU-hours a month, as the session purge does.
- Valkey: the queue and its worker add three connections, 10 of the 50.
- Netlify: a press of the demo button is one function invocation.
- Postgres storage: the demo's rows take well under 1 MB; what visitors add lives a day at most.

**Shared contracts**

- `@clientry/shared/auth`: `sessionResponseSchema.workspace.isDemo`, `demoLoginRequestSchema`
  (`{ role }` on `memberRoleSchema`), `DEMO_LOCKED_PERMISSIONS`, `can`, the `PermissionActor` type
  (`{ role, isDemo }`).

**Web: login page**

- `/login` renders `LoginView` from `features/auth`: the login form, a separator, the demo entry.
- `useDemoLogin(role)` posts to `/api/auth/demo` and enters the session through
  `useEnterSession(next)`, as login does, so a visitor who followed a shared link lands on it.

**Web: demo banner**

- `(app)/layout.tsx` renders `DemoBanner` above the header. It reads `useSession()`, filled by the
  layout's prefetch, so the banner is in the server HTML; it renders nothing outside the demo.
- It names who the visitor is, from the session's name and role, so a manager knows why the owner
  controls are missing.

**Web: team page**

- With the demo lock the owner gets the page a manager gets: no actions column, no invites section,
  no "Rename". The members request is the same; invites are never requested.
- The line under "Members" explains why: the demo text instead of "Only owners can invite people and
  change roles." The demo manager keeps that line of spec 09, since his role is the reason.

**UI kit**

- Nothing new: `alert`, `button`, `card` and `separator` are already in `shared/ui`.

**Test harness**

- `test/fixtures/demo.ts`: `resetDemo(testApp, now?)` runs `DemoResetService` from the test app;
  `enterDemo(testApp, role = 'owner')` posts to `/api/auth/demo` and returns an agent with the
  cookies, like `registerAccount`.
- `resetDatabase` already empties every table, the demo's included; tests that need the demo reset
  it first.

**Architecture decision record**

- `0016-demo-workspace.md`: one shared demo workspace rebuilt daily (the plan's demo account) over a
  sandbox per visitor (a workspace and five users per press, plus a cleanup); a passwordless demo
  route over public credentials (no password in the page, the demo account cannot be entered any
  other way); an owner and a manager entry over the owner alone (the role table is the first
  question about auth, and a visitor sees it from both sides); turning team actions off in the demo
  over a read-only demo (nothing left to try) and over full access (takeover); the workspace flag
  over fixed ids known to the auth module; rows written directly by the reset over domain services
  (backdated history, hundreds of transactions); keeping the workspace row, users and memberships
  across resets over recreating them (visitors stay signed in, writes wait instead of failing); one
  workspace lock taken first over locking every table in the writers' order (a rare deadlock fails
  one side, and both sides can retry); a daily recurring job whose time drifts over a fixed time of
  day (would need schedule state that survives Valkey, or hourly checks that wake Neon).
  Consequences: visitors see each other's changes for up to a day, the banner says so; the demo
  cannot show invites or role changes; a write inside the reset's window can fail once; a new table
  needs a line in the reset.

### Out of scope

- A sandbox per visitor (the plan names one demo account), moderating what visitors type.
- Switching between the demo owner and manager without logging out; entries for the other three
  managers.
- Quotas or write limits in the demo: a script can add rows for up to a day before the reset, as
  any registered account can in its own workspace.
- A reset at a fixed time of day, on demand, or on every deploy.
- A purge of used, revoked and expired invites (spec 09): the demo makes none, and registered owners
  grow them like any other table.
- The demo entry on the register and join pages.
- More than one demo, demo data in other languages.
- e2e tests through the demo (spec 13); README, screenshots and the public repository (spec 14).

## 3. Data model

One migration, `demo_workspace`, through `pnpm db:migrate`, without hand edits.

| Table        | Change                                       |
| ------------ | -------------------------------------------- |
| `workspaces` | new `is_demo boolean NOT NULL DEFAULT false` |

- `isDemo Boolean @default(false) @map("is_demo")`. Existing workspaces get false.
- No index: only the demo login filters by it, joined from memberships with the requested role. A
  partial unique index would need Prisma's `partialIndexes` preview for a guarantee the demo
  module's fixed id already gives.
- No other table changes. The reset deletes the demo's records for real, not with `deleted_at`.

## 4. API

| Method | Path             | Auth   | Request                  | Success                                   | Errors                                                   |
| ------ | ---------------- | ------ | ------------------------ | ----------------------------------------- | -------------------------------------------------------- |
| POST   | `/api/auth/demo` | public | `demoLoginRequestSchema` | 200 `sessionResponseSchema`, both cookies | 400, 403 `UNTRUSTED_ORIGIN`, 429, 503 `DEMO_UNAVAILABLE` |

Changed routes of earlier specs, otherwise as they were:

| Method | Path                                               | Change                        |
| ------ | -------------------------------------------------- | ----------------------------- |
| \*     | routes returning `sessionResponseSchema`           | `workspace.isDemo`            |
| \*     | `/api/invites…`, `PATCH`/`DELETE /api/members/:id` | 403 `DEMO_LOCKED` in the demo |
| PATCH  | `/api/workspace`                                   | 403 `DEMO_LOCKED` in the demo |

`sessionResponseSchema` from the demo route with `{ "role": "owner" }`:

```json
{
  "user": {
    "id": "0199d0a0-0000-7000-8000-000000000001",
    "email": "ann@pixel-studio.example",
    "name": "Ann Carter"
  },
  "workspace": {
    "id": "0199d0a0-0000-7000-8000-000000000100",
    "name": "Pixel Studio",
    "isDemo": true
  },
  "role": "owner"
}
```

Web pages: none new.

## 5. UI

**Log in (`/login`).**

- The card's heading stays "Log in to Clientry", the login form of spec 04 comes first, unchanged.
  Under it a separator with "or", then the demo entry: a bordered box on the muted background with
  "Just looking around?" in semibold, the line "Explore a sample web studio with clients, deals and
  tasks already in place. No sign-up needed.", a full-width button "Explore the demo" in the outline
  style, which stands out on the muted box, and under it a link-style button "or see it as a
  manager".
- The whole card, the demo entry included, fits a 390×844 screen without scrolling.
- "Explore the demo" signs in the owner, "or see it as a manager" the manager. The pressed one shows
  a spinner. While a demo request or a login is pending, and until the page changes after one
  succeeds, "Log in" and both demo buttons are disabled, so the page never starts two sessions.
- Success → the dashboard, or the `next` target.
- Responses: 503 `DEMO_UNAVAILABLE` → an alert in the demo box "The demo is being prepared. Try
  again in a minute."; 429 → the rate limit alert of spec 04; anything else → the unreachable or
  generic alert of spec 04, with the reference. The alert is announced; focus stays on the pressed
  button.

**Demo banner (every page of the app, demo only).**

- A full-width strip above the header, on the muted background: "You are in a shared demo as Ann
  Carter, the owner. Other visitors see your changes, and the data resets every day." For the
  manager: "… as Max Novak, a manager. …". The name comes from the session.
- A plain paragraph after the skip link and before the header: a screen reader meets it once per
  page, and it never takes focus. On a phone it wraps to two lines; the header keeps its layout.

**Team (`/team`) in the demo.**

- The owner sees the members table without the actions column, no "Pending invites" section, and
  the workspace name without "Rename".
- The line under the members heading reads "Inviting people, changing roles, removing members and
  renaming the workspace are turned off in the demo."
- The manager sees the team page of spec 09 for a manager, with its "Only owners can invite people
  and change roles."

Every screen is checked at 390×844 and 1280×800, in light and dark themes, at 360 px for horizontal
scroll, and by keyboard only.

## 6. Tests

- **Unit, packages/shared**
  - Permissions: `DEMO_LOCKED_PERMISSIONS` holds exactly `team.manage` and `workspace.manage`; `can`
    for both roles, in and out of the demo, on every permission; the `hasPermission` and
    `canDeleteRecord` tests of spec 09 pass unchanged.
  - Session: `isDemo` is required.
  - Demo login request: `owner` and `manager` accepted, anything else and a missing role rejected.
- **Unit, apps/api**
  - `buildDemoWorkspace` with a fixed `now`: the counts of section 2; five members, one owner;
    nothing that happened lies after `now`; every activity and notification payload parses; every
    client, deal and task passes its create request schema; a deal's `closed_at` is set exactly
    when its stage is won or lost and equals its last move; `version` is 1 plus its moves and
    updates; positions ascend within each stage; a task links at most one of a client and a deal,
    and starts after it; done tasks have a `task_completed` at `done_at`; sent reminders have
    `reminder_sent_at` and one notification, future ones neither; every member has open deals and
    tasks; every one of the last six 30-day spans holds two won deals; ids are UUIDv7 whose time is
    the row's `created_at`. The same checks at a `now` on the first day of a month and on New
    Year's Eve.
  - `uuidV7At`: version and variant bits, the timestamp read back, two ids at one time differ.
  - `DemoResetService`, repository doubled: passes the built rows with `now`; logs the counts; a repository
    failure propagates.
  - `PermissionsGuard`: an owner in the demo on `team.manage` and `workspace.manage` →
    `DemoLockedError`; on `stages.manage` and `records.delete_any` → passes; a manager in the demo on
    `team.manage` → `InsufficientRoleError`; outside the demo the spec 09 cases pass unchanged.
  - Auth service: the demo session asks the repository for the demo account of the requested role,
    deletes its ended sessions, starts a session and logs; no demo account →
    `DemoUnavailableError` and no session; a session refused for a
    membership gone meanwhile → `NoWorkspaceError`.
  - Demo worker: registers `reset-demo` with a 24-hour period; its processor resets with the current
    time.
- **Integration, apps/api** (testcontainers, supertest, `resetDatabase` before each test)
  - Reset from an empty database: one workspace with `is_demo`, five members with one owner, the
    default stages, and per table the builder's counts.
  - A second reset: the same workspace and user ids, the same join dates, the same counts; a client,
    a deal and a task created through the API in the demo between the resets are gone; a registered
    workspace's records are untouched.
  - A visitor across a reset: the demo agent's next request with the same access token → 200, and
    its refresh → 200.
  - Statements: the second and the third reset run the same number (Prisma query events), with 50
    records added in the demo between them, all inside one transaction.
  - Atomicity: rows whose notifications reference a missing task fail the reset with a foreign key
    error and leave the previous demo's counts as they were.
  - Waiting writes: a client create in the demo, sent while a test transaction holds the demo
    workspace `FOR UPDATE` as the reset does, completes after that transaction commits.
  - Through the API as the demo owner, every route answers 200 under the response serializer: the
    board, the client list (all pages), the task list for every assignee filter, the dashboard
    summary, the closed deals for six months of bounds, the activity feed (all pages), the
    notifications and the unread count, and the history of every deal. The summary has open deals in
    every open stage, overdue tasks and every member in the team rows; the unread count is 2. As the
    demo manager the same routes answer 200, his unread count is 1, and his "me" task filter lists
    his 5 open tasks.
  - Reminders after a reset: the sweep queues the future reminders inside its two-hour window and
    writes no notification for the sent ones.
  - Demo login: `owner` → 200 with both cookies, Ann's session and `workspace.isDemo: true`;
    `manager` → Max's session with role `manager`; another role → 400 on `role`; before any reset →
    503 `DEMO_UNAVAILABLE`; an untrusted origin → 403; the eleventh call within a minute → 429 (the
    rate limit suite); a password login with Ann's or Max's email → 401 `INVALID_CREDENTIALS`.
  - Demo lock: as the demo owner, creating, listing and revoking invites, changing a role, removing
    a member and renaming the workspace → 403 `DEMO_LOCKED`, nothing written; creating and deleting a
    stage, and deleting another member's client → 2xx. As the demo manager, team routes and stage
    writes → 403 `INSUFFICIENT_ROLE`; deleting his own client → 2xx, Ann's → 403 as in spec 06. A
    registered owner's team routes pass as in spec 09.
  - `isDemo` is false in the session of register, login, invite join, refresh and `me` for registered
    accounts.
  - OpenAPI: `POST /api/auth/demo` with `security: []` and its responses; every operation whose
    `x-permission` is locked lists `DEMO_LOCKED`.
  - The suites of specs 03–10 pass with `isDemo` in `AuthUser` and the session.
  - Migrations: deploy and the drift check in global setup pass.
- **Unit and component, apps/web (jsdom, MSW)**
  - Login view: "Explore the demo" posts `{ role: 'owner' }` and "or see it as a manager"
    `{ role: 'manager' }` to `/api/auth/demo`; success writes the session and replaces the route with
    `/` or the `next` target; all three buttons disabled while pending; the 503 and 429 alerts; a
    login still works as in spec 04.
  - Demo banner: the owner's and the manager's text for demo sessions, absent otherwise.
  - Team page in the demo: for the owner no actions column, no invites section and no request for
    invites, no "Rename", the demo line; for the manager the manager line of spec 09; for a
    registered owner as in spec 09.
  - The stage settings link and stage manager follow `can`; the spec 09 and 07 tests pass.
- **e2e**: none (spec 13).

## 7. Acceptance criteria

- [ ] `pnpm db:migrate` applies `demo_workspace` locally; `\d workspaces` shows `is_demo`.
- [ ] `pnpm --filter @clientry/api db:seed` builds the demo in the local database and exits 0; run
      again, it rebuilds it with the same workspace and user ids.
- [ ] `pnpm dev` against a Valkey without the job's key resets the demo at start: one "Demo
      workspace reset" line.
- [ ] In the browser: "Explore the demo" opens the dashboard with every tile filled, both charts,
      every member in the team table and a feed of recent entries; the board has cards in every
      open stage; the tasks page shows Ann's overdue and upcoming tasks; the bell shows 2.
- [ ] "or see it as a manager" opens the same studio as Max: no stage settings link, delete buttons
      only on his own records, his tasks under "Me", the bell shows 1, the banner names him.
- [ ] The team page in the demo shows the members, the demo line and no owner controls; the banner
      is on every page of the app and on no page of a registered account.
- [ ] A password login with `ann@pixel-studio.example` fails like a wrong password.
- [ ] On a 390×844 phone the whole login card, the demo entry included, is visible without
      scrolling; the banner and the team page fit; at 360 px no page scrolls sideways.
- [ ] `browser-verify` over the login page, the demo dashboard and the team page at both sizes and
      in both themes: no failed requests except the expected 401 before a refresh, no console errors,
      no hydration warnings.
- [ ] Keyboard only: both demo buttons are reachable after the login form and work, the banner is
      read once, focus always visible.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; the `image` smoke test
      applies the new migration in the container.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] One migration, `demo_workspace`, in the PR with the code that uses it.
- [ ] `docs/deployment.md` describes the demo queue, ten Valkey connections and the reset's place in
      the Neon budget; ADR 0016 is written.
- [ ] After the merge, the `main` run deploys by itself; the Render log shows "Demo workspace reset"
      within five minutes of the start; on the live URL "Explore the demo" opens the filled
      dashboard; `browser-verify` against the live URL over the login page and the demo passes.
- [ ] A day after the deploy, the Render log shows the second reset, and a demo session started
      before it still works.
- [ ] This spec is part of the PR.
