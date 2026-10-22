# 14 — Launch

Status: approved

## 1. Goal

The repository goes public with an English README that works as the project's landing page: the
live demo, an animated tour, screenshots, the architecture, the decisions and how to run it; and
`main` takes changes only through pull requests whose checks pass, with the deploy secrets
reachable from `main` alone.

## 2. In scope / Out of scope

### In scope

**Layout**

```
README.md                                   # tracked from now on, rewritten in English
.gitignore                                  # README.md tracked; internal notes stay ignored
package.json                                # media, dev:setup
turbo.json                                  # the media task
scripts/dev-setup.ts                        # .env with a key pair, infrastructure, migrations
apps/e2e/
  package.json                              # media; sharp
  playwright.media.config.ts                # the local stack, one worker, writes docs/media
  media/
    readme.spec.ts                          # the stills, the tour, the social preview
  support/
    recorder.ts                             # frames with their timing, encoded as a GIF
    pointer.ts                              # a drawn pointer: headless frames show none
docs/media/                                 # demo.gif, the stills, social-preview.png
docs/specs/README.md                        # how specs work, the index, what "the plan" is
docs/deployment.md                          # the production environment, the ruleset, the public repository and image
docs/testing.md                             # pnpm media
docs/adr/0018-public-repository.md
.github/workflows/ci.yml                    # the deploy jobs run in the production environment
```

**README**

Written for a visitor who reads the first screen only: by its end they know what the product is
and have the demo link. It presents Clientry as a product.
It says only what the repository already shows, and no counts that go stale (tests, endpoints,
lines).

1. **Title and badges.** "Clientry", one line: a lightweight CRM for small teams, with clients, a
   deal pipeline, tasks with reminders and a team with roles. Three badges: CI on `main` (`ci.yml`,
   push events, so a manual run does not color it), License MIT, and a static "Live demo" badge
   linking to the web.
2. **Live demo.** `https://clientry.netlify.app`, "Explore the demo" signs in without sign-up, as
   the owner or a manager; the demo is shared and rebuilt daily, so changes last a day at most. The
   API reference at `/api/docs` (Swagger UI).
3. **Tour.** `docs/media/demo.gif`.
4. **What it does.** Clients, deals, tasks and reminders, team and roles, dashboard, demo: one line
   each, as the user sees it.
5. **Screenshots.** The stills in a two-column table, each with a caption.
6. **Architecture.** The mermaid diagram of `docs/deployment.md` plus `packages/shared` feeding
   both apps; four lines: modular monolith (controller → service → repository, Prisma behind the
   repository), light Feature-Sliced Design on the web, one zod contract for both sides, the worker
   in the API's process.
7. **Engineering highlights.** One line each, linking its ADR or spec: tenant isolation by
   `workspaceId` from the session only and 404 for other workspaces' records; refresh rotation with
   reuse detection, ES256 tokens in httpOnly cookies, one origin through the web's rewrite; the
   deal move and its activity entry in one transaction, the optimistic board with rollback;
   reminders delivered exactly once with Postgres as the source of truth; cursor pagination and
   trigram search; RFC 7807 errors; request ids and structured logs, liveness apart from
   readiness; the demo locked against takeover and rebuilt daily.
8. **Tech stack.** A table by layer, the libraries the code really uses (Valkey, not Redis;
   Standard Schema in Nest 12, not nestjs-zod).
9. **Run it locally.** Requirements: Node 24 or newer, pnpm, Docker. The commands, the ports
   (3000, 4000, 5432, 6379) and what to change in `.env` when one is taken; the local demo appears
   on the API's first start.
10. **Tests.** The three levels in one line each, `pnpm test` and `pnpm e2e`, a link to
    `docs/testing.md`.
11. **Deployment.** Free hosting in one region (Ohio), CI deploys the tested image digest, the
    end-to-end gate and the live tour; a link to `docs/deployment.md`.
12. **Decisions.** The 18 ADRs as a table, number and decision in one line, inside a collapsed
    block; how the project is built: a spec before code, one spec per pull request, linked to
    `docs/specs`.
13. **Roadmap.** The v2 list: realtime board and bell over WebSocket, custom fields, email
    notifications, several workspaces per user and workspace deletion, CSV import, a Telegram bot,
    test-mode subscriptions.
14. **License.** MIT.

Prettier formats it like any other file once it leaves `.gitignore`.

**Media**

`pnpm media` builds the API and the web, starts the e2e stack (spec 13) and writes `docs/media/`,
replacing what is there. The local stack builds the same studio as the live demo, and the tour
drags a deal, which the shared live demo must not get. Run by hand when the interface changes, and
the files are committed; neither CI nor `pnpm e2e` runs it.

