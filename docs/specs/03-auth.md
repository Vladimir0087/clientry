# 03 — Auth

Status: approved

## 1. Goal

Accounts and sessions in the API: registration creates a workspace with default pipeline stages
and makes the registrant its owner, login and logout, short-lived access tokens and rotating
refresh tokens in httpOnly cookies with reuse detection, and global guards that deny by default
and check roles, so every feature spec only declares who may call its endpoints.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/
    schema.prisma                # users, workspaces, memberships, stages, sessions, refresh_tokens
    migrations/<timestamp>_auth/
  scripts/generate-jwt-keys.ts   # prints a new ES256 key pair for .env and the web app
  src/
    common/
      auth/                      # AuthUser, @Public, @Roles, @CurrentUser; no providers
      errors/unauthenticated.error.ts
      guards/trusted-origin.guard.ts
    modules/auth/
      auth.controller.ts
      auth.service.ts
      auth.module.ts
      errors.ts
      auth-cookies.ts            # cookie attributes, set and clear
      access-token.service.ts    # ES256 sign and verify
      access-token.guard.ts
      roles.guard.ts
      password-hasher.ts         # argon2id
      refresh-token.ts           # generate and hash
      default-stages.ts
      accounts.repository.ts, prisma-accounts.repository.ts
      sessions.repository.ts, prisma-sessions.repository.ts
  test/
    reset-database.ts
    fixtures/accounts.ts
