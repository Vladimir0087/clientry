# 0002 — Backend architecture

Status: accepted
Date: 2026-10-01

## Context

Clientry needs an HTTP API with auth and roles, background jobs for reminders and a live
Swagger contract, consumed by a Next.js web app. The structure has to stay readable as a dozen
feature modules land, and tenant isolation has to come from the code layout, not from
reviewers remembering to add a `workspaceId` filter.

## Decision

- **A separate NestJS API** (`apps/api`) next to the Next.js app, not API routes inside Next.
- **A modular monolith**: one module per domain under `src/modules`, each layered
  controller → service → repository. Prisma is reachable only from repositories and
  `src/infra/prisma`; services throw domain errors and never import HTTP exceptions. Both rules
  are enforced by ESLint.
- **Repositories behind a contract**: each repository is an abstract class used as the DI token,
  implemented with Prisma (`PrismaHealthRepository`) and bound with `useClass`. Services and
  their unit tests depend only on the abstract class, so a test passes a plain object that the
  compiler checks against it. An abstract class rather than an interface, because Nest injects
  by a runtime token.
- Cross-cutting concerns use Nest's own mechanisms: a global validation pipe and response
  serializer, one exception filter that answers RFC 9457 problem details, and pino logging
  bound to the request id. Configuration is parsed once at startup by a zod schema.
- The BullMQ worker will run in the same process as the API.

## Alternatives

- **Next.js fullstack** (route handlers and server actions). Free hosting with no cold start,
  but no long-lived process for queue workers, no DI or guards, and weaker evidence for backend
  roles. Rejected.
- **Hexagonal / onion architecture.** Ports and mappers for every CRUD module double the code
  without a second adapter to justify them. Rejected; the repository boundary keeps the one
  benefit that matters here, services tested without a database.
- **DDD with CQRS.** Separate read and write models and buses do not pay off for a CRM of this
  size. Rejected.
- **Microservices.** One team, one database and a free hosting tier with one service. Rejected.

## Consequences

- Every feature spec adds a module and reuses the pipeline: validation, serialization, error
  format, logging and Swagger come for free.
- Repository methods take `workspaceId` first, from the auth context only.
- The API and the worker scale together; splitting the worker out later means moving one module
  to a second entry point.
- The API sleeps on the free hosting tier; a pinger on `/health/live` keeps it warm.