| File                 | What                                                        | Theme | Viewport                   |
| -------------------- | ----------------------------------------------------------- | ----- | -------------------------- |
| `demo.gif`           | the tour below                                              | light | 1280×800, encoded 960 wide |
| `dashboard.png`      | the owner's dashboard: tiles, both charts, the feed         | light | 1280×800                   |
| `board.png`          | the deal board, every open stage with cards                 | dark  | 1280×800                   |
| `client.png`         | a client's card with its deals and tasks                    | light | 1280×800                   |
| `tasks.png`          | the task list with overdue and due-today tasks              | dark  | 1280×800                   |
| `phone.png`          | the board on a phone, scrolled to show columns side by side | light | 390×844 at device scale 2  |
| `social-preview.png` | the dashboard's top, for GitHub's link previews             | light | 1280×640                   |

- Stills open as the demo owner and wait for their page's loaded content from
  `support/screens.ts`, so no skeleton is ever captured. PNGs are compressed with sharp, each
  under 400 KB.
- The tour, about 15–20 s: the login page, the pointer presses "Explore the demo"; the dashboard;
  the board, a deal dragged from Call to Proposal sent; the deal, its history listing the move; the
  bell with its unread count, the notification list.
- Frames are captured while the tour runs, with their real timing, so loading and the drag look as
  they do for a user. A small pointer drawn into the page follows the mouse: headless screenshots
  show none. sharp joins the frames into a looping GIF under 5 MB.
- sharp 0.35.5 is already in the lockfile through Next; it becomes a pinned dev dependency of
  `@clientry/e2e`. No ffmpeg or other tool on the machine.
- The social preview is uploaded by the owner: Settings → General → Social preview.

**Local start**

`pnpm dev:setup` runs `scripts/dev-setup.ts` with Node, and is safe to run again:

1. no `.env`: copies `.env.example` and fills `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` with a fresh
   pair from the generator behind `jwt:keygen`; an existing `.env` is never changed, and when either
   key is empty there, it stops and says how to fill it;
2. `docker compose up -d --wait`;
3. `pnpm --filter @clientry/api db:deploy`;
4. prints the next step: `pnpm dev`, then `http://localhost:3000` and "Explore the demo".

The README's start is then `pnpm install`, `pnpm dev:setup`, `pnpm dev`. `setup` alone would not
do: `pnpm setup` is a built-in pnpm command and never reaches the script.

**Deploy environment**

Promised in `docs/deployment.md` (spec 05) for the day the repository is public:

- An environment `production`, deployments from `main` only, no reviewers or wait timer.
- `RENDER_DEPLOY_HOOK_URL` and `NETLIFY_AUTH_TOKEN` move into it and leave the repository level.
  The variables stay at repository level: none is a secret.
- `deploy-api` and `deploy-web` run in it; `deploy-web` sets its URL to `WEB_PUBLIC_URL`, so the
  repository page links the live demo under Deployments.
- A manual run on another branch with deploy checked is refused by the environment; with deploy off
  it still publishes the image. The workflow's comments and `docs/deployment.md` say so.

**Ruleset on `main`**

Branch protection needs a public repository on GitHub Free (spec 13). A ruleset, not classic
branch protection: the rules sit in one place and can be exported as JSON.

| Rule                 | Setting                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| Target               | the default branch                                                          |
| Bypass               | nobody, the owner included                                                  |
| Deletion, force push | blocked                                                                     |
| Linear history       | required                                                                    |
| Pull request         | required, 0 approvals, squash merges only                                   |
| Status checks        | `lint`, `typecheck`, `test`, `e2e`, `image`, `pr-title` from GitHub Actions |
| Branch up to date    | required                                                                    |

Repository settings next to it: squash merging only, the squash commit's title from the pull
request's title (commitlint checks it); head branches deleted after merge.

- With no bypass, a red pull request has no "merge anyway" button and nobody pushes to `main`. When
  CI fails for a reason outside the code (an outage of GitHub, a host), the owner, as the
  repository's admin, disables the ruleset for that merge and enables it again.
- With branches kept up to date, a pull request opened before another one merged takes `main` in
  ("Update branch") and runs its checks again before it merges.

**Going public**

The owner's steps, in this order, after this pull request is green and before it merges:

1. History check, repeated with the commands from the PR description: on 2026-10-20 the 43 commits
   held no `.env` but `.env.example`, no private key and no token pattern of GitHub, Netlify, Render
   or Neon.
2. Settings → General → visibility: public.
3. Security: secret scanning and push protection on (free for public repositories).
4. Actions → General: approval required for workflow runs from all outside contributors.
5. The `production` environment and the secrets' move.
6. The ruleset and the merge settings.
7. About: description, website `https://clientry.netlify.app`, topics; the social preview.
8. Merge this pull request: the first one through the ruleset.
9. The image, once the `main` run has deployed: see Image.

