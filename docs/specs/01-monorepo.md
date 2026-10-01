# 01 — Monorepo

Status: approved

## 1. Goal

A pnpm + Turborepo monorepo with shared TypeScript and ESLint configs, local Postgres and Valkey
in Docker Compose, commit hooks, and a CI pipeline that blocks a PR on lint, format, type or
test errors, so every later spec only adds code, not tooling.

## 2. In scope / Out of scope

### In scope

**Repository layout**

```
.github/
  actions/setup/action.yml     # Node + pnpm + install, reused by every CI job
  workflows/ci.yml
  workflows/pr-title.yml
.husky/
  pre-commit                   # lint-staged
  commit-msg                   # commitlint
apps/                          # api (spec 02), web (spec 04)
docs/
  adr/
    0000-template.md
    0001-monorepo-tooling.md
  specs/
packages/
  typescript-config/           # @clientry/typescript-config
  eslint-config/               # @clientry/eslint-config
  shared/                      # @clientry/shared
compose.yaml
.env.example
commitlint.config.mjs
prettier.config.mjs
.prettierignore
package.json
pnpm-workspace.yaml
turbo.json
```

**Package manager and runtime**

- pnpm workspaces (`apps/*`, `packages/*`). pnpm version pinned in the root `packageManager`
  field; CI reads it from there.
- Node version comes from the existing `.nvmrc` (`26`), mirrored as `engines.node: ">=26"`;
  CI reads `.nvmrc`.
- Dependencies are saved with exact versions; the lockfile is the single source of resolved
  versions.
- Dependency lifecycle scripts are blocked by default and allowed only through an explicit
  allowlist in `pnpm-workspace.yaml`.
- All tools use the latest stable release at implementation time (no rc/beta); config syntax
  is checked against current docs, not memory.

**Turborepo**

| Task        | Depends on | Cached | Notes                                     |
| ----------- | ---------- | ------ | ----------------------------------------- |
| `build`     | `^build`   | yes    | outputs `dist/**`                         |
| `typecheck` | `^build`   | yes    | `tsc --noEmit`                            |
| `lint`      | `^build`   | yes    | typed linting needs dependencies' `.d.ts` |
| `test`      | `^build`   | yes    |                                           |
| `dev`       | —          | no     | persistent                                |

No remote cache. In this spec only `@clientry/shared` defines these tasks; the config packages
have none.

**TypeScript: `@clientry/typescript-config`**

- `base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `isolatedModules`, `forceConsistentCasingInFileNames`,
  `skipLibCheck`, target and lib matching the Node version.
- `library.json` (extends base): `module`/`moduleResolution` `NodeNext`, declarations and
  declaration maps, for compiled packages.
- Presets for Nest and Next are added by specs 02 and 04.

**ESLint: `@clientry/eslint-config`**

Flat config written as plain ESM JavaScript, one `base` export; each package has its own
`eslint.config.mjs` that extends it. Typed linting uses `parserOptions.projectService`.
Nest and Next presets (including FSD slice boundaries) are added by specs 02 and 04.
Root config files (`*.config.mjs`) are covered by Prettier only.

`base` enforces the code style rules that a linter can check:

- typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`.
- No `any`, no non-null assertion, no empty `catch`, no `console`.
- Explicit return types on exported functions (`explicit-module-boundary-types`).
- `interface` for object shapes (`consistent-type-definitions`).
- Boolean variables and parameters prefixed with `is`/`has`/`can`/`should` (`naming-convention`).
- Import order (libraries → internal packages → relative) and no import cycles
  (`eslint-plugin-import-x`: `order`, `no-cycle`, TypeScript resolver). `@clientry/*` is the
  internal group.
- Kebab-case file names (`unicorn/filename-case`, the only unicorn rule enabled).
- Files up to 400 lines of code (`max-lines`, blank and comment lines not counted), test files
  (`*.spec.ts`, `*.spec.tsx`) exempt. A justified exception is an
  `eslint-disable max-lines -- <reason>` at the top of the file. Function length stays a review
  concern: JSX components and test suites give false positives.
- `eslint-config-prettier` last, so ESLint never reports formatting.
- Lint runs with `--max-warnings 0`.

