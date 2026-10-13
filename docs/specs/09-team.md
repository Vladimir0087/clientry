# 09 — Team

Status: approved

## 1. Goal

An owner brings people into the workspace with one-time invite links, sees the team, changes roles,
removes members while handing their open deals and tasks to someone else, and renames the
workspace; an invited person joins with a new account or an existing one; clients, the board and
tasks filter by any member; and who may do what is one permission matrix that the API guard and the
web read alike.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/schema.prisma                      # Invite
  prisma/migrations/<timestamp>_invites/
  src/
    app.module.ts                           # PermissionsGuard replaces RolesGuard
    common/
      auth/require-permission.decorator.ts  # replaces roles.decorator.ts
      crypto/opaque-token.ts                # generate and hash, moved from modules/auth/refresh-token.ts
      http/no-store.middleware.ts           # shared by the auth and invites controllers
    infra/prisma/
      pending-invite.ts                     # the one "pending" rule, for joining, listing, revoking
      retry-on-write-conflict.ts            # reruns the removal's transaction after a deadlock
    modules/
      auth/
        auth.controller.ts                  # invite preview, register and login by invite
        auth.service.ts
        permissions.guard.ts                # replaces roles.guard.ts
        accounts.repository.ts              # invite claim inside the account transaction
        prisma-accounts.repository.ts
        errors.ts                           # InviteInvalidError, AlreadyInWorkspaceError
        session-revocation.repository.ts    # exported: revokes a user's sessions in a given tx
        auth.module.ts                      # exports SessionRevocation, PermissionsGuard
      workspaces/                           # from spec 07, which serves GET /api/members
        members.controller.ts, members.service.ts         # role change, removal
        members.repository.ts               # gains the unit of work under the workspace lock
        prisma-members.repository.ts, prisma-locked-members.repository.ts
        invites.controller.ts, invites.service.ts
        invites.repository.ts, prisma-invites.repository.ts, prisma-locked-invites.repository.ts
        workspace.controller.ts, workspace.service.ts     # rename
        workspace.repository.ts, prisma-workspace.repository.ts, prisma-locked-workspace.repository.ts
        caller-role.repository.ts           # the caller's role re-read inside the lock
        caller-permission.ts                # 403 when that role lacks the permission
        workspaces.module.ts                # imports the auth, deals and tasks modules
        errors.ts
      deals/
        stages.controller.ts                # stage writes on stages.manage
        deal-handover.repository.ts         # exported: hands open deals over in a given tx
        deals.module.ts                     # exports DealHandover
        deals.controller.ts, …              # board: assignee accepts a member id
      tasks/
        task-handover.repository.ts         # exported: locks and hands open tasks over in a given tx
        tasks.module.ts                     # exports TaskHandover
        tasks.controller.ts, …              # list: assignee accepts a member id
      clients/                              # createdBy accepts a member id
  test/
    fixtures/accounts.ts                    # members join through invites
    fixtures/invites.ts
    support/protected-test.controller.ts    # @RequirePermission
apps/web/src/
  proxy.ts                                  # /join renders in every session state
  shared/lib/redirect-target.ts             # public paths next to auth paths
  shared/lib/role-label.ts                  # moved from entities/session
  app/
    (auth)/join/page.tsx
    (app)/
      _components/main-nav.tsx              # Team link
      team/page.tsx, team/loading.tsx
      team/_components/team-view.tsx        # composes the sections and row actions
      _lib/prefetch.ts                      # members with a member filter in the URL
      _lib/task-section-filters.ts          # assignee: null instead of isMine: false
      deals/_components/board-view.tsx      # stage settings link through hasPermission
      clients/page.tsx, deals/page.tsx, tasks/page.tsx    # prefetch members for a member id
  features/
    auth/                                   # join form and invite preview; NO_WORKSPACE message
    team-invites/                           # invite dialog, pending list, revoke dialog
    manage-member/                          # role change, removal with handover
    rename-workspace/
    client-filters/                         # "Added by" menu replaces "Only mine"
    deal-filters/                           # "Assignee" menu replaces "Only mine"
    task-filters/                           # "Assignee" menu replaces "Only mine"
    manage-stages/                          # owner check through hasPermission
  entities/
    member/                                 # from spec 07; gains role change, removal, member
                                            # list, the member filter menu and its URL parsers
    invite/                                 # keys, list, create and revoke calls, useInvites
    client/, deal/, task/                   # filter types: createdBy and assignee
packages/shared/src/
  auth/permissions.ts                       # the matrix, hasPermission, canDeleteRecord
  auth/invite.ts                            # token, preview and join schemas
  workspaces/                               # from spec 07 (member list); gains the rest
  clients/, deals/, tasks/                  # createdBy and assignee: me or a member id
docs/adr/0013-team-access.md
```

**Permission matrix**

`@clientry/shared/auth` exports the role table of plan section 6 as data:

| Permission           | owner | manager | Guards                                                        |
| -------------------- | ----- | ------- | ------------------------------------------------------------- |
| `team.manage`        | yes   | no      | invites: create, list, revoke; member role change and removal |
| `workspace.manage`   | yes   | no      | workspace rename                                              |
| `stages.manage`      | yes   | no      | stage settings (spec 07)                                      |
| `records.delete_any` | yes   | no      | deleting and restoring another member's clients, deals, tasks |

- `hasPermission(role, permission)` reads the table. `canDeleteRecord` keeps its signature and
  behaviour and becomes `hasPermission(role, 'records.delete_any')` or the caller's own record.
- `@RequirePermission(permission)` on a handler or a controller replaces `@Roles`, and
  `PermissionsGuard` replaces `RolesGuard` in the same place of the global guard order. A route
  without it is open to every member; a caller whose role lacks the permission gets 403
  `INSUFFICIENT_ROLE`, the code clients already handle. Routes say what they do and the matrix says
  who may: moving a permission between roles is one line in one file, and the web cannot drift from
  the API.
- `@Roles` and `RolesGuard` are removed, so a route has one way to be restricted. Their one user,
  the `OwnerOnly` helper of the stage writes (spec 07), applies `@RequirePermission('stages.manage')`
  instead of `@Roles('owner')`; the test-only controller uses
  `@RequirePermission('workspace.manage')`. Spec 08 restricts no route by role.
- `@RequirePermission` is metadata only, like `@Roles`, and lives in `common/auth`. It also marks
  the operation with the OpenAPI extension `x-permission: <permission>`. Swagger keeps
  one response per status, so a restricted handler documents its 403 in one `ApiErrorResponse`
  with every code that applies (`UNTRUSTED_ORIGIN` on unsafe methods, and `INSUFFICIENT_ROLE`), as
  `OwnerOnly` does now: a second 403 decorator would replace the first. A controller may keep a
  local helper for the pair. The OpenAPI test finds restricted operations by `x-permission` and
  checks that none leaves `INSUFFICIENT_ROLE` out.
- Rules that depend on the record ("own or someone else's") stay in services, as in spec 06.
- The web hides controls with the same `hasPermission` and the role from `useSession()`; the API
  decides. The role checks of spec 07 (the "Edit stages" link in `deals/_components/board-view.tsx`,
  the owner controls and the "Only owners can change stages." line in `features/manage-stages`)
  become `hasPermission(role, 'stages.manage')`. No page is gated by role in the proxy: the team
  page is open to every member.
- Code comments that name `@Roles` or "the role guard" (the clients, deals, tasks and stages
  controllers) are updated to the permission guard.

**Invites**

- Every invite joins as a manager. A leaked link then gives a manager's access, never the team: an
  owner can remove other owners, so an owner link would be a takeover. An owner is made by promoting
  a member the owners know.
- The token is 32 random bytes, base64url, 43 characters; only its SHA-256 hash is stored, as with
  refresh tokens, so the database never holds a usable link. The generate and hash helpers move from `modules/auth/refresh-token.ts`
  to `common/crypto/opaque-token.ts` and serve both.
- The token is returned once, in the create response. The list never contains it, and it cannot be
  shown again: a lost link is revoked and replaced.
- An invite lives 7 days and works once. Lifetime and limit are constants in `INVITE_LIMITS`.
- At most 20 pending invites per workspace; the 21st → 409 `INVITE_LIMIT_REACHED`. This bounds what
  one owner account can create, and the demo account will be public (spec 11).
- "Pending" means not used, not revoked and `expires_at` in the future. The list shows pending
  invites only, newest first: id, creator, created and expiry dates. Used, revoked and expired
  invites stay in the table as a record and are not listed.
- Revoke (`DELETE /api/invites/:id`) sets `revoked_at`; the link stops working at once. An invite
  that is not pending, or belongs to another workspace → 404 `INVITE_NOT_FOUND`.
- Creating takes the workspace lock (see Members), so the limit holds under concurrent requests.
- Every response of the invites controller carries `Cache-Control: no-store`, through the same
  middleware the auth controller uses: the create response holds a live token.

**Joining by invite**

- The link is `<web origin>/join#<token>`. The token travels in the fragment, which browsers never
  send to a server: it stays out of Netlify's and Render's request logs, the API request log and the
  `Referer` header. The page reads it in the browser and sends it only in request bodies.
