# 15 — Deploy, stage 2

Status: deferred (optional)

Decided on 2026-10-09: this spec is optional and is not scheduled. v1 is complete without it, and the
live demo stays on the stage 1 hosting of spec 05. The spec is kept short; if it is revived, it is
expanded to the full template first and the free-tier terms are checked again.

## 1. Goal

The API and Valkey move from Render's free plan to an Oracle Cloud Always Free virtual machine
running Docker Compose behind Caddy, so the API never sleeps; the web stays on Netlify and Postgres
stays on Neon.

## 2. In scope / Out of scope

### Why it is deferred

What it would give:

- No spin-down: on Render a missed ping means about a minute of cold start on the first request.
- More room: Render's free plan has 512 MB and 0.1 CPU; the worker of spec 08 and argon2 logins
  compete for both.
- Valkey with persistence instead of 25 MB without it.
- Independence from Render's free-plan terms.
- Infrastructure work in the portfolio: a server, Compose, Caddy, a deploy over SSH.

What it costs:

- The demo already works: the UptimeRobot pinger keeps the API awake, and the move adds no product
  feature.
- Oracle's sign-up is unreliable: "Error processing transaction" with valid cards, and some
  countries cannot sign up through the website. Spec 05 already lost time to an account check.
- Always Free reclaims idle instances: under 20% of CPU, network and memory (95th percentile) over
  7 days. A low-traffic demo meets that; avoiding it means a Pay As You Go account with a card on
  file.
- The server becomes ours to run: OS updates, hardening, monitoring, all of which Render does now.

### When to revive it

Any one of:

- cold starts or slow responses are visible on the live demo;
- after spec 08, the API with the BullMQ worker does not fit Render's 512 MB (out-of-memory
  restarts in the Render log);
- Render changes its free-plan terms (sleep, hours, limits);
- the owner wants the infrastructure part in the portfolio.

### In scope, if revived

- Oracle account with a home region chosen when the spec is revived; the choice is permanent and
  Always Free resources exist only there. `eu-frankfurt-1` was picked next to Neon, but Neon and
  Netlify's function moved to Ohio (ADR 0015), and Oracle has no Ohio region. A decision on Pay As
  You Go against reclamation.
- VM: AMD micro (1 GB) or ARM if available; ports 80 and 443 open in the security list and in the
  OS firewall, which Oracle's images close by default; swap; SSH by key only; unattended security
  updates.
- Compose on the VM: the API from GHCR by digest, Valkey with `noeviction`, Caddy with automatic
  HTTPS on a free hostname (DuckDNS or nip.io).
- CI: `deploy-api` deploys over SSH instead of the Render deploy hook; the version wait and
  `smoke-live.sh` stay.
- Netlify `API_URL` to the new host and a redeploy; `TRUST_PROXY_HOPS` measured again behind Caddy.
- Render service and Key Value removed or kept as a fallback; UptimeRobot kept as a monitor.
- `docs/deployment.md` and an ADR.

### Out of scope

- Postgres on the VM: it stays on Neon, so there are no backups to run.
- The web on the VM: it stays on Netlify.
- Buying a domain.

## 3. Data model

None.

## 4. API

No changes: the same image runs on another host.

## 5. UI

None.

## 6. Tests

If revived: the container smoke test of spec 05 unchanged; `smoke-live.sh` against the new API
host on every deploy.

## 7. Acceptance criteria

If revived:

- [ ] The API answers on the VM over HTTPS; the live web logs in and refreshes through it.
- [ ] A `main` push deploys over SSH and the live `/health/live` reports the merge commit.
- [ ] The VM restarts cleanly: Compose brings every service back without manual steps.
- [ ] `TRUST_PROXY_HOPS` measured; the rate limit counts the browser's address.
- [ ] `docs/deployment.md` and the ADR are written; this spec is expanded and approved first.