**Prettier**

Root `prettier.config.mjs`: single quotes, trailing commas everywhere, print width 100, semicolons.
`.prettierignore` covers build output, lockfile and generated files. Prettier also skips
everything in `.gitignore`.

**`@clientry/shared`**

- Compiled internal package: `tsc` to `dist/` as ESM with declarations. Compiled rather than
  consumed as raw TS, because the Nest build does not transpile workspace dependencies.
- Domain entry points only through `exports` in `package.json`; no root `"."` entry, so
  `import ... from '@clientry/shared'` fails at typecheck.
- Two tsconfigs: `tsconfig.json` for typecheck (sources and tests), `tsconfig.build.json` for
  emit (sources only, `*.spec.ts` excluded). Scripts: `build`, `dev` (`tsc --watch`), `lint`,
  `typecheck`, `test`.
- zod: latest stable major that `nestjs-zod` also supports, since spec 02 builds on it.
- First entry point `@clientry/shared/common`, source `src/common/index.ts` re-exporting
  `src/common/problem-details.ts`. It exports `problemDetailsSchema` and
  `type ProblemDetails = z.infer<...>`, the error response body in RFC 9457 problem details
  format (successor of RFC 7807, same core fields):
  - required: `type` (string), `title` (string), `status` (integer 100–599);
  - optional: `detail` (string), `instance` (string);
  - unknown members allowed, as RFC 9457 requires clients to ignore extensions.

  Spec 02's exception filter produces it, spec 04's api client parses it. Extensions
  (field-level validation errors, request id) are defined in spec 02.

- Vitest, tests colocated as `*.spec.ts`. It is the package that exercises every Turborepo
  task end to end, until the apps exist.

**Docker Compose (`compose.yaml`)**

