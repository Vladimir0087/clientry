# 09 — Team

Status: draft

## 1. Goal

An owner brings people into the workspace with one-time invite links, sees the team, changes roles,
removes members and renames the workspace; an invited person joins with a new account or an
existing one; and who may do what is one permission matrix that the API guard and the web read
alike.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/schema.prisma                      # Invite
  prisma/migrations/<timestamp>_invites/
  src/
    app.module.ts                           # WorkspacesModule; PermissionsGuard replaces RolesGuard
    common/
      auth/require-permission.decorator.ts  # replaces roles.decorator.ts
      crypto/opaque-token.ts                # generate and hash, moved from modules/auth/refresh-token.ts
    modules/
      auth/
        auth.controller.ts                  # invite preview, register and login by invite
        auth.service.ts
        permissions.guard.ts                # replaces roles.guard.ts
        accounts.repository.ts              # invite claim inside the account transaction
        prisma-accounts.repository.ts
        errors.ts                           # InviteInvalidError, AlreadyInWorkspaceError
      workspaces/
        workspace.controller.ts, workspace.service.ts   # rename
        members.controller.ts, members.service.ts
        invites.controller.ts, invites.service.ts
        workspaces.repository.ts            # contract, with the workspace lock
        prisma-workspaces.repository.ts
        workspaces.module.ts
        errors.ts
      clients/                              # createdBy accepts a member id
  test/
    fixtures/accounts.ts                    # members join through invites
    fixtures/invites.ts
    support/protected-test.controller.ts    # @RequirePermission
apps/web/src/
  proxy.ts                                  # /join renders in every session state
  shared/lib/redirect-target.ts             # public paths next to auth paths
  shared/lib/role-label.ts                  # moved from entities/session
  shared/ui/dialog.tsx                      # shadcn
  app/
    (auth)/join/page.tsx
    (app)/
      _components/main-nav.tsx              # Team link
      team/page.tsx, team/loading.tsx
      team/_components/team-view.tsx        # composes the sections and row actions
  features/
    auth/                                   # join form and invite preview; NO_WORKSPACE message
    team-invites/                           # invite dialog, pending list, revoke
    manage-member/                          # role change, removal
    rename-workspace/
    client-filters/                         # "Added by" menu
  entities/
    member/                                 # keys, API calls, list query, member list
packages/shared/src/
  auth/permissions.ts                       # the matrix, hasPermission, canDeleteRecord
  auth/invite.ts                            # token, preview and join schemas
  workspaces/                               # new entry point @clientry/shared/workspaces
  clients/                                  # createdBy: me or a member id
docs/adr/NNNN-team-access.md
```

**Permission matrix**

`@clientry/shared/auth` exports the role table of plan section 6 as data:

| Permission           | owner | manager | Guards                                                        |
| -------------------- | ----- | ------- | ------------------------------------------------------------- |
| `team.manage`        | yes   | no      | invites: create, list, revoke; member role change and removal |
| `workspace.manage`   | yes   | no      | workspace rename                                              |
| `stages.manage`      | yes   | no      | stage settings (spec 07)                                      |
| `records.delete_any` | yes   | no      | deleting and restoring another member's clients and deals     |

- `hasPermission(role, permission)` reads the table. `canDeleteRecord` keeps its signature and
  behaviour and becomes `hasPermission(role, 'records.delete_any')` or the caller's own record.
- `@RequirePermission(permission)` on a handler or a controller replaces `@Roles`, and
  `PermissionsGuard` replaces `RolesGuard` in the same place of the global guard order. A route
  without it is open to every member; a caller whose role lacks the permission gets 403
  `INSUFFICIENT_ROLE`, the code clients already handle. Routes say what they do and the matrix says
  who may: moving a permission between roles is one line in one file, and the web cannot drift from
  the API.
- `@Roles` and `RolesGuard` are removed, so a route has one way to be restricted. The test-only
  controller uses `@RequirePermission('workspace.manage')`. Routes that specs 07 and 08 restricted
  with `@Roles('owner')` move to their permission: stage settings to `stages.manage`.
- Rules that depend on the record ("own or someone else's") stay in services, as in spec 06.
- The web hides controls with the same `hasPermission` and the role from `useSession()`; the API
  decides. No page is gated by role in the proxy: the team page is open to every member.

**Invites**

- Every invite joins as a manager. A leaked link then gives a manager's access, never the team: an
  owner can remove other owners, so an owner link would be a takeover. An owner is made by promoting
  a member the owners know.
- The token is 32 random bytes,
  base64url, 43 characters; only its SHA-256 hash is stored, as with refresh tokens, so the database
  never holds a usable link. The generate and hash helpers move from `modules/auth/refresh-token.ts`
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

**Joining by invite**

- The link is `<web origin>/join#<token>`. The token travels in the fragment, which browsers never
  send to a server: it stays out of Vercel's and Render's request logs, the API request log and the
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
- Login by invite: credentials are checked exactly as on login (the dummy hash for an unknown email,
  one `INVALID_CREDENTIALS` for both causes). An account that already has a membership then gets 409
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

