# 0011 — Web on Netlify

Status: accepted; the double Atlantic crossing is removed by 0015
Date: 2026-10-11

## Context

ADR 0008 put the web on Vercel Hobby. Vercel declined the owner's account at sign-up, after an
appeal too. The web still needs a free host that runs a Next 16 server: pages rendered per request,
`proxy.ts` setting a nonce CSP on every response, and the `/api/*` rewrite that keeps the refresh
cookie first-party. As with Render, the host must not get access to the private repository, and
only a green CI run may deploy.

## Decision

The web moves to Netlify, on the owner's existing account, which is still on the legacy Free plan.
Everything else in ADR 0008 stays.

- **Built and deployed by Netlify's CLI in CI.** `deploy-web` runs one `netlify deploy --prod`
  after `deploy-api`, with the CLI version pinned in the workflow and the Next adapter
  (`@netlify/plugin-nextjs`) pinned in the web's `package.json`. The site is created through
  Netlify's REST API without a repository, so Netlify has nothing to build by itself.
- **The adapter's shape is accepted as it is.** Pages, route handlers and the rewrite run in one
  server function in Ohio, since a function region is a paid feature; `proxy.ts` runs as an edge
  function near the visitor, on Deno through the adapter's polyfills.
- **Next's rewrite keeps proxying `/api/*`.** It runs in the server function, with Next's default
  30 s proxy timeout, which equals Netlify's limit for a synchronous function.
- **The plan never changes.** Credit-based plans are one-way, and their free tier pauses every site
  when the month's credits run out; the legacy plan has no credits, only monthly limits far above
  the demo's traffic.

## Alternatives

- **A new Vercel account.** It would sidestep Vercel's decision and could be closed later, taking
  the live demo with it. Rejected.
- **Cloudflare Workers through OpenNext.** The free plan allows 10 ms of CPU per request and 3 MB
  per worker, too little for a Next server; the paid plan costs money. Rejected.
- **A second Render web service.** The pinged API already uses 744 of the workspace's 750 free
  hours a month; a web service that sleeps would greet visitors with a minute-long cold start.
  Rejected.
- **Netlify's own proxy rules for `/api/*`.** They would skip the function, but they time out
  after 26 s, and the adapter's catch-all function would likely be matched before them. Rejected.
- **Netlify's Git builds.** No gate on green CI, a second toolchain, and Netlify would need access
  to the repository. Rejected.

## Consequences

- A page render, the session prefetch and every proxied API call cross the Atlantic twice, about
  0.2 s more per call than in Frankfurt.
- A proxied call stops after 30 s. The first submit after Render has slept fails, and the form
  says the server is waking up, so the UptimeRobot pinger that keeps the API awake is now
  essential, not a convenience.
- `TRUST_PROXY_HOPS` is measured again: Netlify does not document what it does to
  `X-Forwarded-For`, so the measurement also checks that a forged header does not get through.
- A rollback ("Publish deploy" on an earlier deploy) lasts only until the next CI deploy, unless
  auto publishing is locked, and CI's web deploy fails while it is.
- Going over the legacy limits applies a paid add-on that an account without a card cannot pay, so
  its sites are paused. The runbook keeps the limits and the rule never to change the plan.
- The personal access token expires; the runbook keeps its date.
