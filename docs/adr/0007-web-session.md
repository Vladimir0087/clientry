# 0007 — Web session

Status: accepted
Date: 2026-10-05

## Context

The access JWT lives 15 minutes and the refresh token sits in a cookie sent only to `/api/auth`
(ADR 0005). The Next proxy has to decide, before rendering, whether a request belongs to a
signed-in user, but it never sees the refresh cookie. A user who returns after a coffee break must
not bounce through `/login`, a signed-out browser must see the login form without waiting for the
API (Render's free tier sleeps), and several requests that hit an expired token at once must not
start several refreshes.

## Decision

- **The access cookie outlives its JWT.** `clientry_access` gets the refresh cookie's lifetime
  (14 days, capped by the session end), while the JWT inside still expires after 15 minutes and
  the API rejects it as before. A present cookie means "signed in, the token may have expired"; a
  missing one means "signed out".
- **The proxy verifies the JWT with the public key.** ES256 pinned, issuer, audience and claims
  checked. A valid token renders; a token whose only fault is `exp` counts as `expired` and also
  renders; anything else, or no cookie, redirects to `/login?next=…`. The proxy never calls the API
  and never refreshes. The `(app)` layout checks the cookie with the same function.
- **Refresh only in the browser, once per tab.** The browser API client refreshes on a 401 with
  code `AUTHENTICATION_REQUIRED`, never on other 401s. Requests that get that 401 while a refresh
  runs wait for it and retry once. A refresh 401, or a second 401 after a successful refresh,
  ends the session: one handler logs out and replaces the page with `/login?next=…`. Any other
  refresh failure is reported as that error, and the session is not treated as ended.

## Alternatives

- **A client "restore session" page.** The proxy sends every request without a valid JWT to a page
  that refreshes and returns. A visible hop on every return, and a spinner instead of the login
  form while the API wakes up. Rejected.
- **Refresh in the proxy.** The refresh cookie never reaches it (`Path=/api/auth`), and widening
  the path would send the refresh token with every page request. Rejected.
- **A third, readable "signed in" cookie.** Says what the access cookie already says, and can
  drift from it. Rejected.
- **A timer that refreshes before expiry.** Keeps idle tabs refreshing forever and still needs the
  401 path for sleeping laptops. Rejected.
- **A cross-tab refresh lock.** Two tabs refreshing together are covered by the API's 30-second
  grace period. Rejected as unneeded.

## Consequences

- After 15 idle minutes a reload or a refetch renders at once, and the first API call refreshes;
  the user sees no redirect.
- Replacing the signing key sends every user to `/login` once instead of a silent refresh: the
  proxy cannot tell a token signed by the old key from a forged one.
- The proxy is a redirect for the user, not the security boundary; the API still authorizes every
  call.
- A logout in one tab is noticed by another on its next navigation or request, not instantly.
- Every query and mutation shares the client's refresh and the one session-expired handler;
  features never handle an expired session themselves.
