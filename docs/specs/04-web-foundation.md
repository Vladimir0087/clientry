# 04 — Web foundation

Status: approved

## 1. Goal

A Next.js app in `apps/web` that talks to the API through a same-origin proxy, signs users up, in
and out with the auth endpoints of spec 03, keeps them signed in with one shared refresh, and
gives every later screen its layers, UI kit, data layer, forms, theme, security headers and test
harness.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/web/
  src/
    app/                         # Next App Router, also the FSD app layer
      layout.tsx                 # html, font, CSP nonce, providers
      globals.css                # Tailwind and shadcn theme tokens
      icon.svg
      not-found.tsx
      error.tsx
      global-error.tsx
      _providers/                # query client, theme, toaster, session-expired redirect
      (auth)/
        layout.tsx               # centered card
        login/page.tsx
        register/page.tsx
      (app)/
        layout.tsx               # shell, session prefetch
        loading.tsx
        page.tsx                 # home
        _components/             # shell header, home greeting
        _lib/                    # session prefetch (server-only)
    proxy.ts                     # session gate, CSP nonce
    features/auth/               # login and register forms, user menu with logout
    entities/session/            # current session query
    shared/
      api/                       # browser and server clients, errors, query client
      config/                    # environment schema
      lib/                       # redirect target, access token verification, page navigation
      ui/                        # shadcn components, theme menu; no index
  test/                          # setup, MSW server and handlers, key and token helpers
  components.json
  eslint.config.mjs
  next.config.ts
  postcss.config.mjs
  tsconfig.json
  turbo.json
  vitest.config.ts
packages/
  eslint-config/next.js
  typescript-config/next.json
  shared/src/auth/credentials.ts # human-readable messages
  shared/src/common/origin.ts    # parseOrigin, moved from the API config
  shared/src/common/invalid-config-error.ts # InvalidConfigError, moved from the API config
  shared/tsconfig.json           # dom lib for URL