- Three public routes in the auth controller, next to register and login, so every route that
  starts a session shares the cookie code, `Cache-Control: no-store`, rate limiting and the refresh
  cookie's path:
  - `POST /api/auth/invite/preview` `{ token }` → workspace name, inviter's name and expiry. A
    read sent as `POST` so the token stays out of URLs; it changes nothing.
  - `POST /api/auth/invite/register` `{ token, name, email, password }` → a new account with a
    manager membership, a session, 201.
  - `POST /api/auth/invite/login` `{ token, email, password }` → for an account without a
    membership, that is a removed member invited again: a manager membership, a session, 200.
- An invite that is not pending, an unknown token included, answers 404 `INVITE_INVALID`, one body
  for every cause: the person's next step is the same, ask for a new link. A malformed token answers
  400 on `token`.
- Register by invite: the password is hashed before the transaction, as on registration. One
  transaction claims the invite with a conditional update (`used_at IS NULL`, `revoked_at IS NULL`,
  `expires_at > now`), creates the user and the membership and records `used_by_id`. No row claimed
  → `INVITE_INVALID`; a taken email → 409 `EMAIL_TAKEN`, and the rollback leaves the invite usable.
  Two people using one link at once: the claim lets one through, the other gets 404.
- Login by invite: an invite that is not pending answers 404 `INVITE_INVALID` before the credentials
  are read, so the route checks no password without a live link and is no second login endpoint
  for guessing; whether a link is live is already public through the preview. Then credentials are
  checked exactly as on login (the dummy hash for an unknown email, one `INVALID_CREDENTIALS` for
  both causes). An account that already has a membership then gets 409
  `ALREADY_IN_WORKSPACE` and the invite is not touched: one workspace per account in v1. Otherwise
  one transaction claims the invite and inserts the membership; the unique `user_id` of memberships
  turns a concurrent second join into the same 409. Ended sessions are deleted as on login.
- The browser's previous account is signed out: after a successful join, the session of the
  presented refresh cookie, if any, is revoked as on logout, and the response sets the new cookies.
  The refresh cookie's path `/api/auth` covers these routes. A failed join leaves it alone.
- The claim lives in the accounts repository: creating the account is the auth module's job, and
  the claim must commit or roll back with it. This is the one place outside the workspaces module
  that writes `invites`, and, like the rest of the accounts repository, it is not scoped by
  `workspaceId`: the workspace comes from the invite.

**Members**

- `GET /api/members` (spec 07) stays as it is: the workspace's members in join order, the user id
  as `id`, name, email, role, `joinedAt`, readable by every member. The deal and task assignee
  selects use it. No pagination: a team is a handful of people.
- Role change (`PATCH /api/members/:id` with `{ role }`) and removal
  (`DELETE /api/members/:id?transferTo=<id>`, see Handover) need `team.manage`. `:id` is the user
  id. A user who is not a member of the caller's workspace → 404 `MEMBER_NOT_FOUND`.
- A workspace always has at least one owner: demoting or removing the last owner → 409
  `LAST_OWNER`. Several owners are allowed; an owner may demote or remove themselves while another
  owner remains, which is how ownership is handed over.
- Both run in a transaction that first takes the workspace lock of spec 07 (`lockWorkspace` in
  `infra/prisma/workspace-lock.ts`, `FOR NO KEY UPDATE`), then reads the target and counts owners.
  Two owners demoting each other at once are serialized: the second re-reads its own role, now
  manager, and gets 403 (see below); without the lock both would count two and leave the workspace
  with none. Creating and revoking an invite and renaming the workspace take the same lock.
- Inside the lock every one of these writes first re-reads the caller's own role. The guard read it
  before the lock, so an owner demoted or removed by another owner while their request waited
  would otherwise act with the old role, for example create a live invite after their pending ones
  were revoked. A role that no longer grants the permission → 403 `INSUFFICIENT_ROLE`, nothing
  written.
- Order of answers inside the transaction: 403 for the caller's role, 404 `MEMBER_NOT_FOUND` for
  the target, 400 on `transferTo`, 409 `LAST_OWNER`.
- Deal and task writes read the assignee's membership `FOR SHARE` (specs 07, 08), and so does
  reminder delivery. Deleting the membership waits for such a write to commit; a write that comes
  after the removal answers 400 "Choose a member", and a reminder for the removed member is
  skipped as `not_member`.
- The rules live in the services; the repository gives them a unit of work:
  `inWorkspaceLock(workspaceId, work)` opens the transaction, takes the lock and passes `work` a
  repository bound to it. Services stay testable without a database.
- Setting the role a member already has → 200 with the member unchanged, no write.
- A role change applies on the member's next request, since the API reads the role per request
  (spec 03); their next refresh signs the new role into the access token.
- Demoting an owner revokes the pending invites they created, in the same transaction after the
  update: creating invites needs `team.manage`, and the links would otherwise outlive it. Promoting
  revokes nothing.
- Removal deletes the membership and, in the same transaction, revokes the user's sessions and the
  pending invites they created. Spec 03 locks a removed member out without revoking sessions, but a
  session left on some device would come back to life if the person were invited again. Pending
  invites go with their creator: they were that owner's decision.
- A new session reads the user's membership `FOR SHARE` in the transaction that inserts it, and
  none is created without one (`NO_WORKSPACE`). A login that read the account just before a removal
  then either sees the member gone, or its session commits first and the removal revokes it with
  the rest.
- The user row stays: clients, deals and tasks they created or were assigned, history entries and
  notifications keep pointing at it and keep their name (the foreign keys restrict deleting users).
  The person can still log in only to see `NO_WORKSPACE`, and can come back through a new invite
  with "Log in to join".

**Handover on removal**

- Deals and tasks always have an assignee (specs 07, 08), so a removed member's open work cannot be
  left without one, and left on them it would stall: their reminders are skipped and nobody sees
  their cards as their own. The owner chooses who takes it over when removing.
