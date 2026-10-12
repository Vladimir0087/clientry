# 08 — Tasks and reminders

Status: approved

## 1. Goal

Team members plan follow-ups as tasks with a due time, an assignee and an optional client or deal,
and the assignee gets an in-app reminder at the chosen time, delivered exactly once by a BullMQ
worker, also after Valkey loses its data.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/schema.prisma                      # Task, Notification, enum notification_type
  prisma/migrations/<timestamp>_tasks/
  src/
    app.module.ts                           # QueueModule, TasksModule, NotificationsModule;
                                            # forRoot takes shouldRunJobs
    main.ts                                 # shouldRunJobs: true
    infra/queue/
      queue-connections.ts                  # producer and worker ioredis options
      queue-factory.ts                      # creates queues and workers, closes them in order
      recurring-jobs.ts                     # the process clock: adds recurring jobs, deduplicated
      queue.module.ts
    modules/
      tasks/
        tasks.controller.ts                 # CRUD, complete, reopen, restore, list
        tasks.service.ts
        tasks.repository.ts                 # contract, with a unit of work
        prisma-tasks.repository.ts
        prisma-tasks-transaction.repository.ts
        task-reads.repository.ts            # raw SQL reads with joins and visibility
        task-cursor.ts
        task-references.ts                  # one 400 message per reference field
        task-changes.ts                     # equal fields dropped from an edit
        reminder-window.ts                  # the late limit and the horizon, pure
        reminder-queue.ts                   # contract: schedule a pending reminder
        bullmq-reminder-queue.ts
        reminders.repository.ts             # contract: sweep read, delivery unit of work
        prisma-reminders.repository.ts
        reminders.service.ts                # deliver and sweep
        reminders.worker.ts                 # routes deliver-reminder and sweep-reminders jobs
        errors.ts
        tasks.module.ts
      notifications/
        notifications.controller.ts
        notifications.service.ts
        notifications.repository.ts         # contract
        prisma-notifications.repository.ts
        notification-cursor.ts
        errors.ts
        notifications.module.ts
      auth/
        sessions.repository.ts              # deleteExpired
        prisma-sessions.repository.ts
        sessions-purge.worker.ts            # purge-sessions job
        auth.module.ts                      # sessions queue
  test/create-test-app.ts                   # shouldRunJobs, off by default
  test/fixtures/tasks.ts                    # direct inserts for lists, sweep and delivery tests
  test/support/task-doubles.ts              # repository and queue doubles for unit tests
  test/support/held-transaction.ts          # holds a row lock, so a test sees a write wait
  test/support/valkey.ts                    # flushes Valkey before each test
  test/shutdown.integration.spec.ts         # queue and worker connections close too
  test/openapi.integration.spec.ts          # task and notification operations
apps/web/src/
  app/(app)/
    layout.tsx                              # unread count prefetched with the session
    _components/shell-header.tsx            # bell; the nav on its own row below sm
    _components/main-nav.tsx                # Tasks link; scrolls sideways inside itself
    _components/task-section.tsx            # the Tasks section of the client card and deal page
    _lib/prefetch.ts                        # tasks, task, client and deal tasks, unread count
    tasks/
      page.tsx, loading.tsx                 # list
      _components/tasks-view.tsx
      new/page.tsx, new/loading.tsx
      [id]/page.tsx, [id]/loading.tsx       # task page
      [id]/_components/task-view.tsx
      [id]/edit/page.tsx, [id]/edit/loading.tsx
    clients/[id]/_components/client-view.tsx  # Tasks section
    deals/[id]/_components/deal-view.tsx    # Tasks section
  features/
    task-form/                              # create and edit, reminder shortcuts, client and deal
    task-filters/                           # "Only mine", Open and Done: URL state
    complete-task/                          # the checkbox and the task page button, optimistic
    delete-task/                            # confirm dialog, undo toast
    notification-bell/                      # bell, popover, polling, new reminder toast
    deal-form/                              # client picker from entities/client; task queries
                                            # invalidated after an edit
    client-form/                            # task queries invalidated after an edit
    delete-client/, delete-deal/            # dialog text; task queries invalidated
  entities/
    task/                                   # keys, API calls, queries, row, details, labels
    notification/                           # keys, API calls, queries, text of an entry
    client/ui/client-picker.tsx             # moved from features/deal-form
  shared/
    lib/local-date-time.ts                  # date and time inputs to an instant and back
    lib/use-now.ts                          # client-only clock, ticking each minute
    lib/use-is-user-active.ts               # input within the last 15 minutes
    ui/checkbox.tsx                         # shadcn
    ui/option-select.tsx                    # options can be disabled
apps/web/test/
  tasks.ts                                  # makeTask, makeTaskPage
  notifications.ts                          # makeNotification
  msw/handlers.ts                           # GET /api/notifications/unread-count by default
packages/shared/src/
  tasks/                                    # new entry point @clientry/shared/tasks
  notifications/                            # new entry point @clientry/shared/notifications
docs/adr/0012-reminders.md                  # 0011 is taken by the web move to Netlify
docs/deployment.md                          # a new "Background jobs" section at the end:
                                            # connections, Neon and Netlify budgets, memory check