packages/shared/src/auth/
packages/shared/src/common/text.ts
docs/adr/0005-authentication.md
```

**Decision: where the access token lives**

The open question from the plan is closed with option B: the access token is a JWT in an
httpOnly cookie, next to the refresh token. Next middleware and server components can see the
session and verify it with the public key (spec 04), and no token is ever readable by page
scripts. The price is CSRF exposure, handled below. Refresh happens only in the browser, never on
the Next server: a server component cannot write the rotated cookie, and parallel server-side
refreshes would trip reuse detection.

**Tokens and sessions**

- Access token: JWT signed with ES256 through `jose`, lifetime 15 minutes. Claims: `sub` (user
  id), `sid` (session id), `wid` (workspace id), `role`, `iat`, `exp`, issuer `clientry-api`,
  audience `clientry`. Verification pins the algorithm to ES256 and checks issuer, audience and
  expiry, then parses the payload with `accessTokenClaimsSchema`; anything else is rejected. `wid`
  and `role` serve the web middleware; the API authorizes with the session and membership it reads
  from the database.
- ES256 rather than HS256: the API holds the only private key, and the web app (spec 04) gets
  the public key, so a leak of the web's environment cannot mint tokens.
- `jose` directly, no `@nestjs/jwt` and no Passport: one ESM library shared with the web
  middleware, and a guard of a few dozen lines instead of a strategy layer.
- Session: one row per login with two limits. Absolute: 30 days from login, not extended by
  refresh, so a stolen token can never outlive the session it came from. Idle: a refresh token
  unused for 14 days is expired. Every refresh issues a new token, so the age of the presented token
  is the idle time and needs no extra column. Revocation is one column on the session row, checked
  on every refresh and on every authenticated request, so a successor created concurrently with a
  revocation is dead on arrival, and so are access tokens already issued for that session.
- Refresh token: 32 random bytes, base64url, opaque. Only its SHA-256 hash is stored: the token
  has 256 bits of entropy, so a slow hash adds nothing, and lookup must be by hash.
- Refresh (`POST /api/auth/refresh`), in order:
  1. Hash not found, session revoked or past its absolute end, token issued 14 days ago or
     earlier → 401 `INVALID_REFRESH_TOKEN`.
  2. Token rotated 30 seconds ago or earlier → reuse: the session is revoked, a `warn` line with
     user id and session id is logged, 401 `INVALID_REFRESH_TOKEN`.
  3. User and membership are re-read, so the new access token carries the current workspace and
     role. A user without a membership has the session revoked and gets 401.
  4. In one transaction: mark the token rotated if it is not yet, insert its successor in the same
     session. A token rotated less than 30 seconds ago is exchanged again instead of being treated
     as reuse, so two tabs refreshing at once, or a retry after a lost response, do not log the
     user out.
- Rotation uses a conditional update (`rotated_at IS NULL`), so two concurrent refreshes with the
  same token cannot both see it as fresh; the loser takes the grace path of step 4.
- Logout revokes the session of the presented refresh token, if any, and always clears both
  cookies. It needs no access token, so it works after the access token expired. An access token of
  that session, even one copied out of the browser, fails on its next request.
- Login deletes the user's sessions past their absolute end, with their tokens, so the tables do
  not grow without bound. Rotated tokens of live sessions stay: they are what reuse detection
  compares against.
- Lifetimes and the grace period are constants in code, not configuration.

**Cookies**

| Cookie             | Value         | Path        | SameSite | HttpOnly | Secure          | Max-Age                            |
| ------------------ | ------------- | ----------- | -------- | -------- | --------------- | ---------------------------------- |
| `clientry_access`  | access JWT    | `/`         | `Lax`    | yes      | production only | 15 min                             |
| `clientry_refresh` | refresh token | `/api/auth` | `Strict` | yes      | production only | 14 days, capped by the session end |

- The access cookie's path is `/`, so Next middleware and server components receive it on page
  requests; `Lax` keeps it on top-level navigation from an external link.
- The refresh cookie goes only to `/api/auth/*` and only on same-site requests. Refresh is a
  same-origin `fetch`, so `Strict` costs nothing.
- `Secure` follows `NODE_ENV=production`: the local API and the test agent run on plain http.
- Names carry the `clientry_` prefix, since cookies are not isolated by port and other local
  projects on `localhost` use `access_token`.
- No `Domain` attribute: cookies stay on the exact host the browser talks to.
- A 401 from refresh clears both cookies, so the browser stops presenting a dead token and the
  middleware sees a logged-out user.
- Every response under `/api/auth` has `Cache-Control: no-store`.
- Cookies are read with `cookie-parser`, mounted in `createApp`, unsigned: the JWT is signed and
  the refresh token is random.
- Only the cookie authenticates; there is no `Authorization` header in v1.

**Passwords**

- argon2id through `@node-rs/argon2` with OWASP's baseline: 19 MiB memory, 2 iterations,
  parallelism 1. Parameters are encoded in the hash, so they can be raised later. The `argon2`
  package is not used: its install script runs `cross-env` and `node-gyp-build`, while
  `@node-rs/argon2` ships prebuilt N-API binaries without install scripts.
- Policy: 12 to 128 characters, no composition rules, not trimmed. Login checks only that a
  password is present, so a stricter policy later never locks out existing accounts.
- `PasswordHasher` normalizes the password to NFKC before hashing and before verifying: the same
  accented password typed on two systems can arrive as different code points. It lives in the
  hasher, not in the shared schema, since register and login both pass through it.
- Login with an unknown email still verifies against a dummy hash computed at startup with the
  same parameters, and answers the same 401 `INVALID_CREDENTIALS` as a wrong password, so neither
  the body nor the timing reveals whether the account exists.
- Registration with a taken email answers 409 `EMAIL_TAKEN`. This reveals that the account exists;
  hiding it needs email verification, which comes with email in v2. The rate limit bounds
  enumeration.
- Emails are trimmed and lowercased by the shared schema before validation, on both ends.

**Registration**

- `POST /api/auth/register` with email, password, name and workspace name.
- The password is hashed before the transaction, so argon2 never holds a database connection. One
  transaction then inserts the user, the workspace, an `owner` membership and the default stages.
- No pre-check for a taken email: the unique index decides, and the repository translates its
  violation into `EmailTakenError`, so concurrent registrations with one email cannot both succeed.
- Then a session is issued as on login, and the response sets both cookies.
- Default stages, in order: `New`, `Call`, `Proposal sent`, `Contract` (all `open`), `Paid`
  (`won`), `Lost` (`lost`). Managing stages is spec 07; this spec only creates them.

**Guards and decorators**

- Global guards, registered in `AppModule` in this order, so the order is explicit:
  1. `TrustedOriginGuard`: CSRF check, below.
  2. `AccessTokenGuard`: deny by default. Every route requires a valid access cookie unless it is
     marked `@Public()`. A forgotten decorator closes an endpoint instead of opening it. After the
     signature check it runs one query: the membership of user `sub`, provided session `sid`
     belongs to that user, is not revoked and has not passed its absolute end. `AuthUser` is built
     from that row, not from the claims. No row → 401 `AUTHENTICATION_REQUIRED`.
  3. `RolesGuard`: with `@Roles('owner')` on a controller or handler, other roles get 403
     `INSUFFICIENT_ROLE`; without it any member passes. "Own or someone else's" checks stay in
     services, as the plan says.
- `@CurrentUser()` injects `AuthUser { id, workspaceId, role }`, readonly. It is the only source
  of `workspaceId` for every repository call in later specs.
- `common/auth` holds `AuthUser` and the decorators: metadata only, no providers, so every module
  imports them without depending on the auth module. Guards and token code live in `modules/auth`.
- `register`, `login`, `refresh` and `logout` are `@Public()`: refresh and logout work with the
  refresh cookie alone, after the access token expired. Only `me` needs the access cookie.
- Health routes and the test-only controller from spec 02 are `@Public()`. Swagger UI is mounted
  outside Nest routing and is not affected.
- A removed member is locked out on the next request and a role change applies on the next
  request, without waiting for the access token to expire: in a CRM, 15 minutes is enough to export
  the client base. The same holds for logout and reuse detection: a revoked session stops its
  access tokens at once. Every protected request reads the database anyway, so checking the
  session in the same query costs nothing extra. Spec 09 needs no session revocation for removal.
- Auth repositories are the one place not scoped by `workspaceId`: login looks a user up by email
  before any workspace is known. They return the membership, and every other repository takes
  `workspaceId` from `AuthUser`.

**CSRF**

- `SameSite=Lax` keeps the access cookie off cross-site `POST`, `PUT`, `PATCH` and `DELETE`, and
  `vercel.app` is on the public suffix list, so other Vercel apps are cross-site.
- `TrustedOriginGuard` checks unsafe methods on every route, public ones included, since login
  CSRF signs a victim into the attacker's account. An `Origin` header that is not in
  `TRUSTED_ORIGINS`, `null` included, answers 403 `UNTRUSTED_ORIGIN` before validation. A request
  without `Origin` passes: browsers always send it on unsafe requests, so only non-browser clients
  omit it, and they carry no ambient cookies.
- `GET` handlers must not change state; that is what makes skipping them safe.

**Rate limiting**

- `@nestjs/throttler` on the auth controller, in-memory storage: the API runs as one process on
  both hosting stages. Per client IP:

  | Route      | Limit       |
  | ---------- | ----------- |
  | `register` | 10 per hour |
  | `login`    | 10 per min  |
  | `refresh`  | 30 per min  |
  | `logout`   | not limited |
  | `me`       | not limited |

- Over the limit: 429 problem details with code `TOO_MANY_REQUESTS`, a fixed detail without the
  library's class name, and `Retry-After`.
- No per-account lockout: it lets anyone lock a known user out.
- Client IP comes from `req.ip` with Express `trust proxy` set to `TRUST_PROXY_HOPS`. With 0 the
  `X-Forwarded-For` header is ignored, so a direct client cannot spoof its address. Spec 05 sets
  the number of proxies in front of Render.

**Configuration**

| Variable           | Required | Default | Notes                                                     |
| ------------------ | -------- | ------- | --------------------------------------------------------- |
| `JWT_PRIVATE_KEY`  | yes      | —       | PKCS#8 PEM of a P-256 key; literal `\n` accepted          |
| `TRUSTED_ORIGINS`  | yes      | —       | comma-separated `http(s)://host[:port]`, no path          |
| `TRUST_PROXY_HOPS` | no       | `0`     | proxies in front of the API whose forwarded IP is trusted |

- The key is parsed at startup with `node:crypto`; anything but an EC P-256 private key is an
  invalid config with exit code 1, and the message names the variable, never the value. The
  public key is derived from it. Literal `\n` sequences are accepted for hosting panels that take
  one line.
- Origins are normalized through `URL.origin`, so a trailing slash does not matter. An entry with
  a path, a query, a non-http scheme or `null` is invalid.
- `pnpm --filter @clientry/api jwt:keygen` runs `scripts/generate-jwt-keys.ts` with Node's type
  stripping and prints `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` as single-line values ready for
  `.env`. The public key is for the web app in spec 04; the API does not read it. `scripts/` is
  covered by `typecheck` and `lint` like `src/`.
- `.env.example` gains the three variables: `TRUSTED_ORIGINS` with the web origin and the API's
  own origin for Swagger UI (`http://localhost:3000,http://localhost:4000`), `TRUST_PROXY_HOPS=0`,
  and an empty `JWT_PRIVATE_KEY` with a comment naming the command. No key is ever committed,
  even a development one.

**Errors**

- New domain error kind `UnauthenticatedError` (401) in `common/errors`, mapped by the problem
  details filter next to the others.
- `modules/auth/errors.ts`:

  | Class                         | Kind            | Code                      |
  | ----------------------------- | --------------- | ------------------------- |
  | `EmailTakenError`             | Conflict        | `EMAIL_TAKEN`             |
  | `InvalidCredentialsError`     | Unauthenticated | `INVALID_CREDENTIALS`     |
  | `InvalidRefreshTokenError`    | Unauthenticated | `INVALID_REFRESH_TOKEN`   |
  | `AuthenticationRequiredError` | Unauthenticated | `AUTHENTICATION_REQUIRED` |
  | `InsufficientRoleError`       | Forbidden       | `INSUFFICIENT_ROLE`       |
  | `NoWorkspaceError`            | Forbidden       | `NO_WORKSPACE`            |

- `UntrustedOriginError` (Forbidden, `UNTRUSTED_ORIGIN`) lives next to `TrustedOriginGuard`.
- A missing, malformed, tampered or expired access token gives the same
  `AUTHENTICATION_REQUIRED`: the client's answer to all of them is one refresh.
- `NO_WORKSPACE`: a user whose membership was removed (spec 09 is the first place this can happen)
  cannot log in. It is answered only after the password is verified.

**Logging**

- Auth service logs `info` on registration (user id, workspace id) and login (user id), `info` on
  a failed login with the reason (`unknown_email`, `wrong_password`) and no email, `warn` on
  reuse detection (user id, session id).
- Passwords, hashes, tokens and emails never reach a log line. Request bodies are not logged and
  the `cookie` header is already redacted (spec 02).

**Swagger**

- Cookie security scheme for `clientry_access`. Protected operations carry it, public ones have
  `security: []`. Through the proxy, Swagger UI is same-origin, so "Try it out" works after login
  in the same page.
- Every auth operation documents its error responses with `ApiProblem` examples.

**Shared contracts (`@clientry/shared/auth`)**

- New entry point `@clientry/shared/auth`:
  - `registerRequestSchema` (`email`, `password`, `name`, `workspaceName`),
    `loginRequestSchema` (`email`, `password`);
  - `memberRoleSchema` (`owner`, `manager`);
  - `sessionResponseSchema`: `user { id, email, name }`, `workspace { id, name }`, `role`;
  - `accessTokenClaimsSchema`, `ACCESS_TOKEN_ISSUER`, `ACCESS_TOKEN_AUDIENCE`,
    `ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE`: what the web middleware needs to verify the
    same token;
  - inferred types for each.
- Field rules: email trimmed and lowercased, then validated, at most 254 characters; password 12
  to 128 characters for registration, 1 to 128 for login; `name` and `workspaceName` trimmed, 1 to
  100 characters, without NUL characters. The NUL rule is `textSchema` in `@clientry/shared/common`,
  the base for later free-text fields: Postgres `text` cannot store NUL, so the insert would fail
  with 500 instead of answering 400.
- Email is `z.string().trim().toLowerCase()` piped into `z.email()`: on `z.email().trim()` zod
  checks the format before trimming, so `" ann@studio.dev"` would fail. Request schemas use no
  `.transform()` or `z.preprocess`, which have no JSON Schema form for Swagger.

**Test harness**

- `resetDatabase()` truncates every application table, found from the catalog rather than listed
  by hand, with `RESTART IDENTITY CASCADE`; integration files that write data call it in
  `beforeEach`. `_prisma_migrations` is kept.
- `test/fixtures/accounts.ts`: register an account through the API and return a supertest agent
  that holds its cookies; add a `manager` to an existing workspace by inserting the user, with a
  hash from `PasswordHasher`, and the membership directly, then log in through the API and return
  that agent. Direct inserts stay until invites exist in spec 09. Two registered accounts give the
  two workspaces every later module's tenant tests need.
- `createTestApp` turns rate limiting off by overriding `ThrottlerGuard` in the testing module:
  fixtures register and log in far more often than the limits allow, and the in-memory counters
  live as long as the app. The rate-limit tests opt back in with an override flag. The app itself
  has no switch for this.
- Global setup generates an ephemeral ES256 key per run and provides it with the container URLs;
  `createTestConfig` sets `TRUSTED_ORIGINS` and `TRUST_PROXY_HOPS` explicitly, and accepts an
  override for `TRUST_PROXY_HOPS`.

**Architecture decision record**

- `0005-authentication.md`: access token in an httpOnly cookie over memory; ES256 JWT through
  `jose` over HS256, `@nestjs/jwt` and Passport; opaque refresh tokens with sessions, rotation,
  reuse detection and a grace period; CSRF through `SameSite` and an origin check over CSRF
  tokens; global deny-by-default guards over per-controller `@UseGuards`; a session and membership
  lookup per request over trusting the role and the session state in a token that lives 15
  minutes. Consequences include the v2 WebSocket: the browser cannot read the access token, so the
  socket will need a short-lived ticket from a cookie-authenticated endpoint.

### Out of scope

- Login and registration pages, Next middleware, the API client with one shared refresh (spec 04).
- Hosting variables, `TRUST_PROXY_HOPS` on Render, cookies through the Vercel proxy (spec 05).
- Stage management, deals and the board (spec 07).
- Invites, registration through an invite, member removal, role change (spec 09).
- Demo login (spec 12).
- Password change and reset, email verification, account and workspace deletion, a list of active
  sessions, logout everywhere.
- `Authorization: Bearer`, WebSocket tickets (v2).
- Signing key rotation with `kid` and several verification keys. Replacing the key now fails every
  issued access token at once, and the next refresh issues a new one.
- Throttler storage in Valkey, needed only with more than one API instance.
- A periodic purge of sessions past their absolute end: login cleans up only the user who logs in,
  so users who never return leave their expired rows. A repeatable job comes with the first queue
  in spec 08.
- A switch that relaxes rate limits outside production for e2e runs from one IP (spec 13 decides).
- Checking passwords against a list of common ones.
- The client's reaction to responses: only a 401 from refresh means logged out, a 429 does not
  (spec 04).

## 3. Data model

One migration, `auth`. Conventions set here for every later migration:

- Ids are UUIDv7 generated by Prisma (`@default(uuid(7)) @db.Uuid`): time-ordered, so inserts stay
  local in the index and later cursor pagination can order by id.
- Tables plural snake_case, columns snake_case, through `@@map` and `@map`, so raw SQL in later
  specs (search, dashboard aggregates) needs no quoting.
- Every timestamp is `timestamptz(3)`.
- Enum types snake_case with lowercase values, identical to the shared enums, so no mapping layer.
- Every foreign key column is indexed.

| Table            | Columns                                                                                                            | Constraints and indexes                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `users`          | `id`, `email`, `password_hash`, `name`, `created_at`, `updated_at`                                                 | unique `email`                                                            |
| `workspaces`     | `id`, `name`, `created_at`, `updated_at`                                                                           | —                                                                         |
| `memberships`    | `id`, `user_id`, `workspace_id`, `role` (`member_role`: `owner`, `manager`), `created_at`, `updated_at`            | unique `user_id`; index `workspace_id`; cascade from users and workspaces |
| `stages`         | `id`, `workspace_id`, `name`, `position`, `kind` (`stage_kind`: `open`, `won`, `lost`), `created_at`, `updated_at` | index `(workspace_id, position)`; cascade from workspaces                 |
| `sessions`       | `id`, `user_id`, `expires_at`, `revoked_at?`, `created_at`                                                         | index `user_id`; cascade from users                                       |
| `refresh_tokens` | `id`, `session_id`, `token_hash` (`bytea`), `rotated_at?`, `created_at`                                            | unique `token_hash`; index `session_id`; cascade from sessions            |

Refinements of the plan's starting model:

- `memberships.user_id` is unique: one workspace per user in v1, enforced by the database.
  Several workspaces per user (v2) replace it with unique `(user_id, workspace_id)`.
- `stages.kind` replaces `isWon` and `isLost`: a stage that is both won and lost cannot be stored.
  `position` replaces `order`, a reserved word in SQL. Uniqueness of positions and names is left
  to spec 07, which knows how reordering works.
- The plan's `RefreshToken` is split into `sessions` and `refresh_tokens`: revocation and the
  absolute lifetime live once per login, and each refresh only adds a token row. The idle limit
  reads the token's own `created_at`.
- Deleting users or workspaces is not exposed; the cascades only keep test cleanup and later
  deletion specs simple.

## 4. API

All routes under `/api/auth`; every response there has `Cache-Control: no-store`.

| Method | Path        | Auth           | Request                 | Success                                   | Errors                                                                       |
| ------ | ----------- | -------------- | ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| POST   | `/register` | public         | `registerRequestSchema` | 201 `sessionResponseSchema`, both cookies | 400 `VALIDATION_FAILED`, 403 `UNTRUSTED_ORIGIN`, 409 `EMAIL_TAKEN`, 429      |
| POST   | `/login`    | public         | `loginRequestSchema`    | 200 `sessionResponseSchema`, both cookies | 400, 401 `INVALID_CREDENTIALS`, 403 `UNTRUSTED_ORIGIN` / `NO_WORKSPACE`, 429 |
| POST   | `/refresh`  | refresh cookie | —                       | 200 `sessionResponseSchema`, both cookies | 401 `INVALID_REFRESH_TOKEN` (cookies cleared), 403 `UNTRUSTED_ORIGIN`, 429   |
| POST   | `/logout`   | public         | —                       | 204, both cookies cleared                 | 403 `UNTRUSTED_ORIGIN`                                                       |
| GET    | `/me`       | access cookie  | —                       | 200 `sessionResponseSchema`               | 401 `AUTHENTICATION_REQUIRED`                                                |

From now on every protected endpoint can answer 401 `AUTHENTICATION_REQUIRED`, and one restricted
with `@Roles` also 403 `INSUFFICIENT_ROLE`.

`sessionResponseSchema`:

```json
{
  "user": {
    "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "email": "ann@studio.dev",
    "name": "Ann"
  },
  "workspace": { "id": "0199a3c4-5e70-7b1c-8d2e-3f4a5b6c7d8e", "name": "Pixel Studio" },
  "role": "owner"
}
```

`/me` reads user, workspace and membership from the database; an account or membership deleted
since the token was issued answers 401.

Developer script in `apps/api`:

| Script            | Does                                                           |
| ----------------- | -------------------------------------------------------------- |
| `pnpm jwt:keygen` | prints a new `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` for `.env` |

## 5. UI

None. Login and registration pages come in spec 04; Swagger UI covers manual checks here.

## 6. Tests

- **Unit**
  - Shared schemas: email `" Ann@Example.COM "` → `ann@example.com`; invalid email, password of
    11 and of 129 characters, blank name after trim rejected; password not trimmed; login accepts
    a short password; `textSchema` rejects a NUL character.
  - Config: `JWT_PRIVATE_KEY` missing, not a PEM, an RSA key, a P-384 key → one error naming the
    variable without its value; literal `\n` accepted; `TRUSTED_ORIGINS` parsed and normalized,
    trailing slash dropped, entries with a path, `null` or `ftp://` rejected, empty rejected;
    `TRUST_PROXY_HOPS` defaults to 0, negative rejected.
  - Access token service: sign → verify round trip gives the claims; rejected: expired (fake
    timers), signed by another key, `alg: none`, HS256 signed with the public key as the secret,
    wrong issuer, wrong audience, claims without `wid` or `sid` or with an unknown role.
  - Refresh token helpers: 43-character base64url value; hash deterministic, 32 bytes, differs from
    the value.
  - Password hasher: a password with a precomposed `é` verifies against the hash of the same
    password with `e` plus a combining accent; a wrong password does not verify.
  - Auth service, with repositories, hasher and token service mocked:
    - register hashes before calling the repository and propagates `EmailTakenError`;
    - login with an unknown email verifies against the dummy hash and throws
      `InvalidCredentialsError`, same as a wrong password; without a membership →
      `NoWorkspaceError`; success creates a session expiring 30 days later, signs the access token
      with its id and deletes the user's expired sessions;
    - refresh: unknown hash, revoked session, session past its absolute end, token issued 14 days
      ago → `InvalidRefreshTokenError`; token issued 14 days minus 1 ms ago → accepted, and the new
      access token carries the same session id; the new refresh cookie lives 14 days, or less when
      the session ends sooner; fresh token → marked rotated and successor issued; rotated 30 s
      minus 1 ms ago → successor issued, session not revoked; rotated 30 s ago → session revoked,
      `warn` logged with user id and session id, error thrown; membership gone → session revoked,
      no successor issued, error thrown;
    - logout with an unknown token resolves without error; with a valid one revokes its session.
  - Guards: `AccessTokenGuard` passes a `@Public()` route without a cookie, rejects a missing or
    invalid cookie with `AuthenticationRequiredError`, rejects a valid token when the lookup finds
    no live session with a membership, with the same error, passes `sub` and `sid` to the lookup,
    builds `AuthUser` from the membership when claims say `owner` and the database says `manager`;
    `RolesGuard` passes without metadata, rejects `manager` on an `owner` route with
    `InsufficientRoleError`; `TrustedOriginGuard` passes `GET` with any origin, passes unsafe
    methods with a trusted origin or none, rejects an untrusted origin and `null`.
  - Cookie helpers: attributes from section 2, `Secure` only with `NODE_ENV=production`, clearing
    uses the same path.
  - Auth controller: logout clears both cookies and rethrows when revoking the session fails.
  - Problem details filter: `UnauthenticatedError` → 401 with its code.
  - Default stages: six, positions contiguous from 0, exactly one `won` and one `lost`.
- **Integration** (testcontainers, supertest, `resetDatabase` before each test)
  - Register → 201 matching `sessionResponseSchema` with role `owner`; both cookies with the exact
    attributes; in the database one workspace, one `owner` membership, six stages in order with
    their kinds, a password hash starting with `$argon2id$`, a refresh token stored only as a hash
    different from the cookie value.
  - Register with the same email in another case and with spaces → 409 `EMAIL_TAKEN`, still one
    workspace; two concurrent registrations with one email → one 201, one 409.
  - Register with a short password and an invalid email → 400 with both field errors; with a NUL
    character in the name → 400 with the error on `name`.
  - Login → 200 and cookies, a second session row; wrong password and unknown email → 401
    `INVALID_CREDENTIALS` with identical bodies apart from `requestId`.
  - `/me` with the access cookie → 200; without it, with one character changed, or with an expired
    token → 401 `AUTHENTICATION_REQUIRED`.
  - Refresh → 200, both cookies replaced, new refresh value differs; the previous token replayed
    at once → 200; replayed after `rotated_at` is moved 31 s back in the database → 401, cookies
    cleared, session revoked, and the newest token now also → 401; session `expires_at` in the past
    → 401; the current token's `created_at` moved 14 days back → 401; no cookie → 401; two
    concurrent refreshes with one token → both 200.
  - Role changed in the database → the next request with the same access token already gets 403 on
    an owner-only route, and the next refresh signs the new role; membership deleted → the next
    request with the same access token → 401, and refresh → 401 with the session revoked.
  - Logout → 204, cookies cleared with `Max-Age=0`, refresh with the old cookie → 401; logout
    without cookies → 204.
  - Revoked session: after logout, the access token issued before it → 401
    `AUTHENTICATION_REQUIRED`; after reuse detection, the access token of that session → 401;
    session `expires_at` in the past → its access token 401; an access token whose `sid` belongs to
    another user's session → 401.
  - Deny by default: a test-only route without `@Public()` → 401 without a cookie, 200 with one;
    `/health/live` still 200 without a cookie. A test-only `@Roles('owner')` route → 200 for the
    owner, 403 `INSUFFICIENT_ROLE` for a `manager` added by the fixture.
  - Tenant context: two registered accounts, `/me` of each returns its own workspace.
  - Origin: login with `Origin: https://evil.example` → 403 `UNTRUSTED_ORIGIN` even with an
    invalid body; `Origin: null` → 403; a trusted origin → normal response; `GET /me` with an
    untrusted origin is not blocked.
  - Rate limit, on its own app instance: the 11th login within a minute → 429
    `TOO_MANY_REQUESTS` with `Retry-After`. With `TRUST_PROXY_HOPS=1`, two `X-Forwarded-For`
    addresses are counted separately; with 0 the header is ignored.
  - `Cache-Control: no-store` on every auth response.
  - OpenAPI document: the five auth operations; `/api/auth/me` with the cookie security scheme,
    the other four with `security: []`; their error responses reference `ApiProblem`.
  - Migrations: deploy and the drift check in global setup pass with the new tables.
- **e2e**: none (spec 13).

## 7. Acceptance criteria

- [ ] `pnpm --filter @clientry/api jwt:keygen` prints both keys; with `JWT_PRIVATE_KEY` in `.env`,
      `pnpm dev` starts. With it empty or invalid the process exits with code 1 before listening,
      and the message names the variable without its value.
- [ ] Swagger UI at `/api/docs`: register → 201 and both cookies in the browser with the attributes
      from section 2; `me` → 200; `logout` → 204; `me` → 401. Protected operations show the cookie
      lock, public ones do not.
- [ ] In `psql`: the new workspace has six stages in order; the password is an argon2id hash;
      `refresh_tokens` holds only hashes.
- [ ] `curl` login with `Origin: https://evil.example` → 403 `UNTRUSTED_ORIGIN`.
- [ ] Eleven failed logins within a minute → the last one 429 with `Retry-After`.
- [ ] The log of a register, login, refresh and logout contains no password, hash, token, email or
      cookie value.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally
      with Docker running.
- [ ] CI on this PR: `lint`, `typecheck`, `test` (with integration tests), `pr-title` green.
- [ ] Clean install has no engine, peer dependency or ignored build script warnings; new
      dependencies (`jose`, `@node-rs/argon2`, `@nestjs/throttler`, `cookie-parser`,
      `@types/cookie-parser`) are the latest stable versions, exact-pinned.
- [ ] `.env.example` lists the new variables; no key and no `.env` in the repo.
- [ ] One migration, `auth`, in the PR together with the code that uses it.
- [ ] ADR 0005 is written.
- [ ] This spec is part of the PR.
