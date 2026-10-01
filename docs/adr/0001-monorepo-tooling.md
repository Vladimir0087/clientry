# 0001 — Monorepo tooling

Status: accepted
Date: 2026-09-30

## Context

Clientry is a Nest API and a Next web app that validate with the same zod schemas. Both apps
and the shared schemas must build, lint and test together, with one lockfile and one CI.

## Decision

- **pnpm workspaces** for packages and **Turborepo** for task orchestration and local caching.
- **`@clientry/shared` is a compiled package**: `tsc` emits ESM with declarations to `dist/`,
  and apps consume the output through domain entry points in `exports`.

## Alternatives

- **npm or yarn workspaces.** npm hoists everything, so a package can import a dependency it
  never declared. pnpm's strict `node_modules`, content-addressable store and build-script
  allowlist remove that class of bugs and speed up installs.
- **Nx.** Stronger generators and project graph, but it brings its own plugins and conventions
  on top of Nest and Next. Two apps and one shared package do not need that; Turborepo is a
  thin task runner over plain `package.json` scripts.
- **Shared as raw TypeScript source** (internal package without a build). Next can transpile
  workspace packages, but the Nest build does not, so the API would need path aliases or a
  bundler. A compiled package behaves like any npm dependency in both apps.

## Consequences

- Apps depend on `^build`, so shared is always built before them; Turborepo caches that build.
- In development `pnpm dev` runs `tsc --watch` for shared next to the apps.
- Importing the package root (`@clientry/shared`) fails at typecheck: every domain has its own
  entry point, which keeps bundles and dependency edges small.
- TypeScript stays within the range typescript-eslint supports (6.0 while 7 is out); the
  `typescript` peer range in `@clientry/eslint-config` enforces it.