- `transferTo` is required: a current member of the workspace other than the one being removed.
  Anything else → 400 `VALIDATION_FAILED` on `transferTo` "Choose another member", one message for
  every cause. A missing value or one that is not a UUID fails the query schema; a non-member,
  another workspace's user and the removed member fail the check inside the locked transaction, so
  the receiver cannot be removed meanwhile. Required even when the member has no open work, as
  `moveDealsTo` is on stage deletion (spec 07); the web always sends it.
- What moves: every deal assigned to them with `closed_at IS NULL` and every task assigned to them
  with `done_at IS NULL`, deleted and hidden ones included, so a deal or a task brought back by
  Undo or by restoring its client does not return to a non-member. Closed deals and completed tasks
  stay theirs as history.
- Reopening is open work again, so it must not land on a non-member: moving a closed deal to an
  open stage and reopening a done task read the assignee's membership `FOR SHARE` (for deals before
  the deal write, for tasks after the task row lock, the orders above). A non-member → 400
  `VALIDATION_FAILED` on `assigneeId` "Choose a member", nothing written; the assignee is changed
  in the edit form first. A reopen racing a removal either fails that check or commits first and is
  handed over.
- Each handed deal gets version + 1, a new `updated_at` (raw SQL sets it itself, as the stage
  deletion of spec 07 does) and one `deal_updated` entry with the `assignee` change
  (`{ id, name }` of both, as snapshots), its actor the owner who removes. An edit or a move sent
  with the old version then answers 409 `DEAL_CHANGED` and the web shows the newer deal, as for any
  concurrent change (spec 07).
- Tasks have no version and no history (spec 08); the raw update sets `updated_at = now()` itself,
  since Prisma's `@updatedAt` does not apply to raw SQL. A pending reminder goes to the new
  assignee at its time: delivery reads the assignee when it runs, and the job id does not depend on
  it, so nothing is re-queued.
- One transaction, in this order: the workspace lock; the caller's role re-read; the target and
  `transferTo` checked, owners counted; the member's open tasks locked (`FOR NO KEY UPDATE`); the
  membership deleted (it waits for deal and task writes that read it `FOR SHARE`); deals handed
  over; tasks handed over; sessions and the member's pending invites revoked.
- The order follows the lock order of the code it meets:
  - task edits and reminder delivery lock the task row first and read the membership after it
    (spec 08), so the member's tasks are locked before the membership is deleted;
  - task creates and edits read the membership and then the linked deal `FOR SHARE`, and deal
    writes read the membership before they write the deal row, so the member's deals are not locked
    before the membership: their hand-over `UPDATE` takes the row locks after the delete.
- One cycle remains: a task assigned to the member after their tasks were locked is locked by the
  hand-over after the delete, and a reminder delivery holding it waits for the membership. Postgres
  fails one side; delivery is retried by its queue, and the removal runs its transaction once more
  on a write conflict (`P2034` from Prisma's model queries, `P2010` with the adapter's
  `TransactionWriteConflict` from raw ones).
- The hand-over statements run after the delete, each with a fresh snapshot, so they also take
  records assigned to the member by a write that read the membership before the delete and
  committed first. A write that comes after the delete fails its membership check.
- Tables keep their writers, through each module's exported providers rather than deep imports:
  the deals module exports `DealHandover`, the tasks module `TaskHandover`, the auth module
  `SessionRevocation`. Each is a stateless provider whose methods take the transaction client they
  run in, the way spec 07's locked repositories are built on one. `WorkspacesModule` imports the
  three modules, and its Prisma members repository calls them inside the locked unit of work, so the
  service never sees Prisma and the workspaces module never writes `deals`, `activities`, `tasks` or
  `sessions` itself.
- The statement count does not depend on the number of records: one locking `SELECT` for tasks, one
  `UPDATE … RETURNING` each for deals and tasks, one `createMany` of history entries for deals.

**Workspace**

- `PATCH /api/workspace` with `{ name }` renames the caller's workspace, needs `workspace.manage`,
  → 200 `{ id, name }`. The name follows the `workspaceName` rule of registration, now one schema
  for both. The path has no id: the workspace is always the caller's.

**Tenancy**

- Member, invite and workspace routes take `workspaceId` only from `AuthUser`, as the first argument
  of every repository method; ids in paths are looked up inside that workspace, so another
  workspace's member or invite answers 404 like a missing one.
- The three join routes are the documented exception above: the workspace comes from the claimed
  invite.
- Member filters (`createdBy`, `assignee`) filter inside the caller's workspace; another
  workspace's user id matches nothing.

**Filters by member**

Specs 06, 07 and 08 left "filter by a member" to this spec. One rule and one menu serve all three
screens:

