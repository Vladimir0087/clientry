# Changelog

Notable changes to Clientry. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-24

The first release: a lightweight CRM for a small team, live at
[clientry.netlify.app](https://clientry.netlify.app).

### Added

- **Accounts and sessions**: sign-up creates a workspace with default stages and makes its creator
  the owner; ES256 access tokens and rotating refresh tokens in httpOnly cookies, with reuse
  detection and rate limits ([spec 03](docs/specs/03-auth.md)).
- **Clients**: contacts with notes, tags and a source; search and filters kept in the URL, cursor
  pages, soft delete with an undo ([spec 06](docs/specs/06-clients.md)).
- **Deals**: a board of the workspace's stages; a deal moves by drag and drop, by keyboard or from
  a menu, its history is written in the same transaction, and a record version stops two people
  from overwriting each other; the owner shapes the stages ([spec 07](docs/specs/07-deals.md)).
- **Tasks and reminders**: follow-ups with a due time, an assignee and an optional client or deal;
  an in-app reminder at the chosen time, delivered once by a BullMQ worker, also after Valkey loses
  its data ([spec 08](docs/specs/08-tasks-reminders.md)).
- **Team and roles**: one-time invite links, role changes, member removal with a handover of open
  deals and tasks, and one permission matrix for the owner and managers
  ([spec 09](docs/specs/09-team.md)).
- **Dashboard**: open deals by stage, money in the pipeline, deals won and the win rate over six
  months, who works on what, and the team's activity feed ([spec 10](docs/specs/10-dashboard.md)).
- **Demo**: "Explore the demo" signs a visitor into a filled web studio as its owner or a manager;
  team actions are locked there and the data is rebuilt every day
  ([spec 12](docs/specs/12-seed-demo.md)).
- **Web**: Next.js behind a same-origin proxy to the API, one shared refresh for concurrent
  requests, a light and a dark theme, and a layout that works on a phone
  ([spec 04](docs/specs/04-web-foundation.md)).
- **API foundation**: validated configuration, structured logs with request ids, liveness apart
  from readiness, problem details for every error, and Swagger
  ([spec 02](docs/specs/02-api-foundation.md)).
- **Delivery**: CI runs lint, types, unit, integration and end-to-end tests with axe, then deploys
  the tested image digest to Render and the web to Netlify, all in Ohio, and tours the live demo
  ([spec 01](docs/specs/01-monorepo.md), [spec 05](docs/specs/05-deploy-stage-1.md),
  [spec 11](docs/specs/11-backend-region.md), [spec 13](docs/specs/13-e2e-ci.md),
  [spec 14](docs/specs/14-launch.md)).

[1.0.0]: https://github.com/Vladimir0087/clientry/releases/tag/v1.0.0