- Compose project `name: clientry`.
- `postgres`: official `postgres:18` image (Neon's default major), named volume,
  `pg_isready` healthcheck.
- `valkey`: official `valkey/valkey:8.1` image (the version Render Key Value runs).
  Valkey is a Redis-compatible fork; BullMQ and ioredis connect to it over the Redis protocol.
  Persistence disabled to match the free hosted instance, so losing it locally behaves like
  production. `valkey-cli ping` healthcheck.
- Ports bound to `127.0.0.1` only. Credentials and ports read from `.env` with defaults in
  `compose.yaml`, so `docker compose up -d` works without a `.env` file.
- `.env.example` lists the Compose variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB`, `POSTGRES_PORT`, `VALKEY_PORT`. App variables (`DATABASE_URL`, `REDIS_URL`) are
  added by spec 02 together with the code that reads them.

**Commit hooks**

- husky, installed through the `prepare` script.
- `pre-commit`: lint-staged runs Prettier on all staged files and ESLint `--fix` on staged
  `{apps,packages}/**/*.{ts,tsx}` (the root has no ESLint config). No typecheck in the hook,
  CI covers it.
- `commit-msg`: commitlint with `@commitlint/config-conventional`. Scopes are not used: one
  commit covers a whole spec, which usually touches several packages.

**CI (`.github/workflows/ci.yml`)**

- Triggers: `pull_request` (default types) and `push` to `main`. `permissions: contents: read`.
  Job timeout 10 minutes.
- `concurrency`: pull request runs are grouped by ref with `cancel-in-progress`, so a new push
  cancels the superseded run. Pushes to `main` are grouped by `github.sha`, so every one of them
  runs to completion; otherwise a queued run would be cancelled by the next push.
- A local composite action sets up Node from `.nvmrc`, pnpm from `packageManager`, the pnpm
  store cache, and runs `pnpm install --frozen-lockfile` with `HUSKY=0`, so the `prepare` script
  does not install git hooks on the runner.
- Jobs, each a separate status check:
  - `lint`: `pnpm lint` and `pnpm format:check`.
  - `typecheck`: `pnpm typecheck`.
  - `test`: `pnpm build` and `pnpm test`. Turborepo's `^build` only builds dependencies, so without
    this step the shared package itself would never be built in CI.

**PR title (`.github/workflows/pr-title.yml`)**

- A separate workflow, so that it never shares a concurrency group with the code checks: if it
  lived in `ci.yml`, renaming a PR while `lint` or `test` were running would cancel them and
  leave the PR green with nothing verified.
- Listens to `pull_request` with `opened`, `edited`, `synchronize`, `reopened`, so renaming the
  PR reruns the check. The title passes commitlint: with squash merge the PR title becomes the
  commit on `main`, so it follows the same rules as local commits. The title reaches the script
  through an `env` variable, never through `${{ }}` interpolation inside `run`, to avoid shell
  injection.

**Architecture decision records**

- `docs/adr/0000-template.md`: sections Context, Decision, Alternatives, Consequences;
  half a page per record.
- `docs/adr/0001-monorepo-tooling.md`: pnpm + Turborepo over npm/yarn workspaces and Nx;
  compiled `@clientry/shared` over raw TS source.
- Later specs add a record for each decision that has real alternatives.

**Repository hygiene**

- `.gitignore`: `README.md` becomes `/README.md`, so only the root README is hidden and package
  READMEs are tracked.

### Out of scope

- `apps/api`, Prisma, Nest ESLint and TS presets, Vitest setup for Nest (spec 02).
- `apps/web`, Next ESLint and TS presets, FSD boundaries lint (spec 04).
- Dockerfiles and the Compose `full` profile (added with the apps they build).
- Deployment and hosting environment variables (spec 05).
- Playwright and e2e in CI (spec 12). Image build in CI (spec 05).
- README (spec 13), changelog and release tooling.
- Turborepo remote cache.
- Automated dependency updates, PR template, branch protection.

## 3. Data model

None. Postgres runs empty; the first migration comes with spec 02.

## 4. API

No HTTP API. The developer-facing contract of this spec is the set of root scripts:

| Script              | Does                             |
| ------------------- | -------------------------------- |
| `pnpm dev`          | `turbo run dev`                  |
| `pnpm build`        | `turbo run build`                |
| `pnpm lint`         | `turbo run lint`                 |
| `pnpm typecheck`    | `turbo run typecheck`            |
| `pnpm test`         | `turbo run test`                 |
| `pnpm format`       | Prettier write on the whole repo |
| `pnpm format:check` | Prettier check on the whole repo |
| `pnpm infra:up`     | `docker compose up -d --wait`    |
| `pnpm infra:down`   | `docker compose down`            |

Shared contract introduced: `@clientry/shared/common` exports the problem details schema and its
inferred type.

## 5. UI

None.

## 6. Tests

- **Unit** (`problem-details.spec.ts`): the schema accepts a minimal valid body, accepts a body
  with unknown extension members and keeps them, rejects a body without `status`, rejects a
  non-integer or out-of-range `status`, rejects a non-object.
- **Integration / e2e**: none, nothing to integrate yet.
- **Tooling checks**, done manually once on a throwaway file that is not committed; each must
  fail with the named rule:
  - `any`, non-null assertion, empty `catch`, `console.log`;
  - an import cycle between two files;
  - a `PascalCase.ts` file name;
  - `import ... from '@clientry/shared'` (typecheck error);
  - a commit message `update stuff` (commit-msg hook);
  - a PR titled `Update stuff` (`pr-title` job).

## 7. Acceptance criteria

- [ ] Clean clone + `pnpm install` works with Node from `.nvmrc` and pnpm from `packageManager`,
      with no engine or peer dependency warnings.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally.
- [ ] Second `pnpm build` without changes is a full Turborepo cache hit.
- [ ] `pnpm infra:up` brings both containers to `healthy`; Postgres data survives
      `pnpm infra:down` + `pnpm infra:up`; `docker compose ps` shows ports bound to `127.0.0.1`.
- [ ] `pre-commit` formats and lints staged files; `commit-msg` rejects a non-conventional
      message and accepts `feat: ...`.
- [ ] Every tooling check from section 6 fails as described.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `pr-title` green; a rerun restores the pnpm
      store from cache.
- [ ] No `.env` in the repo; `.env.example` is present.
- [ ] All dependencies are the latest stable versions at implementation time, exact-pinned.
      TypeScript stays on the latest major that typescript-eslint supports (ADR 0001).
- [ ] This spec is part of the PR.