- `GET /api/members` lists the workspace's members in join order (membership `created_at`, then
  id): the user id as `id`, name, email, role, `joinedAt`. Every member may read it; deal and task
  assignee pickers (specs 07, 08) use it. No pagination: a team is a handful of people.
- Role change (`PATCH /api/members/:id` with `{ role }`) and removal (`DELETE /api/members/:id`)
  need `team.manage`. `:id` is the user id. A user who is not a member of the caller's workspace →
  404 `MEMBER_NOT_FOUND`.
- A workspace always has at least one owner: demoting or removing the last owner → 409
  `LAST_OWNER`. Several owners are allowed; an owner may demote or remove themselves while another
  owner remains, which is how ownership is handed over.
- Both run in a transaction that first locks the workspace row (`SELECT … FOR UPDATE`), then reads
  the target and counts owners. Two owners demoting each other at once are serialized, and the
  second sees one owner left; without the lock both would count two and leave the workspace with
  none. Creating an invite takes the same lock.
- The rules live in the services; the repository gives them a unit of work:
  `inWorkspaceLock(workspaceId, work)` opens the transaction, takes the lock and passes `work` a
  repository bound to it. Services stay testable without a database.
- Setting the role a member already has → 200 with the member unchanged, no write.
- A role change applies on the member's next request, since the API reads the role per request
  (spec 03); their next refresh signs the new role into the access token.
- Removal deletes the membership and, in the same transaction, revokes the user's sessions and the
  pending invites they created. Spec 03 locks a removed member out without revoking sessions, but a
  session left on some device would come back to life if the person were invited again. Pending
  invites go with their creator: they were that owner's decision.
- The user row stays. Clients they created keep their name (spec 06), and so do later records that
  point at them. The person can still log in only to see `NO_WORKSPACE`, and can come back through
  a new invite with "Log in to join".

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
- `createdBy=<id>` on the client list filters inside the caller's workspace; a foreign id matches
  nothing.

**Clients: filter by member**

- `clientListQuerySchema.createdBy` accepts `me` or a UUID; the service maps `me` to the caller.
- The web replaces the "Only mine" toggle and its `mine` page param with an "Added by" menu and a
  `createdBy` page param (`me` or a member id). `mine` is not kept for compatibility: links stay
  internal until launch. Parsing drops a value that is neither `me` nor a UUID.
- The menu loads members when it first opens, so the list page makes no extra request on load. An
  id in the URL that is not a current member shows as a checked "Former member" item: their clients
  are still there.

**Logging**

- `info`, each line with workspace id and acting user id: invite created (invite id), invite
  revoked (invite id), invite accepted (invite id, new or returning user id, mode `register` or
  `login`), role changed (member id, old and new role), member removed (member id, number of
  sessions revoked), workspace renamed.
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

**Shared contracts**

