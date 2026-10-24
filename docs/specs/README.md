# Specs

Clientry is built one spec at a time. A spec is written and approved before any code, and each one
ships as a single pull request with the spec inside it, so the pull request can be reviewed against
what was agreed.

Every spec has the same seven sections:

1. **Goal**: one sentence on what the product gains.
2. **In scope / out of scope**, with the files the change touches.
3. **Data model**: tables and migrations.
4. **API**: endpoints and the schemas in `packages/shared`.
5. **UI**: screens and their states.
6. **Tests** at each level.
7. **Acceptance criteria**: the checklist the pull request merges by.

Decisions with lasting consequences go to an [architecture decision record](../adr) in the same
pull request.

## The plan

Specs cite "the plan" or "plan section N": the project's internal product brief, which is not
published. It fixed the product, the scope of v1, the data model, the stack and the order of the
specs below. Its five product scenarios are those of the README's
[What it does](../../README.md#what-it-does): a manager adds a client, moves a deal through the
pipeline and sets a task with a reminder; the owner reads the dashboard, invites a manager and
shapes the stages.

## Index

| Spec                                            | What it delivered                                                 | State    |
| ----------------------------------------------- | ----------------------------------------------------------------- | -------- |
| [01 Monorepo](01-monorepo.md)                   | pnpm and Turborepo, shared configs, Docker Compose, hooks, CI     | Shipped  |
| [02 API foundation](02-api-foundation.md)       | Nest, config, Prisma, logs, probes, problem details, Swagger      | Shipped  |
| [03 Auth](03-auth.md)                           | registration with a workspace, sessions, rotating refresh, guards | Shipped  |
| [04 Web foundation](04-web-foundation.md)       | Next.js, the same-origin proxy, UI kit, data layer, auth screens  | Shipped  |
| [05 Deploy, stage 1](05-deploy-stage-1.md)      | free hosting on Netlify, Render and Neon; deploys from CI         | Shipped  |
| [06 Clients](06-clients.md)                     | clients with search, filters, tags, cursor pages, soft delete     | Shipped  |
| [07 Deals](07-deals.md)                         | stages and the deal board, moves with history, record versions    | Shipped  |
| [08 Tasks and reminders](08-tasks-reminders.md) | tasks, reminders delivered once by a BullMQ worker, the bell      | Shipped  |
| [09 Team](09-team.md)                           | invite links, roles, member removal, the permission matrix        | Shipped  |
| [10 Dashboard](10-dashboard.md)                 | pipeline, revenue and win rate, the team, the activity feed       | Shipped  |
| [11 Backend region](11-backend-region.md)       | the API and data moved to Ohio, next to the web's function        | Shipped  |
| [12 Seed and demo](12-seed-demo.md)             | the demo studio, "Explore the demo", the daily rebuild            | Shipped  |
| [13 End-to-end tests and full CI](13-e2e-ci.md) | Playwright scenarios, axe, deploys gated on e2e, the live tour    | Shipped  |
| [14 Launch](14-launch.md)                       | the public repository, README and media, the ruleset on `main`    | Shipped  |
| [15 Deploy, stage 2](15-deploy-stage-2.md)      | the API on a free virtual machine of its own                      | Deferred |
| [16 Finishing v1](16-v1-finish.md)              | deferred fixes, docs that match the live setup, release 1.0.0     | Shipped  |

Spec 15 is optional: the demo runs well on stage 1, and the spec lists when it would be picked up.
