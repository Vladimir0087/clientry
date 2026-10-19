# 0016 — Demo workspace

Status: accepted
Date: 2026-10-18

## Context

A recruiter or a client opens the live link and will not sign up, so the link only works if one
press shows a product already in use. The plan names one demo account with a filled pipeline,
rebuilt daily. That account is public: whatever its owner may do, any visitor may, including the
team actions that let one person take a workspace over (ADR 0013). The demo also has to read as
real history: clients, deals that moved through stages over months, tasks, reminders and a feed,
none of which the domain services can write in the past.

## Decision

- **One shared demo workspace, rebuilt every day.** `workspaces.is_demo` marks it; only the demo
  module sets the flag, always on one fixed workspace id. A daily `reset-demo` job on the `demo`
  queue replaces its records in one transaction.
- **A passwordless demo route.** `POST /api/auth/demo` with `{ role }` signs in the demo's
  earliest-joined member with that role and starts an ordinary session. The demo users hold the
  argon2 hash of random bytes nobody keeps, so no password opens them.
- **An owner entry and a manager entry.** The role table is the first question about auth, and a
  visitor sees it from both sides: Ann as the owner, Max as a manager who sees delete buttons only
  on his own records.
- **Team actions off in the demo.** `team.manage` and `workspace.manage` answer 403 `DEMO_LOCKED`
  there, after the role check, so invites, role changes, removals and the rename are impossible.
  `can({ role, isDemo }, permission)` in `packages/shared` is the one rule for the guard and the
  web; `hasPermission` keeps its meaning, the role alone. Stages and deletes stay on: they are what
  the demo shows, and the next reset repairs them.
- **The flag, not fixed ids, outside the demo module.** The auth module finds the demo by
  `is_demo`, and the access guard reads the flag with the membership in its one statement, as it
  reads the role, never from the token.
- **Rows written by the reset itself.** A pure builder turns data files of people, clients, deal
  stories and tasks into every row with times relative to the reset, parsing each activity and
  notification payload as it goes; the repository writes each table with one statement. Every
  record passes its create request schema in the builder's tests. This is the one writer outside
  the domain services.
- **Workspace, users and memberships kept across resets.** Visitors stay signed in, member ids in
  their URLs stay valid, and join dates only grow older; everything else is deleted and inserted
  again with new ids.
- **One workspace lock, taken first.** The reset locks the workspace row `FOR UPDATE`, which
  conflicts with the `KEY SHARE` of inserts' foreign key checks and with stage writes' workspace
  lock, so a write that arrives during a reset waits and lands in the new data.
- **A daily recurring job whose time drifts.** The in-process clock of ADR 0012 adds it; the first
  tick against a Valkey without the job's key resets at once, which also creates the demo on a new
  database. `prisma db seed` runs the same reset once, without the worker.

## Alternatives

- **A sandbox per visitor.** A workspace and five users per press, plus a cleanup job; more rows
  than the demo's purpose needs, and a script could fill the database. Rejected.
- **Public credentials on the login page.** A password in the page that also works on the login
  form, and a demo account anyone can type into. Rejected.
- **The owner entry alone.** Hides half of the role table. Rejected.
- **A read-only demo.** Nothing left to try. **Full access.** Anyone could invite a second
  account, make it an owner and remove the demo owner, so the next visitor's button would fail
  until the reset. Both rejected.
- **Fixed ids known to the auth module.** Couples auth to the demo's data files. Rejected.
- **Domain services for the reset.** They write only the present: no backdated history, and
  hundreds of transactions. Rejected.
- **Recreating the workspace and users each time.** Signs every visitor out and turns a write
  during the reset into a foreign key failure. Rejected.
- **Locking every table in the writers' order.** As member removal does; costs more than it saves
  for a sub-second window once a day. Rejected.
- **A reset at a fixed time of day.** Needs schedule state that survives Valkey, or hourly checks
  that wake Neon. Rejected.

## Consequences

- Visitors see each other's changes for up to a day; the banner on every page of the demo says so.
- The demo cannot show invites or role changes.
- A write already holding a demo row when the reset starts can deadlock with it: Postgres fails one
  side, the job retries, the visitor's request answers 500 once.
- A new table that references a workspace needs a line in the reset's deletes and inserts.
- Valkey holds three more connections, ten of fifty, and the reset can wake Neon once more a day.