**Image**

The GHCR package becomes public, so Render pulls it without a registry credential, and the classic
`read:packages` token, one of the two credentials that expire, goes. The image holds the built API
and its production dependencies; secrets reach it only at runtime, and its code is public anyway.

1. GHCR → the package's settings → visibility: public.
2. Render → the service → Settings → Image: no credential; Save only.
3. A manual run on `main` with deploy checked: Render pulls the digest without a credential.
4. Render → Workspace settings → Registry credentials: delete the GHCR one; GitHub: delete the
   classic token.

**Specs index**

`docs/specs/README.md`: a spec is written and approved before code, one per pull request, seven
sections; the list of specs with their state (15 is deferred). "The plan" that specs cite is the
project's internal product brief, which is not published; its scenarios are the README's product
section.

**Documentation**

- `docs/deployment.md`: the environment in step 8 of the setup and in redeploys (main only); the
  ruleset and its checks; CI minutes free on a public repository; the public image: the first
  image is made public, setup step 5 (the registry credential) goes, and the GHCR token leaves
  Expiry and rotation.
- `docs/testing.md`: `pnpm media`, what it writes, when to run it.

**Architecture decision record**

- `0018-public-repository.md`: a ruleset over classic branch protection; every CI job as a required
  check, `e2e` included, over a faster subset (nothing reaches `main` that would not deploy); squash
  merges and linear history (one commit per pull request, its title checked); deploy secrets in an
  environment limited to `main` over repository secrets (no other branch can deploy or read them);
  a public image over a private one behind a registry credential (one expiring token fewer, the code
  is public anyway); scripted README media over hand-made captures (rerun when the interface
  changes, same data every time). Consequences: a fix reaches `main` only through a pull request
  and its e2e run; deploys start from `main` only.

### Out of scope

- The account button's initials and the menu's prefetch, deferred from spec 13 to their own pull
  requests.
- A changelog and a GitHub release; they can follow in a later pull request.
- Contributing guide, issue and pull request templates, CODEOWNERS, a code of conduct, SECURITY.md.
- A license change: MIT stays.
- Code scanning and automated dependency updates.
- A custom domain; the README in other languages.
- Media in CI, a check that they are current, visual regression.
- A link checker in CI.
- Any change to the app's behavior.
- Spec 15.

## 3. Data model

No tables and no migration.

## 4. API

No changes. Root scripts:

| Script           | Does                                                               |
| ---------------- | ------------------------------------------------------------------ |
| `pnpm media`     | `turbo run media`: builds the API and the web, writes `docs/media` |
| `pnpm dev:setup` | `.env` with a key pair, infrastructure up, migrations              |

`@clientry/e2e` gains `media`: `playwright test --config playwright.media.config.ts`.

## 5. UI

No changes.

## 6. Tests

- Every existing suite passes unchanged; no app code changes.
- `pnpm media`, run twice: every file of the table is written within its budget, the second run
  replaces them, and afterwards no container, process or port of the run is left.
- `pnpm dev:setup`, once on a fresh clone with the development containers stopped:
  `.env` is created with a working key pair, `pnpm dev` serves the demo; a second run changes
  nothing; with an empty key in `.env` it stops naming it.
- The environment, once: the `main` run after the merge deploys through `production`; a manual run
  on a branch with deploy checked is refused at `deploy-api`.

## 7. Acceptance criteria

- [ ] The README is tracked, in English, renders on GitHub: the mermaid diagram, the GIF, the
      stills, the badges (CI passing), and every relative link opens.
- [ ] `docs/PLAN.md`, `docs/FLOW.md`, `CLAUDE.md` and `.claude/` stay ignored and untracked.
- [ ] `docs/media` holds every file of the media table within its budget, produced by `pnpm media`.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      lint covers `apps/e2e/media`.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `e2e`, `pr-title` green.
- [ ] The repository is public; secret scanning and push protection are on; outside contributors'
      runs need approval.
- [ ] The ruleset is active: this PR's page lists the six checks as required; merges are squash
      only.
- [ ] The deploy secrets live only in `production`, limited to `main`; the repository page shows
      the deployment with the live URL.
- [ ] About: description, website and topics are set; the social preview is uploaded.
- [ ] The image is public; Render pulls it without a credential; Render's registry credential and
      the classic token are deleted.
- [ ] On a fresh clone, `pnpm install`, `pnpm dev:setup` and `pnpm dev` give a working local demo.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] After the merge, the `main` run passes, deploys through `production`, and the live tour
      passes; the demo works at the live URL.
- [ ] `docs/deployment.md`, `docs/testing.md` and `docs/specs/README.md` are updated; ADR 0018 is
      written.
- [ ] This spec is part of the PR.
