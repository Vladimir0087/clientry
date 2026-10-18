# 0015 — Backend in Ohio

Status: accepted
Date: 2026-10-18

## Context

ADR 0011 put the web on Netlify's legacy Free plan, whose server function runs in Ohio (`cmh`):
choosing a function region is a Pro and Enterprise feature, and the plan never changes. The API,
Valkey and Postgres stayed in Frankfurt (ADR 0008). Every page render, its session prefetch and
every proxied API call went edge (near the visitor) → function (Ohio) → API (Frankfurt) → Neon
(Frankfurt), so the function and the API were an ocean apart and each call paid a transatlantic
round trip, more on a new connection. A demo built to show sound decisions had no good answer for
why its two halves sat on two continents.

## Decision

The API, Valkey and Postgres follow the web's server function to Ohio: Render's Ohio region for the
web service and Key Value, Neon in AWS `us-east-2`. Regions cannot be changed on either host, so the
stack was created anew and the Frankfurt one deleted.

- **A fresh database.** It held only test accounts before the demo data of spec 12, so nothing was
  copied; the migrations built the schema at the first start. Everyone signed in again.
- **The same key pair.** The private key moved to the new service, so Netlify kept its public key
  and only `API_URL` changed there.
- **Valkey first.** Render allows one free Key Value per workspace, so the Frankfurt one was deleted
  before the Ohio one was created; until the switch the old API served without reminders.
- **Neon's compute fixed at 0.25 CU.** The monthly budget is counted at 0.25 CU, and autoscaling to
  2 CU would spend it eight times faster.
- **`TRUST_PROXY_HOPS` measured again.** Still `5`: the browser, Netlify's edge, Netlify's function,
  Cloudflare and Render's proxy. A forged `X-Forwarded-For` does not choose the client.

## Alternatives

- **Stay in Frankfurt.** Two crossings per call for no reason but history. Rejected.
- **A paid function region.** The plan never changes (ADR 0011). Rejected.
- **A new Vercel account.** It would sidestep Vercel's decision. Rejected.
- **Virginia for Render and Neon.** Both offer it, but it is a second region next to the function's.
  Rejected.
- **Proxy `/api/*` from the edge function in `proxy.ts` straight to Frankfurt.** API calls would
  skip the function, but page renders and the session prefetch still run in Ohio and cross twice,
  and the whole API path would move onto the edge runtime's polyfills. Rejected.

## Consequences

- The function, the API and the data share one region; only the edge-to-function leg can cross an
  ocean, and for a visitor in the Americas nothing does.
- Measured from the owner's machine in Central Europe, 20 sequential calls per run through the
  web's proxy (`/api/auth/me` without cookies, which touches neither Postgres nor Valkey): the
  fastest call fell from 0.39 s to 0.28 s, the medians of two runs from 0.40 and 0.52 s to 0.30 and
  0.49 s. A signed-in dashboard's server time over ten reloads: median 0.59 s before, 0.45 s after;
  renders over a second fell from four to one.
- Accounts and CRM data live in the US. The demo holds no real customer data.
- The API's origin changed to `https://clientry-api-ohio.onrender.com`; visitors never see it.
- Spec 15 chose the Oracle region next to Neon in Frankfurt; Oracle has no Ohio region, so the
  region is chosen again if that spec is revived.
- A future move repeats the runbook's "Move to another region": a new stack, Valkey first, a switch
  through CI, the old stack deleted.
