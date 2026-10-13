# 0013 — Team access

Status: accepted
Date: 2026-10-12

## Context

An owner must bring people into the workspace, change their roles and remove them, and the
product has two roles with a fixed matrix (owner and manager). There is no mail provider in v1,
so an invite cannot be emailed. A workspace must never be left without an owner, and a removed
member's open deals and tasks always have an assignee, so they cannot simply be orphaned. The
demo account will be public, so whatever an owner can do, anyone can.

## Decision

- **One-time invite links with hashed tokens.** An invite is 32 random bytes in base64url. Only
  its SHA-256 hash is stored, as with refresh tokens; the token is returned once, in the create
  response, and cannot be shown again. An invite lives 7 days, works once, and a workspace holds
  at most 20 pending ones. Joining claims the invite with a conditional update in the same
  transaction that creates the account or the membership.
- **Every invite joins as a manager.** There is no role on the invite; an owner is made by
  promoting a member the owners know.
- **The token travels in the URL fragment.** The link is `/join#<token>`; the page reads it in the
  browser and sends it only in request bodies.
- **A permission matrix in `packages/shared`.** `PERMISSIONS` maps each permission to the roles
  that hold it. `@RequirePermission` on a route and `PermissionsGuard` read it on the API, and
  `hasPermission` hides controls on the web. Rules that depend on the record stay in services.
- **The last-owner rule under the workspace row lock.** Role changes and removals lock the
  workspace row (`FOR NO KEY UPDATE`, as stage writes do), re-read the caller's role, then count
  owners. Invite create and revoke and the workspace rename take the same lock and re-read the
  caller's role too.
- **Handover on removal.** The owner picks a member who takes the removed member's open deals and
  tasks, deleted ones included. In the removal's transaction: open tasks are locked, the
  membership is deleted, deals (version + 1 and a history entry each) and tasks are handed over,
  the member's sessions and pending invites are revoked.
- **Invites go with the permission that made them.** Demoting an owner revokes the pending invites
  they created, in the role change's transaction, as removal does.

## Alternatives

- **Email invites.** Need a mail provider and a verified domain. Deferred to v2.
- **Stored tokens that can be shown again.** A database leak would hand out working links.
  Rejected.
- **A role on the invite.** A leaked owner link would hand over the team, since an owner can
  remove other owners. Rejected.
- **The token in the path or the query.** It would reach the request logs of Netlify, Render and
  the API, and the `Referer` header. Rejected.
- **Role lists on routes (`@Roles`).** Moving an action between roles touches every route that
  lists it, and the web keeps its own copy. Replaced.
- **An unlocked owner count.** Two owners demoting each other at once would both see two owners
  and leave none. Rejected.
- **A database trigger for the last owner.** Moves the rule out of the service and its unit tests.
  Rejected.
- **Leaving open work on the removed member, or moving it to the remover.** The first stalls it:
  reminders to a non-member are skipped and nobody sees the cards as theirs. The second decides
  for the owner. Rejected.

## Consequences

- A lost link is revoked and replaced, never re-sent.
- `@RequirePermission` supersedes `@Roles` of ADR 0005, and removal now revokes the member's
  sessions, superseding that ADR's remark that it needs none: a session left on a device would
  come back to life if the person were invited again.
- The workspaces module reaches deals, tasks and sessions only through `DealHandover`,
  `TaskHandover` and `SessionRevocation`, which those modules export; each runs in the caller's
  transaction.
- The removal's lock order (tasks, then the membership, then deals) follows task edits, reminder
  delivery and deal writes. The one cycle left, a task assigned to the member while the removal
  runs and delivered at that moment, ends in a deadlock error that the removal retries once; the
  number of statements does not grow with the number of records handed over.
- Reopening a closed deal or a done task checks that its assignee is still a member, so a removed
  member's history cannot turn back into open work on them.
- An account belongs to one workspace: a member cannot join a second one, and a removed member
  comes back only through a new invite with "Log in to join".