apps/api/src/infra/config/       # takes parseOrigin and InvalidConfigError from shared
apps/api/src/main.ts             # the same
apps/api/src/modules/auth/auth-cookies.ts
apps/api/src/modules/auth/auth.controller.ts # Swagger examples with the new messages
.github/actions/setup/action.yml   # web variables for CI jobs
.env.example
.gitignore                         # next-env.d.ts
docs/adr/0006-frontend-architecture.md, 0007-web-session.md
```

**Runtime and build**

- Package `@clientry/web`, ESM. Next 16 App Router with Turbopack, React 19. New packages take
  the latest stable versions at implementation time, exact-pinned; packages the repo already uses
  keep their versions (section 7).
- Next 16 renamed middleware to proxy: the gate lives in `src/proxy.ts` and runs on the Node.js
  runtime. Where the plan says "middleware", it means this file.
- "SPA with perks" (plan, section 7): server components only for layouts, pages that compose
  features, and the session prefetch. Everything interactive is a client component with TanStack
  Query. No server actions and no Route Handlers: data goes through `/api/*` to the API.
- Client components that compose several slices for one route (the shell header with the user
  menu, the home greeting) live in a private `_components` folder next to that route: only the
  `app` layer may import features.
- `typedRoutes` on, so a link to a missing page fails typecheck. `poweredByHeader` off.
  `agentRules` off: otherwise `next dev` writes `AGENTS.md` and `CLAUDE.md` into the app whenever
  an AI agent runs it.
- `@clientry/shared` is consumed compiled, as in the API; no `transpilePackages`.
- Token verification and the server client import `server-only`, so a client component that
  imports them fails the build. The env module cannot: `next.config.ts` loads it outside Next's
  bundler.
- Every new install script is either allowed or denied in `allowBuilds`.

**Configuration**

| Variable         | Required | Notes                                                                                                    |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `API_URL`        | yes      | API origin for the rewrite and server-side requests; `http(s)://host[:port]`, no path                    |
| `JWT_PUBLIC_KEY` | yes      | SPKI PEM of the P-256 public key that `jwt:keygen` prints next to the private one; literal `\n` accepted |

- One zod schema in `shared/config` parses both into a readonly typed object, once. The message
  names every invalid variable and the reason, never the value. `API_URL` is normalized through
  `URL.origin`; a path, a query or a non-http scheme is invalid. `JWT_PUBLIC_KEY` must be an EC
  P-256 public key; an RSA key, another curve or a private key is invalid.
- `next.config.ts` parses them when it loads, so `next dev`, `next build` and `next start` stop
  before serving or building. The build needs both: `API_URL` is baked into the rewrite, and
  checking the key at build stops a deploy that lacks it. `next typegen` loads the config and calls
  `rewrites()` as well, so every task that runs Next needs both variables (see Tooling).
- `next.config.ts` runs as ESM under Node's own type stripping (the package is
  `"type": "module"`), not through Next's bundler. The env module it loads therefore imports only
  packages: no `@/` alias, no relative imports, no `server-only`.
- So `parseOrigin` and `InvalidConfigError` move from the API's config to
  `@clientry/shared/common`, and both apps validate origins and report invalid variables the same
  way. `packages/shared` adds the `dom` lib: it declares `URL`, which Node and the browser both
  have; DOM-only globals stay unused there.
- Locally, `next.config.ts` reads the root `.env` when it exists and takes only these two
  variables, without overriding ones already set. The API's `JWT_PRIVATE_KEY`, `DATABASE_URL`,
  `PORT` and `NODE_ENV` never enter the web process. `apps/web` has no `.env` of its own.
- `dev` and `start` pass `--port 3000` explicitly, so the web port never follows a `PORT` set in
  the shell.
- `.env.example` gains a web block: `API_URL=http://127.0.0.1:4000` and an empty `JWT_PUBLIC_KEY`
  with a comment naming the command. No key is committed.

**Proxy to the API**

- `rewrites` maps `/api/:path*` to `${API_URL}/api/:path*`. The browser talks only to the web
  origin. Cookies, `Origin`, `Set-Cookie` and `Retry-After` pass through unchanged, so the cookie
  attributes and the origin check from spec 03 work as they are.
- `/health/*` is not proxied. Swagger UI opens at `/api/docs` on the web origin.
- No Route Handler under `app/api`: the rewrite owns the whole prefix.
- `proxy.ts` does not run on `/api/*`, `/_next/*` and metadata files (its matcher). It does run on
  prefetch requests, unlike the CSP example in the Next docs: a prefetch renders the protected
  layout too.

**Session gate (`proxy.ts`)**

The proxy cannot see whether a refresh token exists: the refresh cookie is sent only to
`/api/auth`. The access cookie tells it instead:

- API change: `clientry_access` now lives as long as `clientry_refresh` (14 days, capped by the
  session end) instead of 15 minutes. The JWT inside still expires after 15 minutes and the API
  rejects it as before. Logout and a 401 from refresh still clear both cookies. A present cookie
  means "signed in, the token may have expired"; a missing one means "signed out".
- `verifyAccessToken` in `shared/lib` checks the cookie with `jose` and the public key: algorithm
  pinned to ES256, issuer and audience from `@clientry/shared/auth`, then
  `accessTokenClaimsSchema`. The key is imported once per process. Result:
  - `authenticated`, with the claims: the token is valid;
  - `expired`: only `exp` has passed; signature, algorithm, issuer, audience and claims are
    checked as strictly as for a valid token;
  - `anonymous`: no cookie, or anything else (another key, `alg: none`, tampered, malformed).

| Session         | Protected page                             | `/login`, `/register`     |
| --------------- | ------------------------------------------ | ------------------------- |
| `authenticated` | render                                     | redirect to `next` or `/` |
| `expired`       | render; the first API call refreshes       | render                    |
| `anonymous`     | redirect to `/login?next=<path and query>` | render                    |

- Every page except `/login` and `/register` is protected, unknown paths included: the gate
  denies by default, like the API.
- `next` is omitted when it would be `/`. Wherever `next` is followed (proxy, login, register),
  it is resolved against the app origin with `URL` and used only when the origins match and it is
  not an auth page; otherwise the target is `/`. Parsing rather than a prefix check, so
  `//evil.example`, `/\evil.example`, a tab inside `//`, absolute and `javascript:` URLs all fall
  back to `/`.
- The gate is a redirect for the user, not the security boundary: the API authorizes every call.
  The proxy never calls the API and never refreshes (ADR 0005).
- After 15 idle minutes, a reload, a client navigation or a refetch on returning to the tab
  renders at once and the first API call refreshes; there is no bounce through `/login`. Only a
  signed-out browser goes to `/login`, and it sees the form without waiting for the API, which
  matters while Render wakes up.
- The `(app)` layout checks the cookie with the same function; the proxy's verdict is not passed
  on through headers. `anonymous` there redirects to `/login` as well, without `next` since a
  layout does not know the path, in case the matcher ever misses a path.

**API client (`shared/api`)**

- Browser client: same-origin `/api/...` URLs, JSON bodies, `Accept: application/json`. Every call
  names the shared zod schema of its success body and the body is parsed with it; a 204 has no
  body. Web and API deploy separately, so contract drift fails loudly instead of rendering
  `undefined`.
- Errors, one class each:
  - `ApiError`: a non-2xx response, with `status`, `code`, `detail`, `requestId`, field `errors`
    and `retryAfterSeconds` from `Retry-After`. A body that is not `apiProblemSchema` (an HTML 502
    from a proxy while the API sleeps) gives code `UNEXPECTED_RESPONSE` with the real status and
    the request id from `X-Request-Id` when the response has one.
  - `NetworkError`: `fetch` rejected (offline, DNS, connection refused). An abort through TanStack
    Query's signal is rethrown as it is.
  - `ResponseContractError`: a success body off its schema.
  - `SessionExpiredError`: the session cannot be refreshed.
- Refresh:
  - Only a 401 with code `AUTHENTICATION_REQUIRED` triggers it; a 401 `INVALID_CREDENTIALS` from
    login never does.
  - One refresh in flight per tab: every request that gets that 401 while it runs waits for it.
    After a 200 each retries once; a second 401 gives `SessionExpiredError` without another
    refresh.
  - Refresh 401: every waiting request fails with `SessionExpiredError`. Any other outcome except
    a 200 (429, 403, 5xx, a network error, a 200 body off its schema): the waiting requests fail
    with that error and the session is not treated as expired (spec 03).
  - Two tabs refreshing together are covered by the API's 30-second grace period; no cross-tab
    lock.
- Server client: takes the incoming cookies as an argument (the layout reads them with
  `cookies()`), calls `API_URL` directly, forwards only the `clientry_access` cookie, no caching,
  never refreshes. Used for prefetch only.

**Server state (TanStack Query)**

- One query client per request on the server, one per tab in the browser.
- `staleTime` 60 s, so data prefetched on the server is not fetched again right after hydration.
- Queries retry at most twice, only on `NetworkError` and a 5xx `ApiError` (Render waking up);
  never on a 4xx, `ResponseContractError` or `SessionExpiredError`. Mutations never retry.
- Requests do not pause while the browser reports offline (`networkMode: 'always'`): they fail
  with `NetworkError` and show their error state, and queries refetch when the browser is back
  online.
- `SessionExpiredError` from any query or mutation goes to one handler in the app layer: a full
  page navigation that replaces the current history entry with
  `/login?next=<current path and query>`. Several failures at once give one navigation. Features
  never handle it themselves.
- Before navigating, the handler sends `POST /api/auth/logout` and ignores its outcome. After a
  refresh 200 and a second 401 the cookies still hold a valid JWT, and without clearing them the
  proxy would send `/login` straight back to the page.
- Leaving the session (this handler and logout) is a full page navigation, not a router
  transition: it drops the router cache, the query cache and every other in-memory state, and
  Back does not return to a protected page rendered from cache.
- Query keys are constants in their entity.
- `entities/session`: `sessionKeys` and `useSession()` over `GET /api/auth/me` with
  `sessionResponseSchema`. Login and register write their response into the same cache entry.
- Entering a session clears the query cache first: on success, login and register call
  `queryClient.clear()` before writing the session. A tab sent to `/login` by a client navigation
  (a logout in another tab) still holds the previous user's data, and the next user would see it
  until it goes stale.
- Prefetch: when the cookie is `authenticated`, the `(app)` layout prefetches the session through
  the server client and passes it down with `HydrationBoundary`; components read it with the same
  `useSession()`. The prefetch makes one attempt without retries and waits at most 1 second in
  total; on timeout or any error the page renders without it and the client fetches, refreshing
  if needed. `expired` skips the prefetch. The prefetch helper lives in `(app)/_lib`, not in
  `entities/session`: it imports the server client, and exporting it from the entity's index would
  pull `server-only` into every client component that imports `useSession`. Every
  later screen loads its first data this way (plan, section 7): server components never pass data
  as props.

**Forms**

- react-hook-form with `zodResolver` and the request schemas from `@clientry/shared/auth`, so the
  browser and the API validate with one schema. Mode `onTouched`: a field shows its error after
  the first blur, then on every change, and all fields on submit.
- Server field errors (`VALIDATION_FAILED`) go to their fields with `setError`; a path that
  matches no field goes to the form alert.
- One form alert (`role="alert"`) above the fields for errors that belong to no field.
- While submitting, the button is disabled with a spinner, so a double click sends one request.
- Response handling:

| Response                         | Login                                                                                                                              | Register                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 400 `VALIDATION_FAILED`          | field errors                                                                                                                       | field errors                                           |
| 401 `INVALID_CREDENTIALS`        | alert "Email or password is incorrect.", password cleared and focused                                                              | —                                                      |
| 403 `NO_WORKSPACE`               | alert "This account is not a member of any workspace."                                                                             | —                                                      |
| 409 `EMAIL_TAKEN`                | —                                                                                                                                  | on email: "An account with this email already exists." |
| 429                              | alert "Too many attempts. Try again in N seconds." (minutes from 60 s on, rounded up), or "Try again later." without `Retry-After` | same: registration allows 10 per hour, so minutes      |
| anything else, network, contract | alert "Something went wrong. Try again." plus "Reference: <requestId>" when known                                                  | same                                                   |

- The 429 wait reads "1 second" and "1 minute" in the singular.
- `autocomplete` on every field: `email`, `current-password` or `new-password`, `name`,
  `organization`. Password fields have a show/hide button with `aria-pressed`.
- Shared change: the auth request schemas get messages that read well in a form, used by both
  ends: "Enter your email", "Enter a valid email", "Enter your password", "Use at least 12
  characters", "Use at most N characters", "Enter your name", "Enter a workspace name". The rules
  stay as they are.
- Each field reports one message: an empty value gets only its "Enter …" message, so an empty
  password on register reads "Enter your password", not "Use at least 12 characters".
- The `VALIDATION_FAILED` examples in the auth controller's Swagger docs show the new messages.

**UI kit, styles, theme**

- Tailwind CSS 4 (CSS-first config in `globals.css`, PostCSS plugin), shadcn/ui on Radix
  primitives with CSS variable tokens and a neutral base color, `lucide-react` icons.
- Components come from the shadcn CLI, run as `pnpm dlx shadcn@4.21.1` (`init` and `add` only),
  into `shared/ui`, one file per component. The owner approved this temporary run for this spec;
  the CLI is not installed globally and is not a dependency. Once copied, components are repo
  code: they follow the repo's lint rules and are adjusted where they do not.
- The CLI's components import `cn` from the `cn` package (shadcn's replacement for clsx and
  tailwind-merge), so there is no local helper. Its `shadcn/tailwind.css` is not imported: the
  `data-*` variants the components use are copied into `globals.css`, which keeps the CLI out of
  the dependencies.
- Needed now: button, input, input-group (password show/hide), label, field, card, alert,
  dropdown-menu, skeleton, sonner, spinner, plus separator and textarea, which field and
  input-group import. Others come with the screen that needs them.
- Colors and spacing only from tokens: no hex in components, no inline styles, no CSS modules.
- Font: Geist from the `geist` package (`next/font/local` inside), so `dev` and `build` need no
  network: `next/font/google` downloads the files at build time.
- Theme: next-themes on the `class` attribute, default `system`, the choice persisted, no flash of
  the wrong theme on load. A theme menu (Light, Dark, System) in the shell header and on auth
  pages.
- Toasts: sonner, only for errors with no place on the page (a failed logout).
- Works from 360 px wide without horizontal page scroll.

**Security headers**

- Content Security Policy with a nonce per request, set by `proxy.ts`:
  `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`.
  Development adds `'unsafe-eval'` for React's dev tooling.
- No `upgrade-insecure-requests`: every resource is same-origin anyway, and Safari would upgrade
  `next start` on `http://localhost` to https and break it.
- `style-src 'unsafe-inline'` is a deliberate gap: Radix positions menus with `style` attributes,
  which a nonce cannot cover. Scripts, the real XSS vector, stay nonce-only.
- The nonce reaches Next's own scripts and the inline script of next-themes. A nonce needs pages
  rendered per request: the root layout reads it from the request for next-themes, so every page
  is dynamic. Nothing static is lost: the protected pages read the session cookie anyway.
- `headers()` in `next.config.ts` adds `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and
  `Permissions-Policy: camera=(), microphone=(), geolocation=()` to pages. Proxied `/api/*`
  responses keep the API's own headers. HSTS is the host's job (spec 05).

**Errors, loading, accessibility**

- `not-found.tsx`: "Page not found" and a link home. `error.tsx`: "Something went wrong" and "Try
  again". `global-error.tsx`: the same inside its own `<html>`.
- `(app)/loading.tsx`: skeletons of the page content; the `(app)` layout around it already draws
  the shell.
- Every component backed by a query has loading (skeleton), error (message and "Try again") and
  data states. Empty states come with the first lists.
- `lang="en"`, landmarks (`header`, `main`), a "Skip to content" link in the shell.
- Every field has a `label`; an invalid field gets `aria-invalid` and its message through
  `aria-describedby`; the form alert is announced.
- Everything works by keyboard with a visible focus ring; menus follow Radix's keyboard model.
  Icon-only buttons have accessible names.

**Tooling**

- `@clientry/typescript-config/next.json` (extends base): DOM libs and every option Next 16
  requires (`module: esnext`, `moduleResolution: bundler`, `jsx: react-jsx`, `esModuleInterop`,
  `resolveJsonModule`, `isolatedModules`, Next's TS plugin), plus `noEmit` and `incremental`, and
  `allowImportingTsExtensions`: under type stripping `next.config.ts` imports the env module with
  its `.ts` extension. The app's `tsconfig.json` adds the `@/*` → `src/*` alias and includes
  `next-env.d.ts`, `.next/types/**/*.ts` and `.next/dev/types/**/*.ts`. Next never edits a
  `tsconfig.json` that extends another, so these are listed by hand.
- `next-env.d.ts` is generated and goes to `.gitignore`, as Next's docs require: its content
  differs between `next dev` and `next build`.
- `@clientry/eslint-config/next` (extends base):
  - `@next/eslint-plugin-next` (recommended and Core Web Vitals), `eslint-plugin-react-hooks`
    (recommended), `consistent-type-imports`;
  - `@/` imports count as internal for import order, next to `@clientry/*`;
  - `@typescript-eslint/no-misused-promises` with `checksVoidReturn: { attributes: false }`, so
    `onSubmit={form.handleSubmit(...)}` passes; promises elsewhere stay checked;
  - accessibility rules from `eslint-plugin-jsx-a11y-x`, the maintained fork: the original
    `eslint-plugin-jsx-a11y` supports ESLint only up to 9;
  - FSD boundaries through `eslint-plugin-boundaries`. Layers: `app` (`src/app/**`,
    `src/proxy.ts`), `features/<slice>`, `entities/<slice>`, `shared/<segment>`. A layer imports
    only layers below it (`app → features → entities → shared`), nothing imports `app`, slices of
    one layer do not import each other, and another slice is reached only through its `index.ts`.
    Segments of `shared` are not slices and import each other freely (`shared/api` uses
    `shared/config` and `shared/lib`); `import-x/no-cycle` still applies;
  - `no-restricted-imports`: inside `features` and `entities`, no `@/features/*` or `@/entities/*`
    import of the own layer and no relative import of a directory or an `index`, so a slice never
    imports its own public API; `shared` is imported file by file (`@/shared/ui/button`), never by
    directory;
  - `test/` may import any layer, and a spec file may import `test/`. The proxy is a file outside
    any layer folder, so only its own spec may import it.
- steiger is not used: its full-FSD rules (pages, widgets, slice size) fight the lightweight
  layering.
- `apps/web/eslint.config.mjs` ignores `.next/**` and `next-env.d.ts`, and sets Next's `rootDir`
  to its own directory: the Next rules look for `src/app` from the working directory, which is the
  repo root when lint-staged runs ESLint.
- `apps/web/turbo.json` extends the root, like the API's with its `generate`:
  - a cached `typegen` task (`next typegen`, outputs `next-env.d.ts` and `.next/types/**`);
    `lint` and `typecheck` depend on it and on `^build`, so route types exist without a build;
  - `build` outputs `.next/**` without `.next/cache/**` and `.next/dev/**`, and hashes `API_URL`
    and the root `.env`, so a changed backend address never comes from cache;
  - `build` also depends on `lint` and `typecheck`: `next build` wipes `.next/types`, which they
    read, so they never run alongside it, and a build lints and typechecks the web first;
  - `typegen`, `dev` and `build` receive `API_URL` and `JWT_PUBLIC_KEY` through Turborepo's strict
    env mode;
  - `dev` and `test` depend on `^build`.
- Vitest with Testing Library, `user-event`, `jest-dom` matchers and MSW (`setupServer`,
  `onUnhandledRequest: 'error'`). Two projects by environment: `node` for server code (env, token
  verification, proxy), `jsdom` for client code. The API is replaced at the network level by MSW,
  never by mocking `fetch`. The only mocked modules are the router from `next/navigation` and the
  small helper behind full page navigations, which jsdom does not implement. The `node` project
  aliases `server-only` to an empty module, as Next's server build does: outside the
  `react-server` condition it throws on import.
- `test/` holds the MSW server with default handlers that answer bodies built from the shared
  schemas, an ES256 key pair generated per run and a token factory with overrides for expiry,
  signing key, algorithm, issuer, audience and claims.
- CI: every job loads `next.config.ts` (`lint` and `typecheck` through `typegen`, `test` through
  `build`), so the setup action exports `API_URL=http://127.0.0.1:4000` and a throwaway
  `JWT_PUBLIC_KEY` to `$GITHUB_ENV`. The key is the public line of `jwt:keygen` run in the job;
  its private half is discarded. The jobs themselves do not change.

**Architecture decision records**

- `0006-frontend-architecture.md`: Next App Router as an SPA with server-rendered shells over Vite
  and React; lightweight FSD with boundaries enforced by lint over full FSD and over folders by
  file type; server state in TanStack Query, forms in react-hook-form, filters in the URL, no
  Redux or Zustand; a same-origin proxy through rewrites over CORS with cross-site cookies, with
  the consequence that `API_URL` is fixed at build, so a new backend address needs a web rebuild
  but no code change; a nonce CSP over a static one.
- `0007-web-session.md`: the proxy verifies the access JWT with the public key and tells an
  expired session from a signed-out browser by the cookie outliving its JWT; refresh only in the
  browser, one per tab, on `AUTHENTICATION_REQUIRED`. Alternatives: a client "restore session"
  page (a visible hop on every return, and a spinner instead of the login form while the API
  wakes up); refresh in the proxy (the refresh cookie never reaches it, ADR 0005); a third,
  readable "signed in" cookie (says what the access cookie already says); a timer that refreshes
  before expiry (keeps idle tabs refreshing forever). Consequence: replacing the signing key sends
  every user to `/login` once instead of a silent refresh, since the proxy cannot tell a token
  signed by the old key from a forged one.

### Out of scope

- Dockerfile for the web, the Compose `full` profile, the Vercel project, hosting variables,
  cookies and `X-Forwarded-For` through the Vercel proxy, HSTS (spec 05).
- Navigation and screens for clients, deals and tasks; nuqs comes with the first list (spec 06),
  dnd-kit with the board (spec 07), recharts with the dashboard (spec 10).
- Page gating by role in the proxy (spec 09, if a page needs it; the API already enforces roles).
- The demo login button (spec 11). Playwright e2e (spec 12).
- Password reset, email verification, account settings, avatars, a workspace switcher.
- Refresh ahead of expiry and cross-tab sync: a logout in one tab is noticed by another on its next
  navigation or request.
- i18n, analytics, error tracking, PWA, React Compiler, TanStack Query devtools.

## 3. Data model

No tables and no migration. The one API change touches only a cookie lifetime (section 4).

## 4. API

No new endpoints. The web app uses the auth endpoints of spec 03 through the proxy:

| Endpoint                  | Used by                       | Notes                                   |
| ------------------------- | ----------------------------- | --------------------------------------- |
| `POST /api/auth/register` | register form                 | the response fills the session cache    |
| `POST /api/auth/login`    | login form                    | the response fills the session cache    |
| `POST /api/auth/refresh`  | browser API client            | one in flight per tab; a 401 signs out  |
| `POST /api/auth/logout`   | user menu, session expiry     | then a full page navigation to `/login` |
| `GET /api/auth/me`        | `useSession`, server prefetch | `sessionResponseSchema`                 |

Cookie change in `apps/api/src/modules/auth/auth-cookies.ts`:

| Cookie            | Max-Age before | Max-Age now                                               |
| ----------------- | -------------- | --------------------------------------------------------- |
| `clientry_access` | 15 min         | as `clientry_refresh`: 14 days, capped by the session end |

Pages:

| Path        | Access    | Title          |
| ----------- | --------- | -------------- |
| `/login`    | public    | Log in         |
| `/register` | public    | Create account |
| `/`         | protected | Home           |

Developer scripts in `apps/web`:

| Script           | Does                            |
| ---------------- | ------------------------------- |
| `pnpm dev`       | `next dev --port 3000`          |
| `pnpm build`     | `next build`                    |
| `pnpm start`     | `next start --port 3000`        |
| `pnpm typegen`   | `next typegen`                  |
| `pnpm typecheck` | `tsc --noEmit`, after `typegen` |
| `pnpm test`      | both Vitest projects            |
| `pnpm lint`      | as in other packages            |

## 5. UI

**Auth layout.** A centered card up to 400 px wide with the "Clientry" mark above it and the theme
menu in the corner. On a phone the card takes the full width with 16 px gutters.

**Log in (`/login`).**

- Heading "Log in to Clientry"; fields Email and Password (with show/hide); button "Log in"; link
  "No account? Create one" to `/register`, keeping `next`.
- States: idle; field errors; submitting; the form alert from the table in section 2; success →
  `next` or `/`.

**Create account (`/register`).**

- Heading "Create your workspace"; fields Your name, Workspace name, Email, Password with the hint
  "At least 12 characters"; button "Create account"; link "Already have an account? Log in" to
  `/login`, keeping `next`.
- States as on login, plus the email error for 409; success → `next` or `/`.

**Shell (every protected page).**

- Header: "Clientry" linking to `/`, the workspace name (hidden below the `sm` breakpoint), the
  theme menu, the user menu. Skeletons for the workspace name and the menu button while the
  session loads. If the session query fails, the workspace name is left out and the user menu,
  with an icon instead of initials, holds only "Log out"; the page's own error with "Try again"
  refetches the same query.
- User menu: a button with the user's initials, accessible name "Account". Inside: name, email,
  role ("Owner" or "Manager"), "Log out".
- Log out: the item is disabled while pending; success → full page navigation to `/login` that
  replaces the current history entry; failure → toast "Could not log out. Try again." and the
  user stays.
- No navigation links yet: clients, deals and tasks add theirs with their specs.

**Home (`/`).**

- "Welcome, <name>" and "<workspace> · <role>". Loading: skeleton lines. Error: a message and "Try
  again". It stays the landing page until the dashboard (spec 10).

**System pages.** Not found, error and global error as in section 2.

Every screen is checked at 390×844 and 1280×800, in light and dark themes, and at 360 px wide for
horizontal scroll.

## 6. Tests

- **Unit, node**
  - Env schema: both variables missing → one error naming both, without values; `API_URL` with a
    trailing slash normalized, with a path, a query or `ftp://` rejected; `JWT_PUBLIC_KEY` with
    literal `\n` accepted, not a PEM, an RSA key, a P-384 key and a private key rejected.
  - Root `.env` loading: takes only `API_URL` and `JWT_PUBLIC_KEY`, never overrides a variable
    already set, a missing file is not an error.
  - Shared auth schemas: empty email → "Enter your email", `ann@` → "Enter a valid email", empty
    login password → "Enter your password", an 11-character password on register → "Use at least
    12 characters", an empty register password → only "Enter your password", blank name → "Enter
    your name"; the spec 03 tests of what is accepted stay.
  - Access token verification: valid → `authenticated` with the claims; expired → `expired`;
    expired and signed by another key, expired with a wrong issuer, expired with claims off the
    schema → `anonymous`; another key, `alg: none`, HS256 signed with the public key as the
    secret, wrong issuer, wrong audience, garbage, claims without `wid` → `anonymous`.
  - Redirect target: `/` and `/clients?q=a` kept; `//evil.example`, `/\evil.example`, a tab
    inside `//`, `https://evil.example`, `javascript:alert(1)`, `/login`, `/register`, empty and
    missing → `/`.
  - Proxy: every cell of the gate table; `next` carries path and query and is omitted for `/`;
    `authenticated` on `/login?next=/x` → `/x`, on `/login?next=//evil.example` → `/`; the CSP
    nonce differs between two requests and equals the one forwarded to rendering; `'unsafe-eval'`
    only outside production; the matcher skips `/api/auth/me`, `/_next/static/chunk.js` and
    `/icon.svg` and runs on `/` with `Next-Router-Prefetch: 1`.
  - Server client: forwards only `clientry_access` from the incoming cookies and bypasses the
    cache; a 401 → `ApiError` without a refresh.
  - Session prefetch: 200 → the session in the cache; a response slower than 1 second, a 401 and
    a 503 → exactly one request, resolves within about 1 second without data and without
    throwing; an `expired` cookie → no request.
- **Unit and component, jsdom with MSW**
  - API client: success parsed; 204 without a body; problem details → `ApiError` with every field
    and `retryAfterSeconds`; an HTML 502 → `ApiError` `UNEXPECTED_RESPONSE`; a refused connection
    → `NetworkError`; a success body off its schema → `ResponseContractError`; 401
    `AUTHENTICATION_REQUIRED` → one refresh, one retry, success; three concurrent 401 → exactly one
    refresh and three retries; refresh 401 → all three `SessionExpiredError`, none retried; 401
    again after the retry → `SessionExpiredError`, no second refresh; refresh 429, 403, 503, a
    network error and a body off its schema → the original requests fail with that error, not
    `SessionExpiredError`; 401
    `INVALID_CREDENTIALS` → no refresh; a 401 after a finished refresh starts a new one; an abort
    through the signal rejects with the abort error, not `NetworkError`.
  - Query client: `NetworkError` and 503 retried twice; 400, 401, 404, `ResponseContractError`
    and `SessionExpiredError` not retried; mutations not retried; `SessionExpiredError` from two
    queries and a mutation at once → one handler call.
  - Session-expired handler: one `POST /api/auth/logout`, then one full page navigation, replacing
    the history entry, to `/login?next=` with the current path and query; a failed logout still
    navigates.
  - Login form: empty submit → messages under both fields and no request; 401 → alert, password
    empty and focused, email kept; server field errors under their fields; 403 `NO_WORKSPACE`,
    429 with `Retry-After: 1` ("1 second"), `30`, `60` ("1 minute"), `3540` ("59 minutes") and
    without it, a 500 with a request id → the alerts from the table; a double click while pending → one request;
    success → a query cached before it is gone, session in the cache, route replaced with `next`
    or `/`.
  - Register form: the password hint is linked through `aria-describedby`; 409 → error on email;
    success → a query cached before it is gone, session in the cache, route replaced with `next`
    or `/`.
  - User menu: shows name, email and role; "Log out" → one `POST /api/auth/logout`, then a full
    page navigation to `/login`; a failed logout → toast, no navigation.
  - Shell header: skeletons while the session is pending; when it fails, no workspace name and a
    menu with only "Log out".
  - Theme menu: choosing Dark puts `dark` on `<html>`.
  - Home greeting: skeleton while pending, name and workspace on success, error with "Try again"
    that refetches.
  - Accessibility: every field found by its label; an invalid field has `aria-invalid` and its
    message through `aria-describedby`; the form alert has `role="alert"`.
- **Unit and integration, apps/api**
  - Cookie helper: the access cookie's Max-Age equals the refresh cookie's, including the cap at
    the session end.
  - Register, login and refresh set `clientry_access` with the same Max-Age as `clientry_refresh`;
    the other attribute checks of spec 03 stay; an access cookie holding an expired JWT → 401
    `AUTHENTICATION_REQUIRED`.
- **e2e**: none (spec 12). The proxy, real cookies and refresh in a browser are checked with
  `browser-verify` (section 7).
- **Tooling checks**, done once on throwaway files that are not committed; each must fail:
  - `entities/session` importing `@/features/auth`; `shared` importing `@/entities/session`;
    anything importing from `src/app` (lint);
  - one feature importing another (lint);
  - `@/entities/session/model/...` from a feature, bypassing the index (lint);
  - inside `features/auth`: `from '..'`, `from '../index'`, `from '@/features/auth'` (lint);
  - `from '@/shared/ui'` as a directory (lint);
  - `<img>` without `alt`, a `<div onClick>` without a role and key handler, a hook inside `if`,
    `<a href="/">` instead of `Link` (lint);
  - `<Link href="/missing">` (typecheck);
  - a client component importing a `server-only` module (`next build`).

## 7. Acceptance criteria

- [ ] With `API_URL` and `JWT_PUBLIC_KEY` in the root `.env`, `pnpm infra:up` and `pnpm dev` start
      the API on 4000 and the web on 3000. Without `JWT_PUBLIC_KEY`, or with the private key in
      it, the web's `dev`, `build` and `typegen` stop with a message naming the variable, not its
      value.
- [ ] `next-env.d.ts` is not tracked; `pnpm typecheck` and `pnpm lint` pass on a fresh clone with
      the root `.env` filled in and without a previous build.
- [ ] Signed out: `/` redirects to `/login`, `/anything?x=1` to `/login` with `next`; `/login`
      renders without any request to the API.
- [ ] Register → `/` with the name and the workspace; both cookies on `localhost:3000` with the
      attributes of spec 03 and the new access Max-Age; no token in the page source.
- [ ] Reload on `/` within 15 minutes of logging in: the server HTML already contains the name,
      no skeleton flash.
- [ ] After 15 idle minutes, a reload and a return to the tab (refetch on focus) render without
      visiting `/login`; Network shows one `refresh` with 200 and the retried request.
- [ ] Log out → `/login`; Back stays signed out. A logout in another tab sends this tab to
      `/login` on its next navigation or request.
- [ ] `/login?next=https://evil.example` and `?next=//evil.example` land on `/` after login.
- [ ] Wrong password → alert; the eleventh attempt within a minute → the 429 alert with the wait
      from `Retry-After`.
- [ ] With the API stopped, login shows the generic alert; no unhandled error in the console.
- [ ] Page responses carry the nonce CSP and the other headers; `/api/*` responses carry the API's.
      No CSP violation in the console under `pnpm dev` and under `build` plus `start`.
- [ ] Swagger UI opens at `http://localhost:3000/api/docs`, and "Try it out" on `me` works after
      logging in on the web.
- [ ] At 390 px forms and menus are usable; at 360 px and 390 px there is no horizontal scroll. The theme follows the system by
      default, the choice survives a reload, no wrong-theme flash.
- [ ] Keyboard only: register, log in, open the user menu, log out; focus always visible.
- [ ] `browser-verify` over the screens of section 5 at both sizes and in both themes: no failed
      requests except the expected 401 before a refresh, and no console errors except the
      browser's own "Failed to load resource" line for that 401.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `pr-title` green.
- [ ] Every tooling check from section 6 fails as described.
- [ ] Clean install has no engine, peer dependency or ignored build script warnings; every install
      script is allowed or denied in `allowBuilds`.
- [ ] Packages the repo already uses keep their exact versions: `typescript` (the newest that
      typescript-eslint supports, ADR 0001; the `latest` tag is already 7.x), `zod`, `jose`,
      `eslint`, `vitest`, `vite`, `@types/node`. New ones are the latest stable versions,
      exact-pinned: `next`, `react`, `react-dom`, `@tanstack/react-query`, `react-hook-form`,
      `@hookform/resolvers`, `next-themes`, `sonner`, `geist`, `lucide-react`, `server-only` and
      what the shadcn CLI adds; dev: `tailwindcss`, `@tailwindcss/postcss`, `@types/react`,
      `@types/react-dom`, `jsdom`, `@testing-library/react`, `@testing-library/dom` (a required
      peer of `@testing-library/react`, `user-event` and `jest-dom`), `@testing-library/user-event`,
      `@testing-library/jest-dom`, `msw`; in the ESLint preset: `@next/eslint-plugin-next`,
      `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y-x`, `eslint-plugin-boundaries`.
- [ ] `.env.example` lists the web variables; no key and no `.env` in the repo.
- [ ] ADRs 0006 and 0007 are written.
- [ ] This spec is part of the PR.
