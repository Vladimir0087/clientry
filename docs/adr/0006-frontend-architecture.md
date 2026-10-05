# 0006 — Frontend architecture

Status: accepted
Date: 2026-10-05

## Context

Everything in the CRM sits behind a login, so nothing needs SEO, and the data on a screen changes
without navigation: a board, a list with filters, a form. The app still has to load fast on a
phone, show the user's name on the first paint, and grow screen by screen without a rewrite. The
API is a separate Nest service on another host (ADR 0002), and refresh tokens live in httpOnly
cookies (ADR 0005), which only work without friction when the browser talks to one origin.

## Decision

- **Next.js App Router as an SPA with server-rendered shells.** Server components only for
  layouts, pages that compose features, and the first-data prefetch. Everything interactive is a
  client component. No server actions and no Route Handlers: data goes through `/api/*` to the
  API, so the API stays the only backend.
- **Lightweight Feature-Sliced Design.** Layers `app → features → entities → shared`; a slice is
  reached only through its `index.ts`, and `shared` is imported file by file. Client components
  that compose several slices for one route live in a private `_components` folder next to that
  route. `eslint-plugin-boundaries` and `no-restricted-imports` enforce the rules in lint.
- **State by kind, no global store.** Server state in TanStack Query with key constants per
  entity; forms in react-hook-form with the shared zod schemas; filters, search and sorting in the
  URL (nuqs, from spec 06); UI state in `useState`; theme in next-themes. Server components never
  pass data as props: they prefetch into the query cache and hand it over with
  `HydrationBoundary`, and components read it with the same hooks.
- **Same-origin proxy through `rewrites`.** `/api/:path*` maps to `${API_URL}/api/:path*`.
  Cookies, `Origin` and `Set-Cookie` pass through unchanged, so the cookie attributes and the
  origin check of ADR 0005 work as they are.
- **UI kit copied in, not installed.** shadcn/ui components on Radix primitives, generated once by
  the CLI into `shared/ui`, then owned as repo code. Tailwind CSS 4 with theme tokens as CSS
  variables; colors and spacing only from tokens.
- **Nonce CSP.** The proxy sets a per-request nonce in `script-src` with `'strict-dynamic'`; the
  root layout reads it for next-themes, so every page renders per request.

## Alternatives

- **Vite and React.** Lighter for an SPA, but loses the App Router layouts, the proxy gate and
  server prefetch, and Next is what most React roles ask for. Rejected.
- **Next as a full-stack app with server actions.** Would duplicate the API's validation, auth and
  tenancy in a second backend. Rejected.
- **Full FSD with pages and widgets, checked by steiger.** Its slice-size and layer rules fight
  the lightweight layering and add folders without adding boundaries. Rejected.
- **Folders by file type** (`components`, `hooks`, `services`). No boundaries to lint, so features
  drift into each other. Rejected.
- **Redux or Zustand.** With server state in Query, forms in react-hook-form and filters in the
  URL, no global client state is left to hold. Zustand comes in only for a concrete case.
- **CORS with cross-site cookies.** Needs `SameSite=None`, which Safari's tracking prevention
  blocks, and a second origin to configure everywhere. Rejected.
- **A static CSP with hashes.** Next's inline bootstrap scripts change per build and per page, so
  hashes would need tooling Next does not provide. Rejected.

## Consequences

- `API_URL` is baked into the rewrite at build: moving the backend needs a web rebuild, but no
  code change.
- Every page is dynamic because of the nonce; nothing is lost, since protected pages read the
  session cookie anyway.
- `style-src 'unsafe-inline'` stays open: Radix positions menus with `style` attributes.
- Each new screen adds a slice or extends one, and lint rejects an import across the layers.
- shadcn updates are not automatic: a component is re-generated and reviewed like any other diff.