- `@clientry/shared/auth` adds `inviteTokenSchema` (43 base64url characters, message "Invalid invite
  link"), `invitePreviewRequestSchema`, `invitePreviewResponseSchema`,
  `inviteRegisterRequestSchema`, `inviteLoginRequestSchema` (the field rules and messages of
  register and login plus `token`), `PERMISSIONS`, `Permission`, `hasPermission`, and inferred
  types.
- New entry point `@clientry/shared/workspaces`: `memberSchema` (`Member`),
  `memberListResponseSchema` (`{ items }`), `memberIdParamsSchema`, `updateMemberRequestSchema`,
  `inviteSummarySchema`, `inviteListResponseSchema` (`{ items }`), `createdInviteResponseSchema`
  (the summary plus `token`), `inviteIdParamsSchema`,
  `renameWorkspaceRequestSchema` (also the form schema), `workspaceResponseSchema`, `INVITE_LIMITS`,
  and inferred types.
- `@clientry/shared/clients`: `createdBy` is `me` or a UUID.
- Dates are ISO strings, as in spec 06.

**Web: join page**

- `/join` renders in every session state: the proxy neither redirects an `anonymous` visitor to
  `/login` nor an `authenticated` one away. `redirect-target.ts` gains a set of public paths next
  to the auth paths, and `/join` is never a `next` target.
- `(auth)/join/page.tsx` is a server component inside the auth card layout. It checks the access
  cookie with `verifyAccessToken` and passes one boolean, "the browser holds a session", to the
  form. The page never requests `/api/auth/me`: for an anonymous visitor that is a 401, a failed
  refresh and a redirect to `/login`, which would drop the fragment.
- The browser reads the token from `location.hash` after mount, checks it with `inviteTokenSchema`,
  then requests the preview as a query. The fragment stays in the address bar, so a reload works.
- The join form lives in `features/auth`, next to register and login, and reuses their fields, 429
  messages and `useEnterSession`: success clears the query cache, writes the session and replaces
  the route with `/`.

**Web: team page**

- `/team` is open to every member. The server prefetches members through `(app)/_lib/prefetch.ts`
  (spec 06). Invites load in the browser, only when the session grants `team.manage`.
- `entities/member`: `memberKeys` (`all`, `list`), API calls (list, change role, remove),
  `useMembers({ enabled })`, and the member table and cards with an actions slot that the app layer
  fills with `features/manage-member`.
- `roleLabel` moves from `entities/session` to `shared/lib/role-label.ts`: two entities need it and
  cannot import each other.
- `features/team-invites`: `inviteKeys`, list, create and revoke, the invite dialog and the pending
  list. The link is built in the browser as `${location.origin}/join#${token}`.
- `features/manage-member`: the row menu, the demotion and removal dialogs.
- `features/rename-workspace`: the inline form with `renameWorkspaceRequestSchema`.
- Cache: a rename writes the new name into the session cache, so the header changes at once; a role
  change or removal invalidates members, and one of the caller's own role invalidates the session;
  create and revoke invalidate invites; a removal also invalidates invites, since the removed
  member's ones are revoked.
- A 403 `INSUFFICIENT_ROLE` on any team action (the role changed in another tab or by another owner)
  shows a toast and refetches the session, so the controls follow the real role.

**UI kit**

- `dialog` from the same shadcn CLI version, `pnpm dlx shadcn@4.21.1 add dialog`, for the invite
  dialog. The owner approved this temporary run for this spec, as in specs 04 and 06. It uses the
  `radix-ui` package the app already has, so no dependency is added. Everything else exists:
  `alert-dialog`, `table`, `badge`, `dropdown-menu`, `empty`.

**Architecture decision record**

- `NNNN-team-access.md`, the next free number when the PR is opened: one-time invite links with
  hashed tokens over email invites (needs a mail provider, v2) and over stored tokens that can be
  shown again (a database leak would hand out working links); invites that always join as a manager
  over a role on the invite (a leaked owner link would hand over the team); the token in the URL fragment over a
  path or query parameter (request logs, `Referer`); a permission matrix in `packages/shared` read by
  the guard and the web over role lists on routes; the last-owner rule under a workspace row lock
  over an unlocked check (two owners demoting each other) and over a database trigger (rules move
  out of the service and its tests). Consequences: a lost link is replaced, not re-sent; ADR 0005's
  `@Roles` is superseded by `@RequirePermission`.

### Out of scope

- Invites by email, binding an invite to an address (v2 with email).
- Several workspaces per account, a switcher, joining a second workspace while a member (v2).
- Deleting the workspace (v2, with several workspaces per account): v1 has no way to give an
  existing account a new workspace, so every member would be left with an account that cannot log
  in.
- A manager leaving the workspace on their own; transferring ownership as one action (promote, then
  demote yourself).
- Reassigning deals and tasks of a removed member (specs 07, 08 own assignees; references stay
  valid because users stay).
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

| Method | Path                        | Auth               | Request                        | Success                                   | Errors                                                                                       |
| ------ | --------------------------- | ------------------ | ------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/invite/preview`  | public             | `invitePreviewRequestSchema`   | 200 `invitePreviewResponseSchema`         | 400, 403 `UNTRUSTED_ORIGIN`, 404 `INVITE_INVALID`, 429                                       |
| POST   | `/api/auth/invite/register` | public             | `inviteRegisterRequestSchema`  | 201 `sessionResponseSchema`, both cookies | 400, 403 `UNTRUSTED_ORIGIN`, 404 `INVITE_INVALID`, 409 `EMAIL_TAKEN`, 429                    |
| POST   | `/api/auth/invite/login`    | public             | `inviteLoginRequestSchema`     | 200 `sessionResponseSchema`, both cookies | 400, 401 `INVALID_CREDENTIALS`, 403 `UNTRUSTED_ORIGIN`, 404, 409 `ALREADY_IN_WORKSPACE`, 429 |
| GET    | `/api/members`              | member             | —                              | 200 `memberListResponseSchema`            | —                                                                                            |
| PATCH  | `/api/members/:id`          | `team.manage`      | `updateMemberRequestSchema`    | 200 `memberSchema`                        | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404 `MEMBER_NOT_FOUND`, 409 `LAST_OWNER`  |
| DELETE | `/api/members/:id`          | `team.manage`      | —                              | 204                                       | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404 `MEMBER_NOT_FOUND`, 409 `LAST_OWNER`  |
| GET    | `/api/invites`              | `team.manage`      | —                              | 200 `inviteListResponseSchema`            | 403 `INSUFFICIENT_ROLE`                                                                      |
| POST   | `/api/invites`              | `team.manage`      | —                              | 201 `createdInviteResponseSchema`         | 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 409 `INVITE_LIMIT_REACHED`                     |
| DELETE | `/api/invites/:id`          | `team.manage`      | —                              | 204                                       | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404 `INVITE_NOT_FOUND`                    |
| PATCH  | `/api/workspace`            | `workspace.manage` | `renameWorkspaceRequestSchema` | 200 `workspaceResponseSchema`             | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`                                            |

Every route except the three public ones can also answer 401 `AUTHENTICATION_REQUIRED`. Every
response under `/api/auth` keeps `Cache-Control: no-store`. `GET /api/clients` accepts
`createdBy=<member id>` (spec 06's table otherwise unchanged).

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

**Shell.** The main navigation gains "Team" after "Clients", with `aria-current="page"` on `/team`.

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
  another owner first".
- Changing another member's role needs no confirmation (it is reversible): toast "<name> is now an
  owner" or "… a manager".
- Demoting yourself: confirm "Make yourself a manager?", "You will no longer be able to invite
  people, change roles or rename the workspace.", "Cancel" and "Make me a manager". Success → toast
  "You are now a manager", the session refetches and owner controls disappear.
- Removing: confirm "Remove <name>?", "<name> loses access right away and is signed out on every
  device. Clients they added stay in the workspace.", "Cancel" and "Remove" (destructive; spinner;
  not dismissible while pending). Success → toast "<name> was removed".
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
  manager until <date>. It works once and is shown only now.", and "Done".
- "Copy link" writes the URL with `navigator.clipboard.writeText` → toast "Link copied". If the
  clipboard refuses, the field's text is selected and the hint reads "Copy the selected link."
- 409 `INVITE_LIMIT_REACHED` → alert in the dialog; 403 as above; anything else → alert with the
  reference. The new invite is in the pending list as soon as the dialog closes.

**Join (`/join#<token>`).**

- The auth card layout. While the preview loads: skeletons of the heading and the form.
- No fragment → heading "Invite link incomplete", "Open the link from your invite message again."
  A malformed token or a 404 → heading "Invite not valid", "This invite link is invalid, already
  used or expired. Ask the workspace owner for a new one.", and a "Log in" link.
- Valid → heading "Join <workspace>", line "<inviter> invited you to join as a manager. The link
  expires on <date>."
- When the browser holds a session, an info alert above the form: "You are signed in on this
  browser. Joining signs you out of that account first."
- "Create account" mode, the default: Your name, Email, Password with "At least 12 characters";
  button "Create account and join"; link "Already have an account? Log in to join". "Log in" mode:
  Email, Password; button "Log in and join"; link "New to Clientry? Create an account". Switching
  keeps the typed email and does not change the URL.
- Responses: 400 → field errors; 404 `INVITE_INVALID` → the "Invite not valid" state; 409
  `EMAIL_TAKEN` → on email "An account with this email already exists. Log in to join instead.";
  409 `ALREADY_IN_WORKSPACE` → alert "This account already belongs to a workspace. Use another
  account."; 401 → alert "Email or password is incorrect.", password cleared and focused; 429 and
  anything else → as on login and register (spec 04).
- Success → `/` in the new workspace.

**Clients toolbar.** "Only mine" becomes the "Added by" menu: radio items "Anyone", "Me", then the
other members by name, and "Former member" when the URL holds an id that is not a member. A spinner
row while members load; "Could not load members" with "Try again" if they fail; "Anyone" and "Me"
work meanwhile. The trigger shows a count of 1 when anything but "Anyone" is chosen, like the other
menus.

**Log in.** The `NO_WORKSPACE` alert reads "This account is not a member of any workspace. Ask an
owner for an invite link."

**Focus.**

- After a removal or a revoke, focus moves to the section heading ("Members", "Pending invites";
  `tabIndex={-1}`), since the row and its button are gone. After demoting yourself, to the page `h1`.
- Dialogs return focus to their trigger. When the invite link appears, focus moves to "Copy link".
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
  - Client list query: `createdBy` `me` and a UUID accepted, `someone` rejected.
- **Unit, apps/api**
  - Opaque token helpers: the refresh token tests, moved.
  - `PermissionsGuard`: passes without metadata; passes an owner on `team.manage`; rejects a manager
    with `InsufficientRoleError`; handler metadata overrides the controller's.
  - Members service, unit of work mocked: demoting the only owner → `LastOwnerError` and no update;
    demoting one of two owners → updated; same role → no write, member returned; removing the only
    owner → `LastOwnerError`; removing a manager → membership deleted, sessions revoked, their
    pending invites revoked, all through the locked unit of work; an unknown member →
    `MemberNotFoundError`; logs carry ids only.
  - Invites service: at 20 pending → `InviteLimitReachedError` and no insert; create stores the hash
    of the returned token, not the token; `expiresAt` is 7 days after now (fake timers); revoking a
    non-pending invite → `InviteNotFoundError`.
  - Auth service: register by invite hashes before the repository call and propagates
    `InviteInvalidError` and `EmailTakenError`; login by invite with an unknown email verifies the
    dummy hash and throws `InvalidCredentialsError`; with a membership → `AlreadyInWorkspaceError`
    and no claim; success deletes ended sessions, starts a session and revokes the presented refresh
    token's session; a failure does not revoke it.
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
    409 and the preview still 200 afterwards; two concurrent joins with one link → one 201, one 404,
    one new membership; an agent holding another account's cookies joins → that account's old
    refresh token → 401.
  - Login by invite: a removed owner → 200, back in the workspace as a manager; an
    account with a membership → 409 `ALREADY_IN_WORKSPACE` and the preview still 200; wrong password
    → 401 `INVALID_CREDENTIALS`.
  - Members: list → own workspace only, join order, the fields of `memberSchema`, readable by a
    manager. Promote a manager → 200, and their next request with the same access token passes an
    owner-only route; demote the only owner → 409 `LAST_OWNER`; two owners demoting each other
    concurrently → one 200, one 409, one owner left; same role → 200, `updated_at` unchanged.
  - Removal: 204; the removed member's next request with the same access token → 401, their refresh
    → 401, their login → 403 `NO_WORKSPACE`; their clients are still listed with their name;
    invites they created → preview 404; removing the only owner → 409; another workspace's member →
    404 and nothing changed; `not-a-uuid` → 400 on `id`.
  - Workspace: rename → 200, `/me` shows the new name; blank → 400 on `name`.
  - Permission matrix: one table-driven test over every route behind a permission: a manager → 403
    `INSUFFICIENT_ROLE` and nothing written; an owner → not 403. The access control tests of spec 03
    pass with `@RequirePermission`.
  - Clients: `createdBy=<member id>` returns only that member's clients; another workspace's user id
    → empty list; `createdBy=abc` → 400.
  - Rate limit, on its own app instance: the 31st preview within a minute → 429 with `Retry-After`;
    the 11th login by invite within a minute → 429.
  - OpenAPI: the ten new operations with their tags; the three join operations with `security: []`,
    the rest with the cookie scheme and 401; every operation behind a permission lists 403
    `INSUFFICIENT_ROLE`; error responses reference `ApiProblem`; `:id` operations have the path
    parameter `id`.
  - Fixtures: `addManager` joins through an invite; every existing suite passes with it.
  - Migrations: deploy and the drift check in global setup pass.
- **Unit, apps/web (node)**
  - Proxy: `/join` renders for `anonymous`, `expired` and `authenticated`, without a redirect; the
    other gate cells of spec 04 stay; `/login?next=/join` resolves to `/`.
  - Team prefetch: `/team` fills the members key the client hook reads; a failure → one `warn` line.
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
    → confirmation text, `DELETE`, the row gone, focus on "Members"; 409 `LAST_OWNER`, 404 and 403
    → their toasts and refetches; 500 → alert in the open removal dialog.
  - Rename: an owner sees "Rename"; a blank name → field error and no request; success → the header
    shows the new name without a refetch of `/me`; a manager does not see "Rename".
  - Client filters: the menu lists "Anyone", "Me" and the other members after opening, with one
    `GET /api/members`; choosing a member writes `createdBy=<id>` and the list path carries it;
    `?createdBy=me` checks "Me"; an unknown UUID shows "Former member" checked; `?createdBy=abc` and
    `?mine=true` filter nothing.
  - Main nav: `aria-current` on `/team`.
  - Login form: `NO_WORKSPACE` → the new message.
  - The default MSW handlers gain `GET /api/members` with the session user as the only member.
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
- [ ] The owner removes the manager: the manager's open tab goes to `/login` on its next request,
      login shows the `NO_WORKSPACE` message, a new invite with "Log in to join" brings them back.
- [ ] The only owner cannot demote or remove themselves: the menu item is disabled, and the API
      answers 409 (integration tests).
- [ ] Rename shows the new name in the header without a reload.
- [ ] `/clients?createdBy=<member id>` opened from a copied link shows that member's clients.
- [ ] The token never reaches a log line: the local API log and, after the merge, the Render log of
      a preview, a join and a create contain no token and no hash; the web request for `/join`
      carries no token.
- [ ] `browser-verify` over the screens of section 5 at both sizes and in both themes: no failed
      requests except the expected 401 before a refresh and the 404 of an invalid invite, no console
      errors except the browser's own line for those, no hydration warnings.
- [ ] Keyboard only: open the invite dialog, create and copy a link, change a role, remove a member
      through the dialog, revoke an invite, rename the workspace, join through a link in both modes;
      focus always visible.
- [ ] `@Roles` and `RolesGuard` are gone from the code; every restricted route uses
      `@RequirePermission`.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; the `image` smoke test
      applies the new migration in the container.
- [ ] Every tooling check from section 6 fails as described.
- [ ] No new dependencies; `dialog` comes from the CLI run of section 2; clean install has no engine,
      peer dependency or ignored build script warnings.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] One migration, `invites`, in the PR with the code that uses it.
- [ ] After the merge, the `main` run deploys by itself; the Render log shows the migration applied
      on Neon; on the live URL an invite is created, accepted in a private window, the member's role
      changed and the member removed; `browser-verify` against the live URL over the screens of
      section 5 passes.
- [ ] The ADR is written.
- [ ] This spec is part of the PR.