```

**Tenancy**

- Every repository method of tasks takes `workspaceId` first, and every one of notifications the
  owner `{ workspaceId, userId }` first, both from `AuthUser`.
  Unknown body keys (`workspaceId`, `createdById`, `doneAt`, `reminderSentAt`, `deletedAt`) are
  stripped by the schemas.
- A task is visible when it is not deleted and nothing it is linked to is deleted: its client, or
  its deal and that deal's client. A task of another workspace, a deleted task and a hidden one
  answer 404 `TASK_NOT_FOUND` on every route.
- References are checked inside the write's transaction: `assigneeId` is a member, `related.id` an
  active client or a visible deal of the caller's workspace, each read `FOR SHARE` as in spec 07.
  Anything else → 400 `VALIDATION_FAILED` on that field (`assigneeId` "Choose a member",
  `related.id` "Choose a client" or "Choose a deal"), with one message whether the id is unknown,
  deleted, hidden or foreign.
- The deal is read `FOR SHARE` like the client, so a deal deleted at the same moment either waits
  for the task or is seen. A task for a deal that a stage deletion is moving waits for that deletion
  to commit, milliseconds; spec 07 hoped tasks would not wait there, and one rule for every
  reference wins over that remark. No deadlock: a stage deletion takes no lock a task write holds.
- Notifications belong to one user in one workspace; every query filters by both. Another user's
  notification answers 404 `NOTIFICATION_NOT_FOUND`.
- The reminder sweep is the one read across workspaces. Every job it adds carries `workspaceId`,
  and delivery reads the task by it (plan section 6).

**Roles**

| Action                                      | owner    | manager        |
| ------------------------------------------- | -------- | -------------- |
| Tasks: create, read, edit, complete, reopen | yes      | yes            |
| Delete a task, restore after delete         | yes      | own tasks only |
| Notifications: read, mark as read           | own only | own only       |

- "Own" means `createdById` equals the caller, through `canDeleteRecord` of spec 06. A manager
  deleting someone else's task gets 403 `TASK_DELETE_FORBIDDEN`, checked in the service after the
  task is found.
- An assignee who did not create the task can complete and edit it but not delete it.

**Task fields**

| Field        | Required | Rules                                                               |
| ------------ | -------- | ------------------------------------------------------------------- |
| `title`      | yes      | trimmed, 1–200 characters, no NUL                                   |
| `dueAt`      | yes      | an instant from 2000-01-01 to 2099-12-31; past values allowed       |
| `remindAt`   | no       | as `dueAt`, and later than now when set or changed; `null` for none |
| `assigneeId` | yes      | a member of the workspace; the form defaults to the caller          |
| `related`    | no       | `{ kind: "client", id }`, `{ kind: "deal", id }` or `null`          |

- Instants are `z.iso.datetime()` strings in UTC (`Z`, no other offset), turned into
  `toISOString()` form on parse, so a value without milliseconds compares equal to the stored one
  and job ids use whole milliseconds.
- A task links to one client, one deal or nothing. A deal-linked task shows the deal's current
  client and appears on that client's card; storing the client too would go stale when the deal's
  client is edited.
- API messages: "Enter a title", "Use at most 200 characters", "Choose a due date", "Choose a date
  between 2000 and 2099", "Choose a time in the future". Form-only messages: "Choose a due time",
  "Choose a reminder date", "Choose a reminder time".
- One 400 names every invalid field: a past `remindAt` comes together with unusable references.

**Time**

- The API stores and returns instants (ISO strings in UTC) and never formats a time. The browser
  turns the date and time typed in its own zone into an instant and shows instants in its zone,
  through `LocalDate` of spec 07. Users have no time zone setting: a member in another zone sees
  the same task at their local time. This answers plan section 6; Telegram (v2) formats times on
  the server and brings a user time zone with it.
- A typed local time that does not exist (a daylight saving gap) moves forward, as `Date` does;
  one that occurs twice takes the first.

**Reminders: when**

- A task has at most one reminder, an absolute `remindAt`. The form offers shortcuts relative to
  the due time ("At due time", "15 minutes before", "1 hour before", "1 day before", that is 24
  hours) and "Custom time" with its own date and time. Shortcuts are computed in the browser; the
  API knows only the instant. This answers plan section 6: a separate time, with offsets as
  shortcuts. Scenario 3 of the plan ("call Thursday 15:00", reminded Thursday morning) is a custom
  time.
- `remindAt` must be later than the server's now when it is set or changed; otherwise 400 on
  `remindAt` "Choose a time in the future". An unchanged past value passes.
- Setting, changing or removing `remindAt` clears `reminder_sent_at`, so a new time fires again.
  Changing only `dueAt` leaves it; the form sends a recomputed `remindAt` when a shortcut is chosen.
- Completing a task leaves its reminder unsent. Reopening or restoring schedules it again, so a
  reminder whose time passed less than 24 hours ago while the task was done fires at once.

**Reminders: delivery (`modules/tasks`)**

- Postgres is the source of truth (`remind_at`, `reminder_sent_at`); Valkey only holds timers.
  Losing Valkey's data delays reminders but never loses or repeats one (plan section 9).
- A reminder is pending while it is unsent, its task is open, not deleted and visible, and
  `remind_at` lies between now − 24 h (the late limit) and now + 2 h (the horizon). Valkey holds
  jobs for pending reminders only, so its memory does not grow with tasks planned months ahead,
  and a reminder more than a day late is dropped as noise.
- The horizon (2 h) is longer than the sweep period plus a tick (1 h 5 min), so while the API runs
  every reminder is queued before its time. After API downtime longer than an hour a reminder can
  wait up to an hour for the next sweep.
- The job: queue `reminders`, name `deliver-reminder`, id `reminder-<taskId>-<remindAt in ms>`
  (BullMQ ignores an add whose id exists; custom ids hold no `:`), data
  `{ workspaceId, taskId, remindAt }`, delay `max(0, remindAt − now)`, `removeOnComplete` and
  `removeOnFail` true, 5 attempts with exponential backoff from 10 s. A changed reminder gets a new
  id; the old job is not removed: it finds `remind_at` changed and does nothing.
- On write: after a task write commits (create, edit, reopen, restore), a pending reminder is added
  at once. A failed add is logged at `warn` with the task and workspace ids and the request still
  succeeds; the sweep adds it later.
- The sweep: job `sweep-reminders` on the same queue, at most once an hour (see recurring jobs). One
  query over the `remind_at` index finds every pending reminder, and one `addBulk` adds their jobs;
  ids already present are ignored. `info` with the number of reminders found.
- Delivery runs in one transaction:
  1. the task row is locked `FOR UPDATE` by `taskId` and `workspaceId` in a statement of its own,
     then read with the visibility joins: a locking read over the joins would recheck a row
     changed meanwhile against the joined rows it saw first and drop a task whose assignee or link
     changed; the client and deal rows need no lock here;
  2. the reminder must still be pending, with `remind_at` equal to the job's, compared in
     milliseconds;
  3. the assignee's membership in that workspace is read `FOR SHARE`: the assignee is taken at
     delivery, not when the job was queued, and a user without membership gets nothing (agreed
     with the spec 09 draft);
  4. `reminder_sent_at` is set and one notification is inserted for the assignee.
- A failed check writes nothing and completes the job with an `info` line and its reason:
  `not_found`, `done`, `changed`, `sent`, `too_late`, `not_member`. A job that runs twice, or two
  jobs for one reminder, deliver one notification: the second finds `reminder_sent_at` set.
- A skip leaves the reminder pending in Postgres. For `not_member` the hourly sweep adds it again,
  a no-op each time, until the late limit passes or spec 09 hands the task to another member, who
  then gets it. Accepted: one cheap job an hour for a rare case.
- Job data that does not parse fails at once without retries (BullMQ's `UnrecoverableError`) and is
  logged at `error`. A delivery that fails all five attempts is logged at `error`; the next sweep
  adds it again until the late limit passes.
- Worker concurrency: 2.

**Recurring jobs (`infra/queue/recurring-jobs.ts`)**

- BullMQ's job schedulers live in Valkey, which on the demo keeps no data across restarts: a lost
  scheduler would stop the sweep until the next deploy. The clock lives in the process instead.
- At startup and every 5 minutes (an unref'd timer, stopped on shutdown) the clock adds each
  registered job with `deduplication: { id: <name>, ttl: <period> }`: BullMQ ignores the add while
  one added less than a period ago exists, however many ticks or API instances there are. A tick
  touches Valkey only.
- Registered: `sweep-reminders` every hour on queue `reminders`, and `purge-sessions` every 24 hours
  on queue `sessions`, the purge spec 03 left to the first queue.
- Modules register their jobs with `RecurringJobs.register({ queue, name, period })` in
  `onModuleInit`; the first tick runs in `onApplicationBootstrap`, after every module registered.
  `tick()` is public, so tests run one on demand.
- After a Valkey loss the deduplication keys are gone too, so the next tick, within 5 minutes, runs
  the sweep and every pending reminder is back.
- A failed tick (Valkey down) logs `warn` once per state change, as the probe client of spec 02.
- A failed run is retried twice with exponential backoff from 10 s: its deduplication key holds
  back the next add for a whole period, so one Postgres error would otherwise delay the sweep by
  an hour and the purge by a day.

**Session purge (`modules/auth`)**

- `purge-sessions` deletes sessions past their absolute end (`expires_at`), 1 000 per statement
  until none are left; their refresh tokens go by cascade. `info` with the count.

**Queue connections (`infra/queue`)**

- Plain `bullmq`. Each queue has its own connection from `REDIS_URL` with the probe client's options
  (specs 02, 05): `maxRetriesPerRequest` 1 and `commandTimeout` 2 s, so an add during a Valkey
  outage fails within seconds instead of holding the request. The offline queue stays on: the API
  starts while Valkey is down (spec 02), and BullMQ's `enableOfflineQueue: false` needs Valkey up
  when the queue is created.
- Each worker has its own connections with `maxRetriesPerRequest: null`, which BullMQ requires so a
  worker waits out an outage, and no `commandTimeout`, which its blocking reads would outlive; the
  retry strategy is the probe's.
- Seven connections in all (the probe, two queues, two workers with two each), of the 50 Render Key
  Value allows.
- `QueueFactory` (`infra/queue/queue-factory.ts`) owns every queue and worker:
  `createQueue(name)` and `createWorker(name, process, { concurrency })`. Modules never close
  their own. Workers are created with `autorun: false` and started with `run()` in
  `onApplicationBootstrap`. On shutdown the clock stops and the workers close in
  `beforeApplicationShutdown`, waiting for an active job; the queues close with Prisma and the
  probe in `onApplicationShutdown`. The 10 s deadline of spec 02 still bounds it; a job it cuts off
  is retried after the restart.
- `AppModule.forRoot` takes `shouldRunJobs`: `main.ts` passes `true`, `createTestApp` passes
  `false` unless a test asks. Without it no worker runs and the clock does not tick, while queues
  still exist, so a write still adds its job. Integration tests count SQL statements through
  Prisma's query events, and a sweep running in the background would land in those counts.
- `@nestjs/bullmq` 12 supports Nest 12; plain `bullmq` keeps the different producer and worker
  options and the closing order explicit in two small classes (ADR 0012).
- `bullmq` 6 declares `ioredis` an optional peer (`>=5`); it resolves to the API's `ioredis` 6. Its
  other optional peers (`pg`, `redis`, `bullmq-otel`) stay uninstalled.
- Valkey's `maxmemory-policy` stays `noeviction`: set on Render (spec 05), Valkey's default locally
  and in tests.

**Neon budget**

- An idle API touches Postgres only through the sweep: one query an hour at most, keeping Neon
  awake for its 5 minutes, about 62 hours a month, 15.5 of the 100 CU-hours at 0.25 CU. The daily
  session purge adds one wake a day when it misses the sweep's, about 2.5 hours more. Ticks, the
  waiting workers and the delayed jobs touch Valkey only.
- The bell polls only while the tab is visible and the user was active within 15 minutes (section
  5): every API call checks the session in Postgres (spec 03), so a forgotten open tab would keep
  Neon awake around the clock.

**Netlify budget**

- Every poll goes through the `/api/*` rewrite, so it is one invocation of Netlify's server function
  (spec 05, ADR 0011): 60 per hour of an active, visible tab. The legacy Free plan allows 125k
  invocations a month, about 2 000 such tab-hours with nothing else counted, and going over pauses
  the site. The activity limit keeps a forgotten tab from spending it; the UptimeRobot monitor of
  `/login` (about 9 000 a month) is unchanged.
- The unread count prefetched by the `(app)` layout is fetched by the server function from the API
  directly, not through the rewrite, so it adds no invocation.

**Tasks: create, edit, complete, delete**

- Create returns the task with 201.
- Edit is `PATCH` with any of the fields. Inside the transaction the service drops fields equal to
  the stored ones; nothing left → 200 with the task unchanged, no write. Last write wins per field,
  as for clients (spec 06): a task is a small record and two people rarely edit one at once; deals
  keep their version.
- `POST /complete` sets `done_at` to now, `POST /reopen` clears it. Both are idempotent: completing
  a done task keeps its `done_at` and answers 200.
- Delete and restore follow spec 06: soft delete, a conditional update on `deleted_at`, 404 when
  nothing matched; restore of an active task → 200 unchanged; restore of a task whose client or
  deal is deleted → 404, as a deal of a deleted client in spec 07.
- Deleting a client or a deal writes nothing to its tasks. They are hidden with it and come back
  with its restore, as deals with their client (spec 07). The sweep picks up their reminders again
  within the hour.

**Lists**

- `GET /api/tasks`: `status` (`open` by default, or `done`), `assignee` (`me` only, as on the board),
  `clientId` or `dealId` (at most one), `cursor`, `limit` (25 by default, 1–100).
- Open tasks by `due_at` ascending, then id. Done tasks by `done_at` descending, then `due_at` and id
  descending: the index read backwards.
- `clientId`: the tasks linked to the client or to one of its visible deals. `dealId`: the deal's
  tasks. A client or deal of another workspace, or a deleted one, gives an empty list, as a filter
  does.
- The cursor follows spec 06: base64url JSON of the last row, `["open", dueAt, id]` or
  `["done", doneAt, dueAt, id]`; a cursor for the other status answers 400 "Invalid cursor".
- One SQL statement per page whatever its size: assignee, creator, client, deal and the deal's
  client names come through joins in `task-reads.repository.ts`, raw SQL as in spec 07.

**Notifications (`modules/notifications`)**

- `GET /api/notifications`: newest first (`created_at`, then id, descending), `cursor`, `limit`
  (20 by default, 1–50), `{ items, nextCursor }`.
- `GET /api/notifications/unread-count`: `{ count }`, counted up to 100 by a `LIMIT` in a subquery,
  so a poll costs the same however many pile up; the web shows "99+" above 99. At 100 unread the
  count stops rising, so a new reminder brings no toast until some are read; accepted.
- `POST /api/notifications/:id/read` → 204, idempotent.
- `POST /api/notifications/read-all` with `{ before }` → 204: marks the unread notifications
  created at or before `before`, the newest one the user has seen. One arriving meanwhile stays
  unread.
- A notification is a snapshot: `type` and a `jsonb` payload written through
  `notificationEventSchema` and read through `notificationSchema`, as the deal history (spec 07).
  `task_reminder` carries `{ task: { id, title }, dueAt }`. The web builds the text, so times show
  in the reader's zone. A stored row that does not parse fails the request with 500.
- A notification stays when its task is later edited, completed, deleted or hidden; opening it then
  shows the task as it is, or its not found state.
- Reminder delivery in the tasks module is the one writer of `notifications`; the notifications
  module reads them and marks them read.

**Logging**

- `info` with workspace id and user id on task create, complete, reopen, delete and restore;
  reminder delivered or skipped (task id, workspace id, reason); sweep and purge (counts). `warn`
  on a failed add or tick.
- No titles or times in log lines. The `err` serializer drops the command arguments ioredis
  attaches to its errors, since a failed add carries the job data there.

**Errors**

| Class                       | Module        | Kind      | Code                     | Detail                                      |
| --------------------------- | ------------- | --------- | ------------------------ | ------------------------------------------- |
| `TaskNotFoundError`         | tasks         | NotFound  | `TASK_NOT_FOUND`         | Task not found                              |
| `TaskDeleteForbiddenError`  | tasks         | Forbidden | `TASK_DELETE_FORBIDDEN`  | Managers can delete only tasks they created |
| `NotificationNotFoundError` | notifications | NotFound  | `NOTIFICATION_NOT_FOUND` | Notification not found                      |

A malformed `:id` answers 400 `VALIDATION_FAILED` on `id` before any query, as in spec 06.

**Units of work and seams**

- `TasksRepository.inTransaction(work)` and `RemindersRepository.inTransaction(work)` follow spec 07:
  the rules stay in the services and run inside, so services are tested without a database.
- `ReminderQueue` is a contract with one method, `schedule(reminders)`, a batch, so the sweep adds
  with one `addBulk`; the BullMQ implementation builds the job id, delay and options. Service unit
  tests use a double, without Valkey.
- `reminder-window.ts` holds the late limit, the horizon and `isPending(reminder, now)`, pure.
- Time comes from `new Date()` as elsewhere in the API; unit tests set it with Vitest's system time.

**Swagger**

- Tags `tasks` and `notifications`. Every operation carries the cookie scheme and documents its
  error responses with examples built from the domain errors; 401 is declared once per controller.
  `status`, `assignee`, `clientId`, `dealId`, `cursor` and `limit` are listed as query parameters.

**Shared contracts**

- `@clientry/shared/tasks`, new entry point:
  - `TASK_LIMITS` (title length, page sizes, cursor length);
  - `createTaskRequestSchema`, `updateTaskRequestSchema` (every field optional), `taskIdParamsSchema`,
    `taskListQuerySchema` (`clientId` and `dealId` together → "Use clientId or dealId, not both");
  - `taskSchema` (`Task`), `taskListResponseSchema`;
  - inferred types. `related` request and response schemas, the status and the instant schema are
    not exported.
- `@clientry/shared/notifications`, new entry point: `NOTIFICATION_LIMITS`,
  `notificationEventSchema`, `notificationSchema` (`Notification`, a discriminated union on `type`),
  `notificationListQuerySchema`, `notificationListResponseSchema`, `unreadCountResponseSchema`,
  `markAllReadRequestSchema`, `notificationIdParamsSchema`, inferred types.
- Ids through `idSchema` of `@clientry/shared/common`, instants as `z.iso.datetime()` strings, as in
  spec 07.

**Web: data layer (`entities/task`, `entities/notification`)**

- `taskKeys`: `all`, `lists`, `list(filters)`, `details`, `detail(id)`. `TaskFilters` and
  `taskListPath(filters)` serve the browser and the server prefetch, as `boardPath` in spec 07.
  `TaskFilters` is `{ isMine, status, clientId?, dealId? }`; `isMine` sends `assignee=me`, and
  `status` is sent only when it is `done`.
- `useTasks(filters)`: infinite, by cursor, `placeholderData: keepPreviousData`. `useTask(id)`.
- UI: the task row body, task details, the due label with "Overdue", the reminder label, skeletons,
  the not found state. `entities/task` imports no other entity: the link to the client or deal is
  built in the app layer and passed in, as the deal page's client link (spec 07).
- `notificationKeys`: `all`, `list`, `unreadCount`. `useNotifications()` (infinite, enabled while the
  popover is open), `useUnreadCount()` (polling, see the bell), `describeNotification`.
- `entities/client/ui/client-picker.tsx`: the combobox of spec 07, moved out of
  `features/deal-form`, as features cannot import each other.
- Cache after writes:
  - create, edit: the detail is written, every task list invalidated;
  - complete, reopen: see below;
  - delete: the route is replaced first, then the lists are invalidated and the detail marked stale
    without a refetch; restore, in the mutation's own options, since Undo outlives the page: the
    lists and the detail;
  - client and deal delete and restore (`features/delete-client`, `features/delete-deal`, the
    restore hooks): every task query (`taskKeys.all`), only marked stale on delete
    (`refetchType: 'none'`), as in spec 07;
  - client edit and deal edit (`features/client-form`, `features/deal-form`): every task query,
    since rows show client names and deal titles, and a deal's new client moves its tasks
    between client cards;
  - mark as read, mark all: the list and the count are changed in place, then the count refetched;
    a request for them already running is cancelled, so its older answer cannot undo the change,
    and a cancelled list is fetched again.

**Web: filters (`features/task-filters`)**

- nuqs, as spec 07: `assignee=anyone` turns "Only mine" off, which is on by default; `status=done`
  shows done tasks, open by default. Defaults are left out of the URL; any other value parses as the
  default. Shallow updates that replace the history entry; the parsers serve the client hook and a
  `createLoader` for the server prefetch.

**Web: completing (`features/complete-task`)**

- A checkbox on each row ("Mark <title> as done", or "Reopen <title>" on a done task) and a button
  on the task page ("Mark as done", "Reopen").
- Optimistic: every cached task list and the detail change in place at once (`doneAt` set or
  cleared). The row stays where it is, struck through, until its list is next fetched (a filter
  change, a return to the page, window focus), so the rows never jump under the pointer and focus
  stays on the checkbox. On success the server's task replaces the cached one and the lists are
  marked stale without a refetch.
- On error the row returns to the state the server last confirmed, also when an earlier toggle of
  a quick double toggle failed too, and a toast says "Could not update the task. Try again.";
  a 404 says "This task no longer exists." and invalidates the lists and the detail, so an open
  task page shows its not found state.
- Toggles of one task share a mutation scope, so a quick double toggle runs in order.
- Before the write, requests running for lists that hold rows and for the detail are cancelled, so
  an older answer cannot undo it; a list on its first load is left to finish.

**Web: task form (`features/task-form`)**

- One form for create and edit, react-hook-form with a form schema over local values: due date
  (`<input type="date">`), due time (`<input type="time">`, default 09:00), reminder choice, custom
  reminder date and time. On submit `local-date-time.ts` turns them into instants; a server error
  on `dueAt` lands on Due date, one on `remindAt` on Reminder date for "Custom time" and on the
  Reminder select otherwise.
- Native date and time inputs: keyboard and screen reader support and a phone's own pickers, with
  no date library.
- The form renders in the browser only, after hydration, with a form skeleton in the server HTML:
  its values come from instants in the reader's zone, which the server does not know.
- Reminder select: "No reminder", "At due time" (the default for a new task), "15 minutes before",
  "1 hour before", "1 day before", "Custom time". Once the due date and time are filled, a shortcut
  whose moment has passed is disabled, with "(passed)" in its label (`OptionSelect` options gain
  `isDisabled`); a chosen shortcut that passes meanwhile fails on submit with "Choose a time in the
  future". "Custom time" shows Reminder date and Reminder time, starting at the due date and
  09:00.
- On create, until the user opens the Reminder list, the reminder follows the due date and time:
  "At due time" while that moment lies ahead or the due fields are incomplete, "No reminder" once
  it has passed, so a task due earlier today saves without a reminder. Once the list was opened,
  the value stands, whether or not another option was picked.
- Edit shows the shortcut that matches `dueAt − remindAt` to the minute, or "Custom time"; a sent
  reminder adds the hint "Sent <date, time>". Changing the due date or time with a shortcut chosen
  recomputes the reminder.
- Client: the client picker, now in `entities/client` (its own imports there become relative),
  optional, with "Remove client". Deal: a select enabled once a client is chosen, "No deal" and that
  client's deals (`useClientDeals`, the 50 newest, spec 07), plus the linked deal when the list
  lacks it, as the stage select of spec 07. While the client's deals load, the select is disabled
  with "Loading deals…"; a failed load shows "We could not load the client's deals." with "Try
  again". Choosing another client resets Deal to "No deal". The
  request sends `related` as the deal when one is chosen, else the client, else `null`.
- `/tasks/new` takes `clientId` or `dealId` from the URL on the server, as `/deals/new` does; a deal
  fills both fields from the loaded deal; a malformed or unknown value is ignored.
- Assignee: members in join order, default the caller.
- Edit sends the changed fields only and keeps "Save changes" disabled until one changes. Times
  compare as the untouched form builds them, so a stored time the inputs cannot show (seconds, the
  second pass of a repeated hour) is not sent; custom reminder fields left behind by a shortcut
  chosen again count as no change.
- Cancel goes to the task page on edit, and on create to the client card for `clientId`, the deal
  page for `dealId`, `/tasks` otherwise.

**Web: bell (`features/notification-bell`)**

- `useUnreadCount` polls every 60 seconds while the document is visible (TanStack Query skips
  hidden tabs) and the user has pressed a key, clicked, scrolled or touched within 15 minutes
  (`use-is-user-active.ts`); loading the page counts as input. Input after a pause refetches at
  once unless the count is fresh or a request for it is running; window focus refetches as
  everywhere.
- When a poll returns a count higher than the server last returned to this page, the first page of
  the list is fetched (also while the popover is closed) and one toast shows: for one new reminder
  "Reminder: <title>" of the newest unread entry, with "Open", which marks it read and opens the
  task; for more, "<N> new reminders" with "Show", which opens the popover. Not on the first count
  after a load, and not for the count coming back after a mark as read changed it in place.

**Web: server prefetch**

- `/tasks`: the list for the filters in the URL. `/tasks/[id]`: the task. `/tasks/[id]/edit`: the
  task and the members. `/tasks/new`: the members, and the client or the deal from the URL.
  `/clients/[id]` and `/deals/[id]`: their open tasks next to what they load now. The `(app)`
  layout: the unread count with the session, so the badge is in the first HTML.
- Through `prefetch.ts` of spec 06; at 189 lines it stays one file. A 404 of the task prefetch is
  expected and not logged.

**UI kit**

- `pnpm dlx shadcn@4.21.1 add checkbox`, the CLI version of specs 04, 06 and 07. The owner
  approved this temporary run for this spec; the CLI is not installed and is not a dependency. The
  checkbox wraps `radix-ui`, already a dependency.

**Dependencies**

- API: `bullmq`, the latest stable (6.x), exact-pinned. Web: none new.

**Architecture decision record**

- `0012-reminders.md`: Postgres as the source of truth with Valkey holding only timers within a
  two-hour horizon, over polling Postgres for due reminders (Neon would never sleep) and over
  queueing every reminder when written (Valkey's 25 MB fill with tasks planned far ahead and stale
  jobs); exactly once through a conditional `reminder_sent_at` in the delivery transaction; a
  process clock with deduplicated adds over BullMQ job schedulers, which vanish with Valkey's data;
  plain `bullmq` over `@nestjs/bullmq`; instants only, no user time zone; polling with an activity
  limit until the v2 WebSocket. Consequences: a reminder can come up to 5 minutes late after a
  Valkey loss and up to an hour late after API downtime longer than an hour, one more than a day
  late is dropped, and the bell lags a reminder by up to a minute.

### Out of scope

- Notifications for anything but reminders (an assigned task, a moved deal), email and Telegram
  (v2), browser push, live updates through the v2 WebSocket.
- Recurring tasks, subtasks, priorities, task notes, comments, attachments, snoozing a reminder,
  more than one reminder per task, all-day tasks without a time.
- A user time zone setting; reminder times computed on the server.
- Task events in a deal's history or the activity feed (spec 10 decides).
- Filters by member (spec 09), by client or deal in the task list, search and other sorts, bulk
  actions, a calendar view.
- A notifications page, deleting notifications, a purge of old ones (the demo reset of spec 11
  clears them).
- Record versions for tasks; hard delete and a purge of deleted tasks.
- A queue dashboard (Bull Board); metrics.
- Rate limits on task routes.
- Partial indexes: Prisma supports them only as a preview feature (spec 06).

## 3. Data model

One migration, `tasks`, made with `pnpm db:migrate`.

| Table           | Columns                                                                                                                                                                                     | Constraints and indexes                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks`         | `id`, `workspace_id`, `created_by_id`, `assignee_id`, `client_id?`, `deal_id?`, `title`, `due_at`, `remind_at?`, `reminder_sent_at?`, `done_at?`, `created_at`, `updated_at`, `deleted_at?` | index `(workspace_id, done_at, due_at, id)`; index `(assignee_id, done_at, due_at, id)`; index `(client_id, due_at)`; index `(deal_id, due_at)`; index `(remind_at)`; cascade from workspaces; no action from clients and deals; restrict from users |
| `notifications` | `id`, `workspace_id`, `user_id`, `task_id?`, `type` (`notification_type`), `payload` (`jsonb`), `read_at?`, `created_at`                                                                    | index `(user_id, created_at, id)`; index `(user_id, read_at, workspace_id)`; cascade from workspaces; no action from tasks; restrict from users                                                                                                      |

- Enum `notification_type` with `task_reminder`. `activity_type` is unchanged.
- Times are `timestamptz(3)`, as everywhere.
- The first index serves the open lists (`done_at IS NULL`, then `due_at`, id) and, read backwards,
  the done lists; the second the same for "Only mine". The client and deal indexes serve the
  sections, the client's deal tasks included, and the foreign keys. `remind_at` serves the sweep,
  whose range is bounded on both sides by the window, so sent reminders do not pile up in the scan.
  The two notification indexes serve the list and the unread count, the latter as an index-only
  scan: `workspace_id` comes last, since the count filters by the user and the workspace.
- `client_id` and `deal_id` are never both set. The shared schemas are the only writer's gate, as
  for lengths and amounts (spec 06); no check constraint.
- `notifications.task_id` is nullable for later types; every `task_reminder` sets it. Notifications
  are never changed but for `read_at`, so no `updated_at`.
- References inside a workspace are `NO ACTION`, to users `RESTRICT`, as in spec 07. The workspace
  foreign keys get their own indexes when a workspace can be deleted (v2).

## 4. API

All routes need the access cookie.

| Method | Path                              | Request                       | Success                              | Errors                                                     |
| ------ | --------------------------------- | ----------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/tasks`                      | `taskListQuerySchema`         | 200 `taskListResponseSchema`         | 400                                                        |
| POST   | `/api/tasks`                      | `createTaskRequestSchema`     | 201 `taskSchema`                     | 400, 403 `UNTRUSTED_ORIGIN`                                |
| GET    | `/api/tasks/:id`                  | —                             | 200 `taskSchema`                     | 400 (`id`), 404 `TASK_NOT_FOUND`                           |
| PATCH  | `/api/tasks/:id`                  | `updateTaskRequestSchema`     | 200 `taskSchema`                     | 400, 403 `UNTRUSTED_ORIGIN`, 404                           |
| POST   | `/api/tasks/:id/complete`         | —                             | 200 `taskSchema`                     | 400, 403 `UNTRUSTED_ORIGIN`, 404                           |
| POST   | `/api/tasks/:id/reopen`           | —                             | 200 `taskSchema`                     | 400, 403 `UNTRUSTED_ORIGIN`, 404                           |
| DELETE | `/api/tasks/:id`                  | —                             | 204                                  | 400, 403 `UNTRUSTED_ORIGIN` / `TASK_DELETE_FORBIDDEN`, 404 |
| POST   | `/api/tasks/:id/restore`          | —                             | 200 `taskSchema`                     | 400, 403 `UNTRUSTED_ORIGIN` / `TASK_DELETE_FORBIDDEN`, 404 |
| GET    | `/api/notifications`              | `notificationListQuerySchema` | 200 `notificationListResponseSchema` | 400                                                        |
| GET    | `/api/notifications/unread-count` | —                             | 200 `unreadCountResponseSchema`      | —                                                          |
| POST   | `/api/notifications/:id/read`     | —                             | 204                                  | 400, 403 `UNTRUSTED_ORIGIN`, 404 `NOTIFICATION_NOT_FOUND`  |
| POST   | `/api/notifications/read-all`     | `markAllReadRequestSchema`    | 204                                  | 400, 403 `UNTRUSTED_ORIGIN`                                |

Every route can also answer 401 `AUTHENTICATION_REQUIRED`.

`createTaskRequestSchema`:

```json
{
  "title": "Call Romashka about the proposal",
  "dueAt": "2026-10-15T12:00:00.000Z",
  "remindAt": "2026-10-15T06:00:00.000Z",
  "assigneeId": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "related": { "kind": "deal", "id": "0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b" }
}
```

`taskSchema`:

```json
{
  "id": "0199c2a1-…",
  "title": "Call Romashka about the proposal",
  "dueAt": "2026-10-15T12:00:00.000Z",
  "remindAt": "2026-10-15T06:00:00.000Z",
  "reminderSentAt": null,
  "doneAt": null,
  "assignee": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
  "createdBy": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
  "related": {
    "kind": "deal",
    "id": "0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b",
    "title": "Landing page for Romashka",
    "client": { "id": "0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b", "name": "Romashka LLC" }
  },
  "createdAt": "2026-10-11T09:30:00.000Z",
  "updatedAt": "2026-10-11T09:30:00.000Z"
}
```

A client link is `{ "kind": "client", "id": "…", "name": "Romashka LLC" }`; no link is `null`.

A `notificationSchema` entry:

```json
{
  "id": "0199c3b0-…",
  "type": "task_reminder",
  "payload": {
    "task": { "id": "0199c2a1-…", "title": "Call Romashka about the proposal" },
    "dueAt": "2026-10-15T12:00:00.000Z"
  },
  "readAt": null,
  "createdAt": "2026-10-15T06:00:01.204Z"
}
```

Web pages:

| Path               | Access    | Title     |
| ------------------ | --------- | --------- |
| `/tasks`           | protected | Tasks     |
| `/tasks/new`       | protected | New task  |
| `/tasks/[id]`      | protected | Task      |
| `/tasks/[id]/edit` | protected | Edit task |

## 5. UI

**Shell.**

- The main navigation gains "Tasks" after "Deals", with `aria-current="page"` on `/tasks` and below.
- A bell button before the theme menu: "Notifications", or "Notifications, 3 unread", with a badge
  of the count ("99+" above 99) hidden from screen readers, since the name carries it.
- Below `sm` the header takes two rows: the brand, the bell, the theme menu and the account button
  on the first, the navigation on the second, scrolling sideways inside itself if its links ever
  overflow; the page never does. In one row at 360 px the brand, three links and three icon buttons
  need about 376 of the 328 px inside the padding, and specs 09 and 10 may add links. From `sm` up
  the header stays one row. Tab follows the DOM, brand, navigation, then the buttons, so below `sm`
  it reaches the second row before the first; accepted, as any order mismatches one of the layouts.

**Bell popover.**

- Heading "Notifications" and "Mark all as read" while something is unread.
- Entries, newest first: an unread dot and bold text for unread ones ("Unread" for screen readers),
  "Reminder: <title>", "Due <date, time>", and when it arrived ("Received" for screen readers).
  Each entry is a link to the task; following it marks the entry read and closes the popover.
- "Show older" when there are more; focus stays on it as entries are appended, as "Load more" in
  spec 06.
- Empty: "No notifications yet. Reminders for your tasks appear here." States: skeleton rows; "We
  could not load notifications." with "Try again".
- Opening moves focus into the popover as Radix does, to its first focusable element. Escape closes
  it and focus returns to the bell.

**Tasks (`/tasks`).**

- Heading "Tasks" and a "New task" button.
- Toolbar: "Only mine" (`aria-pressed`, on by default) and a two-button group "Open" and "Done"
  (`aria-pressed`).
- The list, one row per task: the checkbox; the title as a link to the task page; the due date and
  time, with an "Overdue" badge (`danger`) on an open task past due; a bell icon with "Reminder at
  <time>" for screen readers when an open task's reminder is set and unsent; the assignee when
  "Only mine" is off; the related client, or the deal and its client, as links. Done rows show
  "Done <date>" instead of the badge and no bell: their reminder never fires.
- 25 rows, then "Load more".
- States: skeleton rows; "We could not load tasks." with "Try again"; while filters change the old
  rows stay dimmed and `aria-busy`; empty states:
  - open, only mine: "No open tasks are assigned to you." with "Show everyone's tasks", which turns
    "Only mine" off;
  - open, everyone: "No open tasks. Add one with New task.";
  - done: "No completed tasks yet."

**Task page (`/tasks/[id]`).**

- Link "Tasks" back to the list; the title as heading, with a "Done" (`success`) or "Overdue"
  (`danger`) badge; "Mark as done" or "Reopen"; "Edit"; "Delete" only when `canDeleteRecord`
  allows, hidden while the session loads.
- Details: Due; Reminder ("<date, time>", "Sent <date, time>" once delivered, or "No reminder");
  Assignee; Related to, a link to the client card or the deal page ("<deal> · <client>"); "Completed
  <date, time>" when done; "Added by <name> on <date> · Updated <date>".
- States: skeleton; error with "Try again"; not found ("Task not found", "It may have been
  deleted.", link to the list) for a 404.

**New task and Edit task (`/tasks/new`, `/tasks/[id]/edit`).**

- Fields: Title; Due date and Due time side by side from `sm`, one under the other on a phone;
  Reminder, then Reminder date and Reminder time
  for "Custom time"; Assignee; Client; Deal. Buttons "Create task" or "Save changes", and "Cancel"
  (section 2 says where it goes).
- The form rules of spec 06: mode `onTouched`, server field errors on their fields, one form alert
  for the rest, the button disabled with a spinner while submitting, `autocomplete="off"`.
- Edit loads the task, shows a form skeleton until it loads, "Try again" on a load error, the not
  found state on 404.
- Responses: 400 → field errors (`related.id` on Client or Deal, whichever was sent; `assigneeId`
  on Assignee; `remindAt` on the reminder fields); 404 on edit → alert "This task no longer exists."
  with a link to the list; a host's 502 or 504 without problem details, or a network failure → "The
  server is waking up or busy. Try again in a minute." through `unexpectedAlert` (spec 05); anything
  else → "Something went wrong. Try again." with the reference.
- Success replaces the route with the task page.

**Delete.**

- A confirm dialog: "Delete <title>?", "The task disappears from lists. You can undo this right
  after.", "Cancel" and "Delete" (destructive; spinner and not dismissible while pending).
- Deleting is on the task page only; rows have no delete control.
- Success: the route is replaced with `/tasks`, toast "Task deleted" with "Undo" for 10 seconds;
  Undo restores and shows "Task restored"; a failed restore shows "Could not restore the task."
- 403 → the dialog closes, toast "You can delete only tasks you created."; 404 → route replaced
  with `/tasks`, toast "This task was already deleted."; anything else → alert inside the dialog.

**Client card and deal page.**

- A "Tasks" section: a "New task" link (`/tasks/new?clientId=<id>` or `?dealId=<id>`) and the open
  tasks, rows as on `/tasks` with the assignee shown; on the client card a deal-linked row names its
  deal. Empty: "No open tasks". 25 rows, then "Load more". Its own skeleton and error with "Try
  again".
- The client delete dialog says "The client, their deals and tasks disappear from lists, search and
  the board. You can undo this right after." The deal delete dialog says "The deal and its tasks
  disappear from the board and the client's deals. You can undo this right after."

**Focus.**

- After a route change the app makes itself (create, save, delete, a 404 on delete), focus moves to
  the new page's `h1`, as in spec 06.
- The checkbox keeps focus while its row is struck through or restored. "Show everyone's tasks"
  leaves focus on "Only mine", now off. "Load more" and "Show older" follow spec 06.
- Following a notification focuses the task page's heading. "Mark all as read" keeps focus in the
  popover, on the first entry.
- "Try again" moves focus as `RetryMessage` of spec 07: to "Tasks", to the section's "Tasks"
  heading, to "Notifications" in the popover; on the task page through the box the state loads
  into.
- The toast for new reminders does not take focus; sonner's live region announces it.

Every screen is checked at 390×844 and 1280×800, in light and dark themes, at 360 px for horizontal
scroll of the page, and by keyboard only.

## 6. Tests

- **Unit, packages/shared**
  - Create task: title trimmed, blank → "Enter a title", 201 characters rejected; `dueAt` missing →
    "Choose a due date", `1999-12-31T…` and `2100-01-01T…` rejected, an offset other than `Z`
    rejected, `2026-10-15T12:00:00Z` parsed as `2026-10-15T12:00:00.000Z`; `remindAt: null`
    accepted; `related` of each kind and `null` accepted, an unknown kind
    rejected; `workspaceId` stripped.
  - Update task: `{}` accepted; `remindAt: null` and `related: null` accepted.
  - List query: no params → `open`; `clientId` with `dealId` → "Use clientId or dealId, not both";
    `assignee=someone` rejected; `limit=101` rejected.
  - Notifications: a `task_reminder` entry parses; an unknown type and one without `task` are
    rejected; `read-all` without `before` rejected.
- **Unit, apps/api**
  - Reminder window: pending inside the window; not pending when unset, sent, done, more than 24 h
    late or beyond the horizon; the boundaries. Deleted and hidden tasks never reach the check:
    the queries leave them out, and the delivery and sweep integration tests cover them.
  - Task cursor: round trip for both statuses; a cursor of the other status, a broken one and a
    forged shape → null.
  - Task changes: equal fields dropped; `related` compared by kind and id; nothing changed → empty.
  - Tasks service, repository and queue doubled: create passes `workspaceId` and the caller; a missing
    member, client or deal → `RequestValidationError` on that field and no write; a past `remindAt`
    on create → 400, unchanged on edit → passes, changed → 400; a changed `remindAt` clears
    `reminderSentAt`; a pending reminder is scheduled after the write, one outside the window is
    not; a failed schedule is logged and the task still returned; delete and restore by a manager
    on another's task → `TaskDeleteForbiddenError` and no write; complete twice keeps the first
    `doneAt`; logs carry ids only.
  - Reminders service: the sweep schedules every reminder the repository returns; delivery: each
    skip reason writes nothing; a pending reminder sets
    `reminderSentAt` and inserts one notification for the current assignee with the snapshot.
  - BullMQ reminder queue: the job id, a delay of 0 for a past reminder, the options.
  - Recurring jobs: a tick adds each job with its deduplication id and period; a failed tick logs
    once until a tick succeeds; the timer stops on shutdown.
  - Queue connections: producer options as the probe's; worker options with
    `maxRetriesPerRequest: null` and no `commandTimeout`.
- **Integration, apps/api** (testcontainers Postgres and Valkey, supertest, two workspaces as in spec
  07, `resetDatabase` and a flushed Valkey before each test; `shouldRunJobs` only in the delivery,
  sweep, recurring jobs and purge tests)
  - Create → 201 matching `taskSchema`, each `related` kind with names; another workspace's member,
    client or deal, a deleted client, a deleted deal and a deal of a deleted client → 400 on that
    field and no row; `workspaceId` and `createdById` in the body ignored.
  - Get → 200; another workspace's task, a deleted task, a task of a deleted client, of a deleted
    deal and of a deal whose client is deleted → 404; restoring that client brings it back.
  - Edit: only sent fields change; stored values → 200 with `updated_at` unchanged; a new
    `remindAt` clears `reminder_sent_at`; another workspace's task → 404.
  - Complete and reopen: `done_at` set and cleared, both idempotent.
  - Delete and restore follow the client rules of spec 06.
  - Lists: open by due date with ids breaking ties, done by completion; `assignee=me` as owner and
    manager; `clientId` returns the client's and its deals' tasks, without a deleted deal's;
    `dealId`; a foreign `clientId` → empty; 60 tasks over three pages each once with the last
    `nextCursor` null; the same number of SQL statements for one task and for 25 with every link
    kind (Prisma query events).
  - Delivery: a task with `remind_at` two seconds ahead produces one notification for the assignee
    within ten seconds; the task's `reminder_sent_at` is set.
  - Exactly once: two adds of one job id leave one job; running delivery twice for one reminder
    gives one notification; a job for a changed `remind_at`, a done task, a deleted task, a hidden
    task, a reminder more than 24 h late and an assignee without membership give none.
  - Sweep: tasks inserted with pending reminders inside the window get jobs, ones outside it, sent,
    done or hidden do not; after a Valkey `FLUSHALL` a tick runs the sweep and the jobs are back.
  - Recurring jobs: with the workers stopped, two ticks within an hour leave one waiting sweep;
    with them running, a tick within the hour after a sweep finished adds none.
  - A write with `shouldRunJobs` off still leaves a delayed job in Valkey.
  - Session purge: expired sessions and their refresh tokens go, live ones stay.
  - Notifications: newest first with the cursor; only the caller's, another user's in the same
    workspace and another workspace's absent; unread count, capped at 100 for 101; read → 204 and
    idempotent, another user's → 404; read-all marks only those at or before `before`.
  - Without the access cookie every route → 401; writes with an untrusted origin → 403.
  - OpenAPI: the 12 new operations with their tags, the cookie scheme and 401; error responses
    reference `ApiProblem`; query parameters by name; `:id` operations have the path parameter.
  - Shutdown: after `app.close()` of an app with `shouldRunJobs` no Valkey client of the app is left
    in `CLIENT LIST` and no pg connection, the queue and worker connections included.
  - With `REDIS_URL` unreachable the app starts with jobs on, `/health/live` answers, a task create
    still returns 201 with the failed add logged, and `app.close()` finishes within the deadline.
  - Migrations: deploy and the drift check in global setup pass.
- **Unit, apps/web (node)**
  - Prefetch: the task list for `/tasks?assignee=anyone&status=done` fills the key the client hook
    builds for that URL; the task, the client's and the deal's tasks and the unread count fill
    their keys; a task 404 → no log line.
- **Unit and component, apps/web (jsdom, MSW)**
  - `local-date-time`: a date and time to an instant and back in a fixed zone (`TZ` set for the
    file), a gap time moved forward, a repeated time taking the first.
  - Reminder shortcuts: each computes its instant; a passed one is disabled; edit derives the
    shortcut from `dueAt − remindAt`, "Custom time" otherwise; changing the due time moves a
    shortcut reminder.
  - Task form: empty submit → errors and no request; create sends instants built from the local
    fields and `related` as the deal when one is chosen; a client from the URL and a deal from the
    URL fill the fields; assignee defaults to the caller; a 400 on `related.id` lands on Deal;
    edit sends changed fields only; 404 on edit → the alert; a new task due at a passed time
    saves with no reminder while the Reminder list was never opened, and its value stands once it
    was; server errors land on Reminder, Reminder date, Assignee and Client as section 5 says.
  - Tasks view (nuqs testing adapter): "Only mine" on by default and `assignee=anyone` turns it off;
    `status=done` shows done rows; the empty states and "Show everyone's tasks", which leaves focus
    on the toggle; "Load more" appends; the "Overdue" badge appears only after hydration and only on
    open tasks past due.
  - Completing: the row is struck through before the response and stays; the checkbox keeps focus;
    a failure reverts it with the toast, also to the confirmed done state when only the second of
    a double toggle fails; a 404 shows its toast and invalidates the detail.
  - Task page: details, the badge, "Mark as done", the not found state.
  - Delete: hidden for a manager on another's task; confirm → `DELETE`, route replaced, Undo
    restores after the page unmounted.
  - Bell: the count label and "99+"; polling stops when the user is idle and resumes on input
    (fake timers); a rising count shows one toast, a first count none; following an entry sends
    `read` and navigates; "Mark all as read" sends the newest entry's `createdAt` as `before`.
  - Sections on the client card and the deal page: rows, the empty state, the "New task" link.
  - Deleting or restoring a client or a deal, and editing one, invalidates the task queries.
  - Task form Deal select: lists the linked deal when the client's 50 newest lack it; choosing
    another client resets it; its loading and error states; Cancel goes where section 2 says.
  - Main nav: `aria-current` on `/tasks` and `/tasks/<id>`.
  - The default MSW handlers gain `GET /api/notifications/unread-count` with `{ count: 0 }`: the
    shell requests it on every page.
- **e2e**: none (spec 12).
- **Tooling checks**, done once on throwaway changes that are not committed; each must fail:
  - `entities/task` importing `@/entities/client` (lint);
  - `features/task-form` importing `@/features/deal-form` (lint).

## 7. Acceptance criteria

- [ ] `pnpm db:migrate` applies `tasks` locally; `\d tasks` and `\d notifications` in `psql` show the
      indexes and foreign keys of section 3.
- [ ] With 2 000 tasks generated in one workspace through `psql` and `ANALYZE` run, `EXPLAIN ANALYZE`
      of the open list, the "Only mine" list and the sweep, taken from the Prisma debug log, use the
      indexes of section 3, and each answers within 100 ms locally. The SQL and the plans go into
      the PR description.
- [ ] In the browser: create a task from the list, one from a client card and one from a deal page;
      set a custom reminder two minutes ahead; within a minute of its time the toast shows and the
      bell counts it; following it opens the task and clears the count; complete a task and reopen
      it; edit the due time with a shortcut and see the reminder follow; delete; undo.
- [ ] Restart Valkey (`docker compose restart valkey`) with a reminder five minutes ahead: it still
      arrives, at most five minutes late, and only once.
- [ ] Stop the API with a reminder ten minutes ahead and start it again after its time: it arrives
      once, on startup.
- [ ] Filters live in the URL: a copied link opens the same list, reload and Back keep it.
- [ ] On a 390 px phone the header shows two rows with the bell on the first and the navigation on
      the second; at 360 px no page scrolls sideways.
- [ ] A reload of `/tasks` and of a task page within 15 minutes of logging in: the server HTML
      contains the data and the badge, and the browser does not request them again after
      hydration.
- [ ] With the tab hidden, and after 15 minutes without input, the API log shows no
      `unread-count` requests.
- [ ] `browser-verify` over the screens of section 5 at both sizes and in both themes: no failed
      requests except the expected 401 before a refresh and the 404 of a not found task; no console
      errors; no hydration warnings.
- [ ] Keyboard only: create a task with a custom reminder, complete it from the list, open the bell,
      follow a notification, mark all as read, delete through the dialog, undo; focus always
      visible.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; the `image` smoke test
      applies the new migration in the container.
- [ ] Every tooling check from section 6 fails as described.
- [ ] `bullmq` is the latest stable version, exact-pinned; `checkbox` comes from the CLI run of
      section 2; clean install has no engine, peer dependency or ignored build script warnings.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] One migration, `tasks`, in the PR with the code that uses it.
- [ ] After the merge, the `main` run deploys by itself; the Render log shows the migration applied
      on Neon and the workers started; on the live URL a reminder set two minutes ahead reaches the
      bell; `browser-verify` against the live URL over the screens of section 5 passes.
- [ ] A day after the deploy: Render's memory graph for the API stays under 450 MB, and Neon's
      monitoring shows compute suspended between the hourly sweeps while nobody uses the demo. If
      either fails, the owner decides on spec 14 (plan section 12).
- [ ] `docs/deployment.md` names the queue connections, the Neon and Netlify budgets of section 2
      and the memory check; ADR 0012 is written.
- [ ] A week after the deploy, Netlify's usage page shows function invocations on pace to stay well
      under 125k for the month.
- [ ] This spec is part of the PR.