| Screen  | API param                            | Page param  | Default                    | Menu label |
| ------- | ------------------------------------ | ----------- | -------------------------- | ---------- |
| Clients | `createdBy` on `GET /api/clients`    | `createdBy` | anyone                     | Added by   |
| Board   | `assignee` on `GET /api/deals/board` | `assignee`  | anyone                     | Assignee   |
| Tasks   | `assignee` on `GET /api/tasks`       | `assignee`  | me (spec 08's "Only mine") | Assignee   |

- API: each param accepts `me` or a member id (`memberFilterSchema` in `@clientry/shared/workspaces`:
  `me` or `idSchema`); left out, it filters nothing. The services map `me` to the caller. An id
  that is not a member matches what it matches: a former member's records stay findable.
- Pages: the param holds `me` or a member id, and on tasks also `anyone`, since there the default is
  me. Defaults are left out of the URL. The "Only mine" toggles and the `mine` params of clients and
  the board are gone; links stay internal until launch, so nothing is kept for compatibility.
  Parsing drops any other value, so a hand-edited URL filters less rather than failing.
- Menu (`entities/member`, one component for the three toolbars): radio items "Anyone", "Me", then
  the other members by name; a checked "Former member" item when the URL holds an id that is not a
  current member. The trigger reads the label and the choice: "Assignee: Me", "Added by: Max".
- Members load when the menu first opens. When the URL holds a member id the page prefetches the
  members on the server with its list (`prefetchMembers` of spec 07), so the trigger shows the name
  with no request after hydration. If they are not loaded yet, the trigger shows the label alone.
- The board and tasks also need the name for their empty states, so with a member id in the URL
  and no members in the cache (the server prefetch failed) they request the members on mount.
  Until the members load, or if they fail, the empty state uses the former member's text, which
  names nobody.
- The caller's own id in the URL checks "Me": a link a colleague shares means the same records.
- Web filter types follow: `ClientFilters.isMine` becomes `createdBy`, `BoardFilters.isMine` and
  `TaskFilters.isMine` become `assignee`, each `'me'`, a member id or `null` for anyone; query keys
  and API paths are built from them. The task sections of the client card and the deal page
  (`(app)/_lib/task-section-filters.ts`) pass `assignee: null`, as they passed `isMine: false`.
- "Clear filters" on clients resets "Added by" to anyone, and `hasActiveFilters` counts it, as it
  did "Only mine".

**Logging**

- `info`, each line with workspace id and acting user id: invite created (invite id), invite
  revoked (invite id), invite accepted (invite id, new or returning user id, mode `register` or
  `login`), role changed (member id, old and new role), member removed (member id, `transferTo`,
  numbers of deals and tasks handed over and of sessions revoked), workspace renamed.
- `warn` when a role change or a removal runs its transaction once more after a write conflict
  (operation and workspace id), so how often the removal loses a deadlock shows in the log.
- Tokens, token hashes, names, emails and workspace names never reach a log line. Request bodies are
  not logged (spec 02).

**Errors**

`modules/workspaces/errors.ts`:

| Class                     | Kind     | Code                   | Detail                                          |
| ------------------------- | -------- | ---------------------- | ----------------------------------------------- |
| `MemberNotFoundError`     | NotFound | `MEMBER_NOT_FOUND`     | Member not found                                |
| `LastOwnerError`          | Conflict | `LAST_OWNER`           | A workspace needs at least one owner            |
| `InviteNotFoundError`     | NotFound | `INVITE_NOT_FOUND`     | Invite not found                                |
| `InviteLimitReachedError` | Conflict | `INVITE_LIMIT_REACHED` | A workspace can have at most 20 pending invites |

`modules/auth/errors.ts` adds:

| Class                     | Kind     | Code                   | Detail                                      |
| ------------------------- | -------- | ---------------------- | ------------------------------------------- |
| `InviteInvalidError`      | NotFound | `INVITE_INVALID`       | This invite link is invalid or has expired  |
| `AlreadyInWorkspaceError` | Conflict | `ALREADY_IN_WORKSPACE` | This account already belongs to a workspace |

- Two invite errors on purpose: an owner revoking an invite that is no longer pending and a visitor
  holding a dead link are different situations with different messages.
- A malformed `:id` answers 400 `VALIDATION_FAILED` on `id` before any query, with the params
  validated as one object, as in spec 06.

**Rate limiting**

| Route             | Limit       |
| ----------------- | ----------- |
| `invite/preview`  | 30 per min  |
| `invite/register` | 10 per hour |
| `invite/login`    | 10 per min  |

- The same as `refresh`, `register` and `login`. Owner routes are not limited: they need a session,
  and the pending cap bounds invites.

**Swagger**

- Tags `workspace`, `members`, `invites`, each operation with the cookie scheme, 401 declared once
  per controller and error responses with examples built from the domain errors. Every operation
  behind a permission documents 403 `INSUFFICIENT_ROLE`.
- The three join operations sit under `auth` with `security: []`.

**Test harness**

- `addManager(testApp, workspaceId)` keeps its signature, so its twenty-odd callers in the suites of
  specs 03–08 stay as they are. Instead of inserting the user and the membership (spec 03 kept that
  "until invites exist"), it inserts a pending invite for the workspace directly, created by the
  workspace's first owner, with the hash of a token it generated, then joins through
  `POST /api/auth/invite/register` and returns the agent.
- `test/fixtures/invites.ts`: `createInvite(owner)` through the API, returning the id and the token;
  `expireInvite(testApp, id)` and `markInviteUsed(testApp, id)` for the states the tests need.

**Shared contracts**

- `@clientry/shared/auth` adds `inviteTokenSchema` (43 base64url characters, message "Invalid invite
  link"), `invitePreviewRequestSchema`, `invitePreviewResponseSchema`,
  `inviteRegisterRequestSchema`, `inviteLoginRequestSchema` (the field rules and messages of
  register and login plus `token`), `PERMISSIONS`, `Permission`, `hasPermission`, and inferred
  types.
- `@clientry/shared/workspaces` (spec 07: `memberSchema`, `memberListResponseSchema`) gains
  `memberIdParamsSchema` and `inviteIdParamsSchema` (on `idSchema` of `@clientry/shared/common`),
  `updateMemberRequestSchema`, `inviteSummarySchema`, `inviteListResponseSchema` (`{ items }`),
  `createdInviteResponseSchema` (the summary plus `token`), `removeMemberQuerySchema`
  (`{ transferTo }`, message "Choose another member"), `memberFilterSchema`,
  `renameWorkspaceRequestSchema` (also the form schema), `workspaceResponseSchema`,
  `INVITE_LIMITS`, and inferred types.
- `clientListQuerySchema.createdBy`, `boardQuerySchema.assignee` and `taskListQuerySchema.assignee`
  become `memberFilterSchema`. They keep no `.meta({ id })`, so Swagger still lists them as query
  parameters (spec 06).
- Dates are ISO strings, as in spec 06.

**Web: join page**

- `/join` renders in every session state: the proxy neither redirects an `anonymous` visitor to
  `/login` nor an `authenticated` one away. `redirect-target.ts` gains a set of public paths next
  to the auth paths, and `/join` is never a `next` target.
- `(auth)/join/page.tsx` is a server component inside the auth card layout. It checks the access
  cookie with `verifyAccessToken` and passes one boolean, "the browser holds a session", to the
  form: true for `authenticated` and for `expired`, whose refresh cookie is likely still live and
  will be revoked by the join; false for `anonymous`. The page never requests `/api/auth/me`: for an anonymous visitor that is a 401, a failed
  refresh and a redirect to `/login`, which would drop the fragment.
- The browser reads the token from `location.hash` after mount, checks it with `inviteTokenSchema`,
  then requests the preview as a query. The fragment stays in the address bar, so a reload works.
- The join form lives in `features/auth`, next to register and login, and reuses their fields, 429
  messages and `useEnterSession`: success clears the query cache, writes the session and replaces
  the route with `/`.

**Web: team page**

- `/team` is open to every member. The server prefetches members through `(app)/_lib/prefetch.ts`,
  as the deal pages do. Invites load in the browser, only when the session grants `team.manage`.
- `entities/member` (spec 07: `memberKeys`, the list call, `useMembers`) gains the change role and
  remove calls, an `enabled` option on `useMembers`, the member table and cards with an actions
  slot that the app layer fills with `features/manage-member`, and the member filter menu. Entities
  cannot import `entities/session`, so the table (for "You") and the menu (for "Me" and the other
  members) take a `currentUserId` prop from their caller.
- `entities/invite`: `inviteKeys`, the list, create and revoke calls, `useInvites({ enabled })`. An
  entity, not part of the invites feature, because the removal in `features/manage-member` must
  invalidate invites and features cannot import each other.
- `roleLabel` moves from `entities/session` to `shared/lib/role-label.ts`: `entities/member` needs
  it too, and entities cannot import each other.
- `features/team-invites`: the invite dialog, the pending list and the revoke dialog, on
  `entities/invite`. The link is built in the browser as `${location.origin}/join#${token}`.
- `features/manage-member`: the row menu, the demotion dialog, and the removal dialog with the
  handover select.
- `features/rename-workspace`: the inline form with `renameWorkspaceRequestSchema`.
- `features/client-filters`, `deal-filters`, `task-filters`: the member menu replaces the "Only
  mine" toggle, with `currentUserId` from `useSession()`. Their parsers take the member value from
  `entities/member`, from a module that imports `nuqs/server` so the server loaders use it too: one
  parser of `me` or a member id for clients and the board, and one that also accepts `anyone` for
  tasks.
- Cache: a rename writes the new name into the session cache, so the header changes at once; a role
  change or removal invalidates members, and one of the caller's own role invalidates the session;
  create and revoke invalidate invites; a demotion and a removal also invalidate invites (the
  member's ones are revoked), and a removal every deal and task query (assignees changed).
- A 403 `INSUFFICIENT_ROLE` on any team action (the role changed in another tab or by another owner)
  shows a toast and refetches the session, so the controls follow the real role.

**UI kit**

- Nothing new: `dialog`, `alert-dialog`, `table`, `badge`, `dropdown-menu` and `empty` are already
  in `shared/ui`, so this spec runs no shadcn CLI and adds no dependency.

**Architecture decision record**

- `0013-team-access.md`: one-time invite links with hashed tokens over email invites (needs a mail
  provider, v2) and over stored tokens that can be shown again (a database leak would hand out
  working links); invites that always join as a manager over a role on the invite (a leaked owner
  link would hand over the team); the token in the URL fragment over a path or query parameter
  (request logs, `Referer`); a permission matrix in `packages/shared` read by
  the guard and the web over role lists on routes; the last-owner rule under a workspace row lock
  over an unlocked check (two owners demoting each other) and over a database trigger (rules move
  out of the service and its tests); handing a removed member's open deals and tasks to a member the
  owner picks, in the removal's transaction, over leaving them on the removed member (stalled work,
  skipped reminders) and over moving them to the remover without asking. Consequences: a lost link
  is replaced, not re-sent; ADR 0005's `@Roles` is superseded by `@RequirePermission`, and so is
  its remark that removing a member needs no session revocation (removal now revokes them); the
  workspaces module reaches deals, tasks and sessions only through the providers those modules
  export.

### Out of scope

- Invites by email, binding an invite to an address (v2 with email).
- Several workspaces per account, a switcher, joining a second workspace while a member (v2).
- Deleting the workspace (v2, with several workspaces per account): v1 has no way to give an
  existing account a new workspace, so every member would be left with an account that cannot log
  in.
- A manager leaving the workspace on their own; transferring ownership as one action (promote, then
  demote yourself).
- Handing over closed deals and completed tasks, a different receiver per record, bulk reassignment
  outside removal.
- Filters by several members at once, by role, or by member on other screens.
- Editing one's own name or email, password change, avatars.
- Showing an invite link again, inviting straight into the owner role, editing an invite's expiry,
  a custom expiry.
- A purge of used, revoked and expired invites.
- Searching or paging members.
- Activity entries for team events (spec 10 decides).
- What the demo account may do on the team page (spec 11 decides).
- More roles or custom roles.

## 3. Data model

One migration, `invites`, through `pnpm db:migrate`, without hand edits.

| Table     | Columns                                                                                                                             | Constraints and indexes                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invites` | `id`, `workspace_id`, `created_by_id`, `token_hash` (`bytea`), `expires_at`, `used_at?`, `used_by_id?`, `revoked_at?`, `created_at` | unique `token_hash`; index `(workspace_id, created_at)`; index `created_by_id`; index `used_by_id`; cascade from workspaces; restrict from users |

- No `role` column, a refinement of the plan's starting model: every invite joins as a manager.
- Lookups by token go through the unique hash.
- `(workspace_id, created_at)` serves the newest-first pending list and the pending count; the
  pending conditions then filter a handful of rows.
- `created_by_id` and `used_by_id` restrict user deletion, like `clients.created_by_id`; users are
  never deleted in v1.
- No `updated_at`: the only changes are `used_at` and `revoked_at`, as `sessions` has `revoked_at`.
- `memberships` is unchanged: its `created_at` is the join date.

## 4. API

| Method | Path                        | Auth               | Request                        | Success                                   | Errors                                                                                                           |
| ------ | --------------------------- | ------------------ | ------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/invite/preview`  | public             | `invitePreviewRequestSchema`   | 200 `invitePreviewResponseSchema`         | 400, 403 `UNTRUSTED_ORIGIN`, 404 `INVITE_INVALID`, 429                                                           |
| POST   | `/api/auth/invite/register` | public             | `inviteRegisterRequestSchema`  | 201 `sessionResponseSchema`, both cookies | 400, 403 `UNTRUSTED_ORIGIN`, 404 `INVITE_INVALID`, 409 `EMAIL_TAKEN`, 429                                        |
| POST   | `/api/auth/invite/login`    | public             | `inviteLoginRequestSchema`     | 200 `sessionResponseSchema`, both cookies | 400, 401 `INVALID_CREDENTIALS`, 403 `UNTRUSTED_ORIGIN`, 404 `INVITE_INVALID`, 409 `ALREADY_IN_WORKSPACE`, 429    |
| GET    | `/api/members`              | member             | —                              | 200 `memberListResponseSchema`            | —                                                                                                                |
| PATCH  | `/api/members/:id`          | `team.manage`      | `updateMemberRequestSchema`    | 200 `memberSchema`                        | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404 `MEMBER_NOT_FOUND`, 409 `LAST_OWNER`                      |
| DELETE | `/api/members/:id`          | `team.manage`      | `removeMemberQuerySchema`      | 204                                       | 400 (`id`, `transferTo`), 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404 `MEMBER_NOT_FOUND`, 409 `LAST_OWNER` |
| GET    | `/api/invites`              | `team.manage`      | —                              | 200 `inviteListResponseSchema`            | 403 `INSUFFICIENT_ROLE`                                                                                          |
| POST   | `/api/invites`              | `team.manage`      | —                              | 201 `createdInviteResponseSchema`         | 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 409 `INVITE_LIMIT_REACHED`                                         |
| DELETE | `/api/invites/:id`          | `team.manage`      | —                              | 204                                       | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404 `INVITE_NOT_FOUND`                                        |
| PATCH  | `/api/workspace`            | `workspace.manage` | `renameWorkspaceRequestSchema` | 200 `workspaceResponseSchema`             | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`                                                                |

Every route except the three public ones can also answer 401 `AUTHENTICATION_REQUIRED`. Every
response under `/api/auth` keeps `Cache-Control: no-store`.

Changed routes of earlier specs, otherwise as they were:

| Method | Path               | Change                                               |
| ------ | ------------------ | ---------------------------------------------------- |
| GET    | `/api/clients`     | `createdBy`: `me` or a member id                     |
| GET    | `/api/deals/board` | `assignee`: `me` or a member id                      |
| GET    | `/api/tasks`       | `assignee`: `me` or a member id                      |
| \*     | `/api/stages…`     | stage writes behind `stages.manage`, same 403 as now |

`memberListResponseSchema`:

```json
{
  "items": [
    {
      "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Ann",
      "email": "ann@studio.dev",
      "role": "owner",
      "joinedAt": "2026-10-01T08:00:00.000Z"
    }
  ]
}
```

`createdInviteResponseSchema`:

```json
{
  "id": "0199b0d2-1a2b-7c3d-8e4f-5a6b7c8d9e0f",
  "createdBy": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
  "createdAt": "2026-10-09T09:30:00.000Z",
  "expiresAt": "2026-10-16T09:30:00.000Z",
  "token": "q3V8Hn1xKZ0bWcR5tYp2LmA9sEoJfDgU7iNvXwC4hBk"
}
```

`invitePreviewResponseSchema`:

```json
{
  "workspace": { "name": "Pixel Studio" },
  "invitedBy": { "name": "Ann" },
  "expiresAt": "2026-10-16T09:30:00.000Z"
}
```

Web pages:

| Path    | Access                    | Title          |
| ------- | ------------------------- | -------------- |
| `/team` | protected                 | Team           |
| `/join` | public, any session state | Join workspace |

## 5. UI

**Shell.** The main navigation gains "Team" after "Tasks", with `aria-current="page"` on `/team`.

**Team (`/team`).**

- Heading "Team". Three sections, each with its own skeleton and its own error with "Try again".
- Workspace: "Workspace name" and the name. Owners get "Rename", which turns the line into a form
  with the field "Workspace name", "Save" and "Cancel"; Escape cancels, "Save" stays disabled until
  the name changes and shows a spinner while pending. Success → back to text, toast "Workspace
  renamed", the header shows the new name. A 400 lands on the field, a 403 as below, anything else
  → alert in the form with the reference.
- Members: heading "Members" with the count. From `md` a table: Name (with a "You" badge on the
  caller's row), Email (`mailto:`), Role, Joined. Owners get an actions column with a menu button
  per row, named "Actions for <name>". Below `md`: cards with the same content and the menu button.
- Menu: "Make owner" or "Make manager"; "Remove from workspace" on every row but the caller's. On
  the caller's own row, when they are the only owner, "Make manager" is disabled with the line "Add
  another owner first"; it stays reachable by keyboard (`aria-disabled`), so the line is read out.
  While a role change is sent, the item is disabled.
- Changing another member's role needs no confirmation (it is reversible): toast "<name> is now an
  owner" or "… a manager".
- Demoting yourself: confirm "Make yourself a manager?", "You will no longer be able to invite
  people, change roles or rename the workspace.", "Cancel" and "Make me a manager". Success → toast
  "You are now a manager", the session refetches and owner controls disappear.
- Removing: dialog "Remove <name>?" with the text "<name> loses access right away and is signed out
  on every device. Clients, closed deals and completed tasks they worked on stay in the
  workspace.", a select "Hand over open deals and tasks to" (the caller first and chosen by default,
  labelled "<name> (you)", then every other member sorted by name), "Cancel" and "Remove" (destructive;
  spinner; not dismissible while pending). Success → toast "<name> was removed. Open deals and
  tasks went to <receiver>." A 400 on `transferTo` (the receiver was removed meanwhile) → the
  select shows "Choose another member" and members refetch. If the chosen receiver is gone after
  the refetch, the select is left empty until another member is chosen.
- Responses to role changes and removal: 409 `LAST_OWNER` → toast "A workspace needs at least one
  owner."; 404 → toast "This member is no longer in the workspace." and members refetch; 403
  `INSUFFICIENT_ROLE` → toast "Only owners can do this." and the session refetches; anything else →
  toast "Something went wrong. Try again.", or an alert inside the removal dialog, which stays open.
- Managers see the same page without the actions column, without the invites section, and with the
  line "Only owners can invite people and change roles."
- Pending invites (owners): heading "Pending invites" and an "Invite member" button. Each item:
  "Invited by <name>", "Created <date>", "Expires <date>", and "Revoke" named "Revoke invite created
  <date>". Empty: "No pending invites". At 20 the button is disabled and the hint reads "You
  can have up to 20 pending invites. Revoke one to create another."
- Revoking: confirm "Revoke this invite?", "The link stops working right away.", "Cancel" and
  "Revoke". Success → toast "Invite revoked". 404 → toast "This invite is no longer pending." and
  invites refetch.

**Invite dialog.**

- Title "Invite a member", the text "The person joins as a manager: they work with clients, deals
  and tasks and delete only what they added. You can make them an owner later.", "Cancel" and
  "Create link".
- "Create link" shows a spinner while pending. Success → the dialog shows a read-only field "Invite
  link" with the full URL, "Copy link", the text "Anyone with this link can join <workspace> as a
  manager until <date>. It works once and is shown only now.", and "Done". Once the link is
  shown, a click outside the dialog leaves it open; Escape and "Done" close it.
- "Copy link" writes the URL with `navigator.clipboard.writeText` → toast "Link copied". If the
  clipboard refuses, the field's text is selected and the hint reads "Copy the selected link."
- 409 `INVITE_LIMIT_REACHED` → alert in the dialog and invites refetch, so the button and the hint
  follow invites created elsewhere; 403 as above; anything else → alert with the reference. The new
  invite is in the pending list as soon as the dialog closes.

**Join (`/join#<token>`).**

- The auth card layout. While the preview loads: skeletons of the heading and the form.
- No fragment → heading "Invite link incomplete", "Open the link from your invite message again."
  A malformed token or a 404 → heading "Invite not valid", "This invite link is invalid, already
  used or expired. Ask the workspace owner for a new one.", and a "Log in" link.
- Valid → heading "Join <workspace>", line "<inviter> invited you to join as a manager. The link
  expires on <date>."
- A preview that fails otherwise → heading "Join workspace", "We could not load the invite." and
  "Try again"; the heading keeps focus while the retry loads the invite.
- When the browser holds a session, an info alert above the form: "You are signed in on this
  browser. Joining signs you out of that account first."
- "Create account" mode, the default: Your name, Email, Password with "At least 12 characters";
  button "Create account and join"; link "Already have an account? Log in to join". "Log in" mode:
  Email, Password; button "Log in and join"; link "New to Clientry? Create an account". Switching
  keeps the typed email and does not change the URL. While a join is sent, the switch is disabled.
- Responses: 400 → field errors; 404 `INVITE_INVALID` → the "Invite not valid" state; 409
  `EMAIL_TAKEN` → on email "An account with this email already exists. Log in to join instead.";
  409 `ALREADY_IN_WORKSPACE` → alert "This account already belongs to a workspace. Use another
  account."; 401 → alert "Email or password is incorrect.", password cleared and focused; 429 and
  anything else → as on login and register (spec 04).
- Success → `/` in the new workspace.

**Member menu (clients, board, tasks).** "Only mine" becomes a menu in the same place: "Added by"
on clients, "Assignee" on the board and on tasks. Radio items "Anyone", "Me", then the other members
by name, and a checked "Former member" when the URL holds an id that is not a member. The trigger
reads "Assignee: Anyone", "Assignee: Me", "Added by: Max". A spinner row while members load; "Could
not load members" with "Try again" if they fail; "Anyone" and "Me" work meanwhile. Choosing an item
closes the menu and focus returns to the trigger. On a phone the menu wraps with the other controls,
as the toggle did.

**Empty states with a member filter.** The texts of specs 07 and 08 for "Me" stay. For another
member or a former member:

| Screen | A member                                | A former member                              | Button                  |
| ------ | --------------------------------------- | -------------------------------------------- | ----------------------- |
| Board  | "No deals are assigned to <name>."      | "No deals are assigned to this member."      | "Show all deals"        |
| Tasks  | "No open tasks are assigned to <name>." | "No open tasks are assigned to this member." | "Show everyone's tasks" |

- A former member has no name in the member list, hence "this member". Clients
  keep spec 06's "No clients match your filters" with "Clear filters".
- The button sets the menu to "Anyone", and focus moves to the menu trigger, as it moved to the
  toggle before.
- The tasks list shows the assignee on each row only for "Anyone"; with "Me" or a member every row
  has the same assignee, as with "Only mine" before.

**Reopening a former member's work.** A move of a closed deal to an open stage, on the board or on
the deal page, refused with 400 on `assigneeId` puts the card back and shows the toast "The assignee
is no longer in the workspace. Choose another one to reopen this deal." with "Edit deal", which
opens the deal's edit form. "Reopen" on a task the same way: "… to reopen this task." with "Edit
task".

**Log in.** The `NO_WORKSPACE` alert reads "This account is not a member of any workspace. Ask an
owner for an invite link."

**Focus.**

- After a removal or a revoke, focus moves to the section heading ("Members", "Pending invites";
  `tabIndex={-1}`), since the row and its button are gone. After demoting yourself, to the page `h1`.
- Dialogs return focus to their trigger. When the invite link appears, focus moves to "Copy link".
- When a 404 or a 403 takes away the focused control, focus moves to "Members" if it was a member
  row's, to "Pending invites" after a revoke's 404, otherwise to the page `h1`. A 404 on the join
  form moves focus to "Invite not valid"; a 400 on `transferTo` to the select.
- On the join page, switching mode moves focus to the first empty field.

Every screen is checked at 390×844 and 1280×800, in light and dark themes, at 360 px for horizontal
scroll, and by keyboard only.

## 6. Tests

- **Unit, packages/shared**
  - Permissions: the matrix equals the table of section 2, cell by cell; `hasPermission` for both
    roles on each permission; the `canDeleteRecord` tests of spec 06 pass unchanged.
  - Invite token: 43 base64url characters accepted; 42, 44, `+`, `/` and `=` padding rejected with
    "Invalid invite link".
  - Join schemas: the register and login messages of spec 04 for name, email and password; a missing
    token rejected.
  - Workspaces: update member requires `role` and rejects an unknown one; rename trims, blank → "Enter a workspace name", 101 characters →
    "Use at most 100 characters", NUL rejected; the register schema keeps the same rule.
  - Member filter: `me` and a UUID accepted, an uppercase UUID lowercased, `someone` and `anyone`
    rejected; the client list, board and task list queries accept it on `createdBy` and `assignee`.
  - Remove member query: `transferTo` missing or not a UUID → "Choose another member".
- **Unit, apps/api**
  - Opaque token helpers: the refresh token tests, moved.
  - `PermissionsGuard`: passes without metadata; passes an owner on `team.manage`; rejects a manager
    with `InsufficientRoleError`; handler metadata overrides the controller's.
  - Members service, unit of work mocked: demoting the only owner → `LastOwnerError` and no update;
    demoting one of two owners → updated and their pending invites revoked; promoting a manager →
    no invite revoked; same role → no write, member returned; removing the only
    owner → `LastOwnerError`; removing a manager → caller's role re-read, open tasks locked,
    membership deleted, deals and tasks handed to `transferTo` with the caller as actor, sessions
    revoked, their pending invites revoked, in that order and all through the locked unit of work;
    the caller's re-read role no longer `owner` → `InsufficientRoleError` and no write, for role
    change, removal, invite create and revoke and rename alike; `transferTo` equal to the removed
    member or not a member → `RequestValidationError` on `transferTo` and no write; an unknown
    member → `MemberNotFoundError`, before the `transferTo` check; logs carry ids and counts only.
  - Invites service: at 20 pending → `InviteLimitReachedError` and no insert; create stores the hash
    of the returned token, not the token; `expiresAt` is 7 days after now (fake timers); revoking a
    non-pending invite → `InviteNotFoundError`.
  - Auth service: register by invite hashes before the repository call and propagates
    `InviteInvalidError` and `EmailTakenError`; login by invite with a dead invite throws
    `InviteInvalidError` without reading the credentials; with an unknown email verifies the
    dummy hash and throws `InvalidCredentialsError`; with a membership → `AlreadyInWorkspaceError`
    and no claim; success deletes ended sessions, starts a session and revokes the presented refresh
    token's session; a failure does not revoke it; a session refused for a membership gone meanwhile
    → `NoWorkspaceError`.
  - Reopening: a closed deal of a non-member moved to an open stage and a done task of a non-member
    reopened → `RequestValidationError` on `assigneeId` and no write; an open deal moved between open
    stages and a completed task read no membership.
  - Write conflict retry: a run that loses a deadlock (`P2034`, or `P2010` with
    `TransactionWriteConflict`) runs once more; a second loss or any other error, another `P2010`
    included, is rethrown.
- **Integration, apps/api** (testcontainers, supertest, two registered workspaces, `resetDatabase`
  before each test)
  - Invites: create → 201 matching `createdInviteResponseSchema`, the row holds a hash different
    from the token; the list holds pending invites only (used, revoked and one with `expires_at`
    moved back are absent), newest first, own workspace only, no token; the 21st pending → 409
    `INVITE_LIMIT_REACHED`; revoke → 204 and the preview → 404; revoking a used, a revoked and
    another workspace's invite → 404 `INVITE_NOT_FOUND`.
  - Preview: 200 with workspace name, inviter and expiry; unknown, used, revoked and expired →
    404 `INVITE_INVALID` with identical bodies apart from `requestId`; a malformed token → 400 on
    `token`.
  - Register by invite: 201 with both cookies and role `manager`; the membership is in the invite's
    workspace; `used_at` and `used_by_id` set; the same link again → 404; a taken email →
    409 and the preview still 200 afterwards; two joins with one link, both held at the claim by a
    test transaction on the invite row → one 201, one 404, one new membership; an agent holding
    another account's cookies joins → that account's old refresh token → 401.
  - Login by invite: a removed owner → 200, back in the workspace as a manager; their refresh token
    from before the removal → 401; an account with a membership → 409 `ALREADY_IN_WORKSPACE` and the
    preview still 200; the same 409 and a usable link when a test transaction inserts the account's
    membership first, as a concurrent join would; wrong password → 401 `INVALID_CREDENTIALS`; an
    unknown token with a wrong password → 404 `INVITE_INVALID`, not 401.
  - Members: list → own workspace only, join order, the fields of `memberSchema`, readable by a
    manager. Promote a manager → 200, and their next request with the same access token passes an
    owner-only route; demote the only owner → 409 `LAST_OWNER`; two owners demoting each other
    concurrently → one 200, one 403 `INSUFFICIENT_ROLE`, one owner left; a demoted owner's invites →
    preview 404, another owner's still 200; same role → 200, `updated_at` unchanged.
  - Removal: 204; the removed member's next request with the same access token → 401, their refresh
    → 401, every session of theirs has `revoked_at` (two of them), their login → 403
    `NO_WORKSPACE`, no session can be started for them, and a login waiting on an uncommitted removal
    → 403 `NO_WORKSPACE` with no session; their clients are still listed with their name; a removed second owner's
    pending invites → preview 404, without a demotion before; removing the only owner → 409; another
    workspace's member → 404 and nothing changed; `not-a-uuid` → 400 on `id`.
  - Workspace: rename → 200, `/me` shows the new name; blank → 400 on `name`.
  - Stale role: an owner demoted in the database while their invite create waits on the workspace
    lock (held by a test transaction) → 403 `INSUFFICIENT_ROLE` and no invite row.
  - Every invites response, a 400, a 403, a 404 and a 409 included, has `Cache-Control: no-store`.
  - Permission matrix: one table-driven test over every route behind a permission: a manager → 403
    `INSUFFICIENT_ROLE` and nothing written; an owner → not 403. The stage write tests of spec 07
    and the access control tests of spec 03 pass with `@RequirePermission`.
  - Handover: removing a member with open, closed, deleted deals and open, done, deleted tasks →
    every open deal and open task, deleted ones included, now assigned to `transferTo`; closed deals
    and done tasks unchanged; each handed deal has version + 1 and one `deal_updated` entry with the
    `assignee` change and the caller as actor; handed deals and tasks get a newer `updated_at`; a
    pending reminder of a handed task, due a few seconds later, produces one notification for the
    receiver; an edit sent with a handed deal's old version → 409 `DEAL_CHANGED`. `transferTo`
    missing, the removed member, a non-member and another workspace's user → 400 on `transferTo`
    with nothing changed. A member with no open work → 204. The number of SQL statements does not
    depend on the number of records handed over.
  - Reopening: a removed member's won deal moved to an open stage → 400 on `assigneeId`, the deal
    still closed; their done task reopened → 400 on `assigneeId`, the task still done.
  - Removal and concurrent writes, each interleaving forced by a test transaction: a deal created
    for the member while the removal waits for a write holding the membership `FOR SHARE` is handed
    over; a deal created after the removal → 400 on `assigneeId`. A transaction holding the member's
    open task `FOR UPDATE`, as delivery and task edits do, makes the removal wait; it then reads the
    membership `FOR SHARE` and commits, and the removal completes in one run and hands the task
    over. A transaction holding the membership `FOR SHARE` that then reads the member's deal
    `FOR SHARE`, as a task create on that deal does: the removal completes in one run, the deal
    handed over. The remaining cycle, forced: the removal held at the member's open task, another
    task assigned to the member meanwhile and held `FOR UPDATE` by a transaction that then reads the
    membership `FOR SHARE` → the removal loses the deadlock, runs once more and hands both tasks
    over, and the other transaction commits.
  - Member filters: `createdBy=<id>` on clients, `assignee=<id>` on the board and on tasks return
    only that member's records, also for a removed member's closed deals and done tasks; another
    workspace's user id → empty; `abc` → 400; `me` behaves as before.
  - Rate limit, on its own app instance: the 31st preview within a minute → 429 with `Retry-After`;
    the 11th login by invite within a minute → 429.
  - OpenAPI: the nine new operations with their tags; the three join operations with
    `security: []`, the rest with the cookie scheme and 401; every operation behind a permission,
    the stage writes included, lists 403 `INSUFFICIENT_ROLE`; error responses reference
    `ApiProblem`; `:id` operations have the path parameter `id`; member removal has the query
    parameter `transferTo`.
  - Fixtures: `addManager` joins through an invite with its signature unchanged; every suite of
    specs 03–08 passes with it.
  - Migrations: deploy and the drift check in global setup pass.
- **Unit, apps/web (node)**
  - Proxy: `/join` renders for `anonymous`, `expired` and `authenticated`, without a redirect; the
    other gate cells of spec 04 stay; `/login?next=/join` resolves to `/`.
  - Team prefetch: `/team` fills the members key the client hook reads; a failure → one `warn` line.
  - Member filter prefetch: `/deals?assignee=<id>` prefetches the board and the members; `/deals`
    and `/tasks` without a member id prefetch no members.
- **Unit and component, apps/web (jsdom, MSW)**
  - Join: no fragment → "Invite link incomplete" and no request; a malformed token → "Invite not
    valid" and no request; valid → the preview text; 404 → "Invite not valid"; create account →
    `POST /api/auth/invite/register` with the token, session in the cache, route replaced with `/`;
    409 `EMAIL_TAKEN` → email error; switching to "Log in" keeps the email; 409
    `ALREADY_IN_WORKSPACE` → alert; 401 → alert, password empty and focused; 429 → the wait message;
    the session alert shows only when the page says the browser holds a session; no request to
    `/api/auth/me` in any case.
  - Team view: an owner sees actions, "You" on their row and the invites section; a manager sees no
    actions, no invites section and the note.
  - Invite dialog: create → the field holds `http://localhost:3000/join#<token>`, focus on "Copy
    link"; copy → clipboard called with that URL and the toast; clipboard rejected → text selected
    and the hint; 409 → alert in the dialog; at 20 pending the button is disabled with the hint.
  - Revoke: confirm → `DELETE`, invites refetched, focus on "Pending invites".
  - Member actions: "Make owner" → `PATCH` and the toast; own demotion → confirmation, then the
    session refetched and the actions gone; the only owner's own "Make manager" is disabled; remove
    → the select defaults to the caller and lists every other member by name, `DELETE` with `transferTo`,
    the row gone, deal and task queries invalidated, focus on "Members"; choosing another receiver
    sends their id; 400 on `transferTo` → error on the select, left empty once the receiver is
    gone from the refetched members; 409 `LAST_OWNER`, 404 and 403 →
    their toasts and refetches; 500 → alert in the open removal dialog.
  - Rename: an owner sees "Rename"; a blank name → field error and no request; success → the header
    shows the new name without a refetch of `/me`; a manager does not see "Rename".
  - Member menu: lists "Anyone", "Me" and the other members after opening, with one
    `GET /api/members`; an unknown UUID in the URL shows "Former member" checked; the caller's own
    id checks "Me"; the trigger names the choice, and shows the label alone while members are not
    loaded; focus returns to the trigger.
  - Stage controls: the settings link on the board and the owner controls of the stage manager
    show for an owner and hide for a manager, through `hasPermission`; the spec 07 tests pass.
  - Clients: choosing a member writes `createdBy=<id>` and the list path carries it; `?createdBy=me`
    checks "Me"; `?createdBy=abc` and `?mine=true` filter nothing; "Clear filters" resets it.
  - Board: no param → "Anyone" and no `assignee` in the request; `?assignee=me` and
    `?assignee=<id>` reach the board request; `?mine=true` filters nothing.
  - Tasks: no param → "Me" and `assignee=me` in the request; `?assignee=anyone` → no `assignee`;
    `?assignee=<id>` reaches the request; the assignee shows on rows only for "Anyone".
  - Empty states: the board and tasks with a member and with a former member show the texts of
    section 5; the button sets "Anyone" and focus lands on the menu trigger; the "Me" texts stay.
  - Join page: "holds a session" is true for an `authenticated` and an `expired` cookie, false
    without one.
  - Main nav: `aria-current` on `/team`.
  - Login form: `NO_WORKSPACE` → the new message.
- **e2e**: none (spec 12).
- **Tooling checks**, done once on throwaway changes that are not committed; each must fail:
  - `features/team-invites` importing `@/features/manage-member` (lint);
  - `entities/member` importing `@/features/manage-member` (lint);
  - a route with `@Roles('owner')` (typecheck: the decorator no longer exists).

## 7. Acceptance criteria

- [ ] `pnpm db:migrate` applies `invites` locally; `\d invites` in `psql` shows the indexes and the
      foreign keys of section 3.
- [ ] In the browser: the owner creates an invite and copies the link; a private window opens
      it, creates an account and lands on `/` in the owner's workspace as a manager; the same link
      again shows "Invite not valid".
- [ ] The owner promotes the manager to owner and back; the manager's open tab follows within one
      request (an owner-only action shows the toast and the controls disappear).
- [ ] The owner removes a manager who has an open deal, a won deal, an open task with a reminder a
      few minutes ahead and a done task, handing over to the owner: the open deal and task now show
      the owner, the deal's history has the assignee change, the reminder arrives in the owner's
      bell; the won deal and the done task still show the manager. The manager's open tab goes to
      `/login` on its next request, login shows the `NO_WORKSPACE` message, a new invite with "Log
      in to join" brings them back.
- [ ] The only owner cannot demote or remove themselves: "Make manager" is disabled on their own row
      and "Remove from workspace" is not offered there, and the API
      answers 409 (integration tests).
- [ ] Rename shows the new name in the header without a reload.
- [ ] Filters by member on clients, the board and tasks: choosing a member narrows the screen; the
      copied link opens the same view in a new tab with the member's name on the trigger; reload and
      Back keep it; tasks still open on "Me" by default.
- [ ] The token never reaches a log line: the local API log and, after the merge, the Render log of
      a preview, a join and a create contain no token and no hash; the web request for `/join`
      carries no token.
- [ ] `browser-verify` over the screens of section 5 at both sizes and in both themes: no failed
      requests except the expected 401 before a refresh and the 404 of an invalid invite, no console
      errors except the browser's own line for those, no hydration warnings.
- [ ] Keyboard only: open the invite dialog, create and copy a link, change a role, remove a member
      through the dialog choosing a receiver, revoke an invite, rename the workspace, join through a
      link in both modes, filter each of the three screens by a member; focus always visible.
- [ ] `@Roles` and `RolesGuard` are gone from the code; every restricted route uses
      `@RequirePermission`.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; the `image` smoke test
      applies the new migration in the container.
- [ ] Every tooling check from section 6 fails as described.
- [ ] No new dependencies and no shadcn CLI run; clean install has no engine, peer dependency or
      ignored build script warnings.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] One migration, `invites`, in the PR with the code that uses it.
- [ ] After the merge, the `main` run deploys by itself; the Render log shows the migration applied
      on Neon; on the live URL an invite is created, accepted in a private window, the member's role
      changed and the member removed; `browser-verify` against the live URL over the screens of
      section 5 passes.
- [ ] The ADR is written.
- [ ] This spec is part of the PR.
