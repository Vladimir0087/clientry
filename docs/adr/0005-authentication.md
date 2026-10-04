# 0005 — Authentication

Status: accepted
Date: 2026-10-04

## Context

Every feature after this one needs to know who calls the API, in which workspace and with which
role. The browser talks only to the web app's origin, and Next proxies `/api/*` to the API, so
cookies are first-party. The web app (spec 04) also needs to see the session in its middleware and
server components to redirect signed-out users. The demo is public, so login, registration and
refresh face password guessing, token theft and cross-site requests.

## Decision

- **Access token in an httpOnly cookie.** A JWT with a 15-minute lifetime in `clientry_access`
  (`Path=/`, `SameSite=Lax`), next to the refresh token. Page scripts never read a token, and Next
  middleware can verify the same cookie.
- **ES256 through `jose`.** The API holds the only private key; the web app gets the public key and
  cannot mint tokens. Verification pins the algorithm, issuer and audience and parses the claims
  with the shared zod schema. One small guard replaces Passport and `@nestjs/jwt`, and the same
  library runs in the Next middleware.
- **Opaque refresh tokens with sessions.** A session per login with a 30-day absolute end and a
  14-day idle limit. The refresh token is 32 random bytes in the `clientry_refresh` cookie
  (`Path=/api/auth`, `SameSite=Strict`); the database keeps only its SHA-256 hash. Every refresh
  rotates it. Presenting a token rotated 30 seconds ago or earlier counts as reuse and revokes the
  whole session; within 30 seconds it is exchanged again, so parallel tabs and retried requests do
  not log the user out. Refresh happens only in the browser, never on the Next server.
- **CSRF through `SameSite` and an origin check.** `SameSite=Lax` keeps the access cookie off
  cross-site unsafe requests, and a global guard rejects unsafe requests whose `Origin` is not in
  `TRUSTED_ORIGINS`, public routes included, which also stops login CSRF.
- **Global deny-by-default guards.** Origin, access token and role guards are registered once, in
  that order. A route is open only with `@Public()`; `@Roles('owner')` restricts it further. The
  handler gets `AuthUser { id, workspaceId, role }` through `@CurrentUser()`, the only source of
  the workspace id for repositories.
- **Session and membership read on every request.** The access token carries the session id
  (`sid`). After the signature check the guard runs one query: the membership of user `sub`,
  provided session `sid` belongs to that user, is not revoked and has not ended. `AuthUser` is
  built from that row. The `wid` and `role` claims stay in the token for the web middleware, but
  the API never authorizes with them. No row gets 401.
- **Passwords with argon2id** through `@node-rs/argon2` at OWASP's baseline, normalized to NFKC.
  An unknown email is checked against a dummy hash, so timing does not reveal accounts.
- **Rate limits** on register, login and refresh per client IP, in memory, since the API runs as
  one process.

## Alternatives

- **Access token in memory, sent as a Bearer header.** No CSRF exposure, but Next middleware and
  server components cannot see the session, and every page load needs a refresh before the first
  request. Rejected.
- **HS256.** One shared secret would have to live in the web app too, and a leak of its
  environment could mint tokens. Rejected.
- **Passport with `@nestjs/jwt`.** A strategy layer and a second JWT library for what one guard
  does; the web middleware would still need `jose`. Rejected.
- **JWT refresh tokens without server state.** Cannot be revoked, rotated with reuse detection or
  logged out. Rejected.
- **CSRF tokens.** Double-submit or synchronizer tokens add a round trip and client code;
  `SameSite` plus the origin check covers the same attacks for a same-origin app. Rejected.
- **`@UseGuards` per controller.** A forgotten decorator opens an endpoint. Rejected.
- **Trusting the role and workspace in the access token.** Saves one indexed query per request,
  but a removed member keeps access and a demoted owner keeps owner rights for up to 15 minutes,
  enough to export the client base. Every protected request reads the database anyway. Rejected.
- **Not checking the session on requests.** Logout and reuse detection would leave issued access
  tokens valid for up to 15 minutes. Since the membership is read anyway, the session check is an
  `EXISTS` on a primary key in the same query. Rejected.

## Consequences

- Every feature controller only declares who may call it; a missing `@Public()` closes a route.
- A role change or a removal applies on the next request; removing a member needs no session
  revocation. The claims in the access token can be up to 15 minutes stale until the next refresh,
  which only matters to the web middleware's redirects.
- Every protected request costs one extra indexed query.
- `GET` handlers must never change state: the origin check skips safe methods.
- Logout and reuse detection revoke the session, and every access token of that session fails on
  its next request, including one copied out of the browser.
- Each exchange inside the 30-second grace period adds another live token to the session, so two
  tabs that refresh together each continue their own chain. Reuse of any rotated token after the
  grace period still revokes the session with every chain in it. The price: a stolen refresh token
  replayed within 30 seconds of the real rotation starts a chain that reuse detection never sees,
  and it lives until the session's absolute end unless the user logs out.
- Replacing the signing key fails every issued access token at once; the client gets 401, and the
  refresh token, which is not signed, issues a new one. Key rotation with `kid` is left for later.
- The v2 WebSocket cannot read the access token from the browser, so the socket will need a
  short-lived ticket from a cookie-authenticated endpoint.
- More than one API instance would need the throttler's counters in Valkey.
