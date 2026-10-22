# 0018 — Public repository

Status: accepted
Date: 2026-10-22

## Context

Until now the repository was private, and on GitHub Free a private repository has neither branch
protection nor environments: CI was green on every merge only because the owner waited for it,
and the deploy secrets sat at repository level, where any branch's workflow run could read them.
Going public makes both available and adds new readers: whoever opens the repository sees the
README first, and any visitor can open a pull request. The README needs a tour and screenshots
that match the current interface.

## Decision

- **A ruleset on the default branch, without bypass.** Deletion and force pushes blocked, linear
  history, a pull request with squash merges only and no required approvals, every CI job as a
  required status check (`lint`, `typecheck`, `test`, `e2e`, `image`, `pr-title`), and branches
  up to date with `main` before they merge. Nobody bypasses it, the owner included; when CI fails
  for a reason outside the code, the owner as the repository's admin disables the ruleset for that
  merge and enables it again.
- **Squash merges only.** One commit per pull request on `main`, titled by the pull request, whose
  title commitlint checks.
- **Deploy secrets in a `production` environment** that takes deployments from `main` only.
  `deploy-api` and `deploy-web` run in it; the variables stay at repository level, none is a
  secret.
- **A public image.** The GHCR package is public, so Render pulls it without a registry
  credential, and the classic `read:packages` token behind that credential is deleted.
- **README media made by a script.** `pnpm media` drives the e2e stack (ADR 0017) through the
  demo in Playwright and writes the stills and the tour GIF with sharp.

## Alternatives

- **Classic branch protection.** The same rules, but spread over one form per branch pattern; a
  ruleset keeps them in one place and exports as JSON. Rejected.
- **A faster subset of required checks, without `e2e`.** Merges would wait less, but `main` could
  take a commit that never deploys, since `deploy-api` waits for `e2e`. Rejected.
- **A bypass for the owner.** Saves the toggle when CI is down, but makes a red merge one click
  away every day. Rejected.
- **Merge commits or rebase merges.** Several commits per pull request, each unchecked by
  commitlint, and a history that is harder to read. Rejected.
- **Deploy secrets at repository level.** Any branch's run could deploy or read them, a pull
  request that edits the workflow included. Rejected.
- **A private image behind a registry credential.** One more credential that expires and needs
  rotating, to hide code that is public anyway; secrets reach the container only at runtime.
  Rejected.
- **Screenshots and a screen recording made by hand.** They drift from the interface, differ
  between takes, and a GIF needs a converter on the machine. Rejected for scripted capture against
  the same demo data every time.

## Consequences

- A fix reaches `main` only through a pull request and its e2e run; an outage of GitHub or a host
  blocks merging until it passes or the owner disables the ruleset.
- A pull request that falls behind `main` takes `main` in and runs its checks again before it
  merges.
- Deploys start from `main` only; a manual run of another branch can still publish its image.
- The image and every tag CI pushes are public for good: GitHub never makes a public package
  private again.
- After an interface change, `pnpm media` runs again and the files are committed with the change.
