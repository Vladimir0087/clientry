# 06 — Clients

Status: approved

## 1. Goal

A team keeps its clients in Clientry: anyone in the workspace adds, reads and edits them, finds
them by search, source, tags and creator in a list that pages with a cursor and keeps its filters
in the URL, and deletes them softly, with an undo, under the role rules of the plan.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/schema.prisma                      # Client, enum client_source
  prisma/migrations/<timestamp>_clients/    # pg_trgm and the ICU collation added by hand
  src/
    app.module.ts                           # ClientsModule
    modules/clients/
      clients.controller.ts
      clients.service.ts
      clients.module.ts
      clients.repository.ts                 # contract
      prisma-clients.repository.ts
      client-cursor.ts                      # keyset cursor encode and decode
      like-pattern.ts                       # escapes %, _ and \ for ILIKE
      errors.ts
  test/fixtures/clients.ts                  # direct inserts for list and pagination tests
apps/web/src/
  app/(app)/
    _components/main-nav.tsx
    _lib/access-session.ts                  # one token verification per request
    _lib/prefetch.ts                        # the session prefetch, generalized
    clients/
      page.tsx, loading.tsx                 # list
      _components/clients-view.tsx          # toolbar and list
      new/page.tsx, new/loading.tsx
      [id]/page.tsx, [id]/loading.tsx       # card
      [id]/_components/client-view.tsx      # card and delete
      [id]/edit/page.tsx, [id]/edit/loading.tsx
  features/
    client-form/                            # create and edit form, tag input
    client-filters/                         # URL state, toolbar controls
    delete-client/                          # confirm dialog, undo toast
  entities/client/                          # keys, API calls, queries, list, details, labels
  shared/
    ui/                                     # form-field, text-field, form-alert, submit-button
                                            # (moved from features/auth), local-date, and table,
                                            # badge, alert-dialog, select, empty (shadcn)
    lib/submit-error.ts                     # moved from features/auth
packages/shared/src/
  clients/                                  # new entry point @clientry/shared/clients
  common/one-or-many.ts
  auth/permissions.ts                       # canDeleteRecord
docs/adr/0009-client-search-and-pagination.md
```

**Tenancy**

- Every repository method takes `workspaceId` first. It comes from `AuthUser`, never from the body,
  the query or the path. Unknown body keys (`workspaceId`, `createdById`, `deletedAt`) are
  stripped by the schema and never reach the repository.
- A client of another workspace and a soft-deleted client answer 404 `CLIENT_NOT_FOUND`, on every
  route, so neither existence nor deletion leaks.
- `createdById` is the caller's id from `AuthUser`. Clients reference nothing else, so there is no
  cross-workspace reference to check.

**Roles**

| Action                       | owner | manager          |
| ---------------------------- | ----- | ---------------- |
| Create, read, list, edit     | yes   | yes              |
| Delete, restore after delete | yes   | own clients only |

- "Own" means `createdById` equals the caller. The rule is one pure function,
  `canDeleteRecord({ userId, role }, createdById)` in `@clientry/shared/auth`: the service enforces
  it and the web uses it to show the Delete button, so the two ends cannot disagree. Deals reuse it
  in spec 07.
- A manager deleting someone else's client gets 403 `CLIENT_DELETE_FORBIDDEN`, not 404: the client
  is visible to them, only the action is not allowed.
- The check runs in the service after the client is found; no `@Roles` on the routes.

**Fields**

| Field     | Required | Rules                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------- |
| `name`    | yes      | trimmed, 1–200 characters, no NUL                                                           |
| `company` | no       | trimmed, up to 200 characters, no NUL                                                       |
| `email`   | no       | trimmed, lowercased, up to 254 characters, a valid email                                    |
| `phone`   | no       | trimmed, up to 32 characters; digits, spaces, `( ) . -`, an optional leading `+`; 5+ digits |
| `source`  | no       | `website`, `telegram`, `referral`, `other`                                                  |
| `notes`   | no       | trimmed, up to 5000 characters, no NUL; line breaks kept                                    |
| `tags`    | no       | up to 10; each trimmed, lowercased, 1–32 characters, no comma, no NUL; unique               |

- Optional text fields accept a string, an empty string or `null`. Empty after trimming and `null`
  both mean "no value" and are stored as `NULL`; responses never contain empty strings. So the
  request schema is also the form schema: blank inputs pass as `''` and the browser and the API
  validate with one schema, without `.transform()`.
- Phones are kept as typed and shown as typed; the `tel:` link uses the digits and the leading `+`.
  No normalization to E.164.
- Tags are lowercased so `VIP` and `vip` are one tag in filters and counts. Commas are not allowed
  because the tag input and the page URL use them as separators. Order is kept as entered.
- Sources are an enum, not free text: the brief names the channels (site, Telegram, referrals), and
  an enum filters and aggregates (spec 10) without spelling variants. Labels: Website, Telegram,
  Referral, Other.
- Messages: "Enter a name", "Use at most N characters", "Enter a valid email", "Enter a valid phone
  number", "Tags cannot contain commas", "Tags must be unique", "Use at most 10 tags".

**Create, edit, delete, restore**

- Create returns the full client with 201.
- Edit is `PATCH`: a field left out is unchanged, `''` or `null` clears an optional field, `name`
  cannot be cleared. An empty body answers 200 with the client unchanged and does not touch
  `updated_at`. The update is one conditional statement on `id`, `workspace_id` and
  `deleted_at IS NULL`; no row → 404.
- Concurrent edits: last write wins per field. The web sends only the fields the user changed, so
  two people editing different fields do not overwrite each other. Record versions come with deals
  in spec 07, where the board makes concurrent moves likely.
- Delete sets `deleted_at`. The service reads the creator, checks `canDeleteRecord`, then runs a
  conditional update on `deleted_at IS NULL`; no row (a concurrent delete) → 404. Deleting again
  → 404.
- Restore (`POST /api/clients/:id/restore`) finds the client including deleted ones, applies the
  same rule, and clears `deleted_at`. An active client answers 200 unchanged, so a double click on
  Undo is harmless. It exists for the undo toast; there is no trash view.
- What happens to a deleted client's deals is spec 07's decision.

**List: filters, search, sort, pagination**

`GET /api/clients` with `clientListQuerySchema`:

| Param       | Values                                                       | Meaning                                               |
| ----------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| `q`         | trimmed, up to 100 characters, no NUL; blank ignored         | substring of name, company, email or phone            |
| `source`    | one or more sources, repeated (`source=a&source=b`), up to 4 | any of them                                           |
| `tag`       | one or more tags, repeated, up to 10                         | all of them                                           |
| `createdBy` | `me`                                                         | created by the caller; room for a member id (spec 09) |
| `sort`      | `newest` (default), `oldest`, `name_asc`, `name_desc`        | order                                                 |
| `cursor`    | opaque string, up to 2048 characters                         | continue after the previous page                      |
| `limit`     | integer 1–100, default 25                                    | page size                                             |

- Repeated params arrive as a string for one value and an array for several (Express 5's simple
  query parser). `oneOrMany(schema, max)` in `@clientry/shared/common` accepts both without a
  transform; the service turns them into arrays.
- `clientListQuerySchema` has no `.meta({ id })`: `@nestjs/swagger` splits a query schema into
  parameters only when it converts to an inline object, and an id turns it into a `$ref`.
- Search is case-insensitive `ILIKE '%q%'` over the four columns, backed by trigram GIN indexes
  (`pg_trgm`), so a term of three or more characters stays index-served as a workspace grows and
  matches the middle of a name, an email or a phone. Shorter terms have no trigrams and scan the
  workspace's rows, which is acceptable at this size. `%`, `_` and `\` in `q` match literally: `like-pattern.ts` escapes them, since
  Prisma's `contains` passes them through as wildcards.
- Sort is always completed with `id` in the same direction, so the order is total.
- Name order is case-insensitive and the same everywhere: `name` has the ICU collation
  `und-x-icu`. The database defaults differ: Neon creates databases with `C.UTF-8`, where `Zeta`
  sorts before `acme`, and the Docker image with `en_US.utf8`.
- Pagination is keyset, not offset: a page never skips or repeats rows when clients are added or
  deleted between pages. The cursor is base64url JSON `[sort, value, id]` of the last row, where
  `value` is `created_at` as an ISO string or the name. It is built and parsed in
  `client-cursor.ts` and validated with zod. The values travel in the cursor rather than being read
  back by id, as Prisma's `cursor` option does, so renaming the last row between pages does not
  shift the next page.
- The 2048-character limit fits the longest name: 200 characters, each escaped to at most six
  bytes in JSON, then base64url.
- A cursor that does not decode, does not match the schema, or was made for another sort answers
  400 `VALIDATION_FAILED` with `{ path: "cursor", message: "Invalid cursor" }`. Cursors are not
  signed: a forged one only moves the position inside the caller's own workspace.
- The repository reads `limit + 1` rows; `nextCursor` is set only when the extra row exists, and is
  `null` on the last page.
- No total count: it would cost a second query per page, and the UI does not need it.
- List items are `clientSummarySchema`: the client without `notes`.
- The creator's name comes with each row through a relation select. The number of SQL statements
  per list request does not depend on the page size (checked in tests, plan section 9).

`GET /api/clients/tags` lists the workspace's tags with counts over active clients, ordered by
`tag COLLATE "und-x-icu"` (values from `unnest` carry the database default, not the column's), for
the filter menu and the form's suggestions. One `$queryRaw` with
`unnest(tags)` and bound parameters; no string-built SQL. The count is cast to `int`: Postgres
returns `count(*)` as `bigint`, which Prisma reads as `BigInt` and JSON cannot serialize.

**Logging**

- `info` on create, delete and restore with client id, workspace id and user id.
- No names, emails, phones, notes, tags or search strings in log lines. The request log already
  drops query strings (spec 02).

**Errors (`modules/clients/errors.ts`)**

| Class                        | Kind      | Code                      | Detail                                        |
| ---------------------------- | --------- | ------------------------- | --------------------------------------------- |
| `ClientNotFoundError`        | NotFound  | `CLIENT_NOT_FOUND`        | Client not found                              |
| `ClientDeleteForbiddenError` | Forbidden | `CLIENT_DELETE_FORBIDDEN` | Managers can delete only clients they created |

A malformed `:id` answers 400 `VALIDATION_FAILED` on `id`, before any query: Postgres would
otherwise fail the UUID cast with a 500. The params are validated as one object,
`@Param({ schema: clientIdParamsSchema })` with `z.object({ id: z.uuid() })`: a schema on a single
named param reports its issue with an empty path, so the field error would read `""`, not `id`.

**Swagger**

- Tag `clients`; all seven operations carry the cookie security scheme (applied by
  `setup-swagger.ts` to every operation without `@Public()`) and document their error responses
  with examples built from the domain errors. The 401 `AUTHENTICATION_REQUIRED` response is
  declared once on the controller. Query parameters come from `clientListQuerySchema`.

**Shared contracts (`@clientry/shared/clients`)**

- New entry point in `packages/shared/package.json` `exports`.
- `clientSourceSchema`, `clientSortSchema`;
- `createClientRequestSchema` (also the form schema), `updateClientRequestSchema` (every field
  optional, `name` non-empty when present);
- `clientIdParamsSchema` (`{ id }`, a UUID);
- `clientResponseSchema` (`Client`), `clientSummarySchema` (`ClientSummary`),
  `clientListQuerySchema`, `clientListResponseSchema` (`{ items, nextCursor }`),
  `clientTagsResponseSchema` (`{ items: [{ tag, count }] }`);
- `CLIENT_LIMITS`: the lengths and counts of the field table, page size default and maximum;
- inferred types for each.
- Dates are ISO strings (`z.iso.datetime()`); the repository maps `Date` to strings, so the strict
  serializer of spec 02 parses what it returns and the web parses the same schema.
- `@clientry/shared/common` gains `oneOrMany`; `@clientry/shared/auth` gains `canDeleteRecord`.

**Web: data layer (`entities/client`)**

- `clientKeys`: `all`, `lists`, `list(filters)`, `detail(id)`, `tags`.
- API calls through the browser client with the shared schemas: list, get, tags, create, update,
  delete, restore. `clientListPath(filters, cursor)` builds the API URL; the browser and the server
  prefetch both use it.
- Filters are normalized once (trimmed search, sorted unique lists, defaults dropped) before they
  become a query key or a URL, so `?source=telegram,website` and `?source=website,telegram` share
  one cache entry and one request.
- `useClientList(filters)`: `useInfiniteQuery` with `initialPageParam: null`, `getNextPageParam`
  from `nextCursor`, `placeholderData: keepPreviousData`, so the old rows stay, dimmed, while new
  filters load. `useClient(id)`, `useClientTags()`.
- After create and edit: the detail is written into the cache, lists and tags are invalidated.
- After delete: the route is replaced first, then lists and tags are invalidated and the detail is
  marked stale without a refetch (`refetchType: 'none'`). Removing or refetching it while the card
  is still mounted would request it again and get a 404; a later visit refetches and shows not
  found.
- Undo outlives the card, which has unmounted by then: the restore mutation keeps its success and
  error handling (toasts, invalidating lists, tags and the detail) in its own options, not in
  `mutate()` callbacks, which TanStack drops once the calling component unmounts.

**Web: URL state (`features/client-filters`)**

- nuqs with its App Router adapter in the providers. Page params: `q`, `source` and `tags`
  (comma-separated), `mine` (`true`), `sort` (left out when `newest`). Defaults are cleared from the
  URL. A shared link, a reload and Back all restore the same list.
- Updates are shallow and replace the history entry: a filter change never re-renders the server
  page, the list refetches through Query, and Back leaves the list instead of stepping through
  keystrokes. Back from a client card returns to the filtered list.
- Search: the input keeps its own state and writes `q` to nuqs 300 ms after the last keystroke;
  Enter and clearing write at once. The list's query key reads `q` from nuqs, so one pause sends one
  request. nuqs's own `limitUrlUpdates` is not used for this: it delays only the URL, while the
  hook's value, and so the key, would change on every keystroke. When `q` changes from outside
  (Back, "Clear filters"), the input takes the new value.
- The parsers live in one module imported from `nuqs/server`, which has no `'use client'`, and serve
  both the client hook and a `createLoader` for the server page, so the server prefetches exactly
  the page the client asks for.
- Parsing drops what the shared schemas would reject: an unknown source, a tag that fails the tag
  rules, values past the maximum count, an unknown sort. Tags are lowercased and `q` is cut to 100
  characters. A hand-edited URL therefore never produces a 400, it just filters less.

**Web: server prefetch**

- `(app)/_lib/access-session.ts` exports `getAccessSession()`, without arguments: it reads
  `cookies()` itself and is wrapped in React `cache()`, so the layout and a page share one
  verification per request. Arguments would defeat the cache: the cookie store objects the layout
  and the page get are not the same object.
- `(app)/_lib/prefetch.ts` generalizes the session prefetch of spec 04 and 05: one attempt, at most
  1 second, failures logged as one `warn` line `<Label> prefetch failed` with the fields of spec 05,
  then swallowed; skipped when the cookie is `expired`. The session prefetch moves onto it, and its
  line stays `Session prefetch failed`. A 404 of the client prefetch is an expected outcome (a link
  to a deleted client) and is not logged.
- `/clients` prefetches the first page for the parsed filters with `queryClient.infiniteQuery(…)`
  and its own `.catch`, as the session prefetch uses `queryClient.query`; the card and the edit
  page prefetch the client the same way. `prefetchInfiniteQuery` is deprecated in TanStack Query
  5.104 (an error under the lint preset) and swallows errors, so nothing could log them. Each page
  wraps its content in its own `HydrationBoundary`.
- `(app)/loading.tsx` renders the home greeting skeleton for every child route. `clients/`,
  `clients/new/`, `clients/[id]/` and `clients/[id]/edit/` get their own `loading.tsx` with a list,
  form, card and form skeleton, so a navigation never shows the greeting's placeholder.
- A malformed id in `/clients/[id]` and `/clients/[id]/edit` calls `notFound()` before any request.

**Web: shared form pieces**

- `FormField`, `TextField`, `FormAlert`, `SubmitButton` move from `features/auth/ui` to
  `shared/ui`, and `applySubmitError` with `FormAlertContent` from `features/auth/model` to
  `shared/lib/submit-error.ts`: the client form needs them, and features cannot import each other.
  Auth forms import them from there and behave as before. `SubmitButton` takes its width from the
  caller.
- Two changes on the way, with tests: `applySubmitError` matches a server path to a field when it
  equals the field name or starts with it and a dot, so `tags.1` lands on Tags; `FormAlert` leaves
  focus where it is when it sits on any form control (input, textarea, the select trigger), not
  only on an input, so it never pulls focus from a field the form just focused.

**Web: dates**

- `shared/ui/local-date` renders a `<time dateTime>` whose text is formatted in the browser's time
  zone (`en-US`, `dateStyle: 'medium'`), only after hydration. The server, which runs in UTC on
  Vercel, renders it without text, so a client added late in the evening never shows two different
  dates and hydration never mismatches.

**UI kit**

- New shadcn components from the same CLI version as spec 04, `pnpm dlx shadcn@4.21.1 add`:
  `table`, `badge`, `alert-dialog`, `select`, `empty`. The owner approved this temporary run for
  this spec; the CLI is not installed and is not a dependency. Copied components follow the repo's
  lint rules.
- No other UI library: filter menus are the existing `dropdown-menu` with checkbox and radio items;
  tag suggestions are a native `<datalist>`.

**Architecture decision record**

- `0009-client-search-and-pagination.md`: keyset pagination with an opaque value cursor over offset
  pagination and over Prisma's id cursor; `ILIKE` with trigram GIN indexes over full-text search
  (no partial matches inside emails and phones, needs language config) and over plain `ILIKE` (a
  sequential scan per keystroke as data grows); a column ICU collation for `name` over the database
  default, which differs between Neon and Docker; tags as `text[]` with a GIN index over a tags
  table (no tag management in v1, one indexed condition per filter). Consequence: renaming a tag
  everywhere is an update over arrays; a tags table comes if tag management does.

### Out of scope

- Deals and tasks on the client card (specs 07, 08); activity entries for client events (specs 07
  and 10 decide); demo clients (spec 12); CSV import, custom fields (v2).
- Filtering by any member (`createdBy=<id>`) and a member picker (spec 09); a responsible manager
  separate from the creator.
- Duplicate detection, phone normalization, a trash view, bulk actions, export, a total count,
  sorting by other columns, record versions for clients.
- An unsaved-changes prompt on leaving the form.
- Rate limits on client routes; hard delete and a purge of old soft-deleted rows.
- Partial indexes on `deleted_at IS NULL`: Prisma supports them only as a preview feature, and
  deleted rows are few.

## 3. Data model

One migration, `clients`, generated with
`pnpm --filter @clientry/api exec prisma migrate dev --create-only --name clients` (not through
`db:migrate`, which would pass the flag to `prisma generate` and apply the unedited SQL), edited,
then applied with `pnpm db:migrate`. The edits: `CREATE EXTENSION IF NOT EXISTS pg_trgm` before
the indexes, and `COLLATE "und-x-icu"` on `name`. The extension is not managed in `schema.prisma` (Prisma deprecated
`postgresqlExtensions`; `pg_trgm` is trusted, so Neon's owner role may create it). Prisma does
not model column collations, and `migrate diff` ignores features Prisma does not support, so the
drift check in global setup still passes. If it reports the collation anyway, implementation stops
and the owner decides.

| Table     | Columns                                                                                                                                                                                                                                                    | Constraints and indexes                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients` | `id`, `workspace_id`, `created_by_id`, `name` (`und-x-icu`), `company?`, `email?`, `phone?`, `source?` (`client_source`: `website`, `telegram`, `referral`, `other`), `notes?`, `tags` (`text[]`, default `{}`), `created_at`, `updated_at`, `deleted_at?` | index `(workspace_id, created_at, id)`; index `(workspace_id, name, id)`; index `created_by_id`; GIN `tags`; GIN `gin_trgm_ops` on `name`, `company`, `email`, `phone`; cascade from workspaces; restrict from users |

- The two composite indexes serve every sort in both directions and the workspace filter; the
  workspace foreign key needs no index of its own.
- `created_by_id` restricts deletion of a user who created clients. Users are never deleted in v1;
  spec 09 removes memberships, not users, so a former member's name stays on their clients.
- GIN indexes in `schema.prisma`: `@@index([tags], type: Gin)` and
  `@@index([name(ops: raw("gin_trgm_ops"))], type: Gin)` per text column.
- No check constraints on tag counts or lengths: the shared schema is the only writer's gate.
- `updated_at` is Prisma's `@updatedAt`; deleting and restoring change it too.

## 4. API

All routes under `/api/clients`, access cookie required.

| Method | Path           | Request                     | Success                        | Errors                                                       |
| ------ | -------------- | --------------------------- | ------------------------------ | ------------------------------------------------------------ |
| GET    | `/`            | `clientListQuerySchema`     | 200 `clientListResponseSchema` | 400 (query, cursor)                                          |
| GET    | `/tags`        | —                           | 200 `clientTagsResponseSchema` | —                                                            |
| POST   | `/`            | `createClientRequestSchema` | 201 `clientResponseSchema`     | 400, 403 `UNTRUSTED_ORIGIN`                                  |
| GET    | `/:id`         | —                           | 200 `clientResponseSchema`     | 400 (`id`), 404 `CLIENT_NOT_FOUND`                           |
| PATCH  | `/:id`         | `updateClientRequestSchema` | 200 `clientResponseSchema`     | 400, 403 `UNTRUSTED_ORIGIN`, 404                             |
| DELETE | `/:id`         | —                           | 204                            | 400, 403 `UNTRUSTED_ORIGIN` / `CLIENT_DELETE_FORBIDDEN`, 404 |
| POST   | `/:id/restore` | —                           | 200 `clientResponseSchema`     | 400, 403 `UNTRUSTED_ORIGIN` / `CLIENT_DELETE_FORBIDDEN`, 404 |

Every route can also answer 401 `AUTHENTICATION_REQUIRED`. `/tags` is declared before `/:id`.

`clientResponseSchema`:

```json
{
  "id": "0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b",
  "name": "Romashka LLC",
  "company": "Romashka",
  "email": "hello@romashka.example",
  "phone": "+375 29 123-45-67",
  "source": "telegram",
  "notes": "Wants a landing page before the spring sale.",
  "tags": ["landing", "warm"],
  "createdBy": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
  "createdAt": "2026-10-08T09:30:00.000Z",
  "updatedAt": "2026-10-08T09:30:00.000Z"
}
```

`clientListResponseSchema`:

```json
{
  "items": [{ "id": "…", "name": "Romashka LLC", "…": "every field except notes" }],
  "nextCursor": "WyJuZXdlc3QiLCIyMDI2LTEwLTA4VDA5OjMwOjAwLjAwMFoiLCIwMTk5Li4uIl0"
}
```

Web pages:

| Path                 | Access    | Title       |
| -------------------- | --------- | ----------- |
| `/clients`           | protected | Clients     |
| `/clients/new`       | protected | New client  |
| `/clients/[id]`      | protected | Client      |
| `/clients/[id]/edit` | protected | Edit client |

## 5. UI

**Shell.** The header gains a main navigation after the logo with one link, "Clients", marked
`aria-current="page"` on `/clients` and below. It stays visible on a phone.

**Clients (`/clients`).**

- Heading "Clients" and a "New client" button.
- Toolbar: search field (label "Search clients", visually hidden; placeholder "Search by name,
  company, email or phone"); "Source" menu with checkboxes; "Tags" menu with checkboxes and counts
  from `/clients/tags`, scrollable, "No tags yet" when empty, tags selected in the URL shown even
  when no client has them any more; "Only mine" toggle (`aria-pressed`); sort menu ("Newest first",
  "Oldest first", "Name A–Z", "Name Z–A"); "Clear filters" while any filter except sort is active.
  Menu triggers show how many values are selected. On a phone the search takes a full row and the
  controls wrap below it.
- From `md`: a table with Name (link to the card), Company, Contact (email and phone), Source,
  Tags (up to three, then "+N"), Added. Below `md`: a list of cards, each one link, with name,
  company, contact and tags. No click handlers on rows.
- States: skeleton rows while loading; error with "Try again"; an empty workspace ("No clients
  yet", "Add the people and companies you work with.", "New client"); no results ("No clients match
  your filters", "Clear filters"); new filters loading over old rows (dimmed, `aria-busy`); "Load
  more" while a next page exists, with a spinner while it loads and "Could not load more" with
  "Try again" if it fails. A polite live region announces "N clients shown" after each load.

**Client card (`/clients/[id]`).**

- Link "Clients" back to `/clients`; heading with the name, company below; "Edit" button; "Delete"
  button only when `canDeleteRecord` allows it, hidden while the session loads.
- Details: email (`mailto:`), phone (`tel:`), source, tags as badges linking to
  `/clients?tags=<tag>`, notes with line breaks kept ("No notes" when empty), "Added by <name> on
  <date>", "Updated <date>". Empty fields show "—".
- States: skeleton; error with "Try again"; not found ("Client not found", "It may have been
  deleted.", link to the list) for a 404.

**New client and Edit client (`/clients/new`, `/clients/[id]/edit`).**

- One form: Name, Company, Email, Phone, Source (select with "Not set"), Tags, Notes. Buttons
  "Create client" or "Save changes", and "Cancel" back to the list or the card.
- Same form rules as spec 04: react-hook-form with `createClientRequestSchema`, mode `onTouched`,
  server field errors on their fields (`tags.N` on Tags), one form alert for the rest, the button
  disabled with a spinner while submitting. `autocomplete`: `organization`, `email`, `tel`,
  `off` for the rest.
- Edit loads the client into the form (`null` shown as empty), keeps "Save changes" disabled until
  a field changes, and sends only changed fields; a changed tag list is sent whole. Until the
  client loads the page shows a form skeleton; a load error shows "Try again"; a 404 shows the card's
  not found state instead of the form.
- Source is the shadcn `select`. Radix Select does not allow an item with an empty value, so "Not
  set" uses a sentinel value that the field maps to and from `null`.
- Success replaces the route with the card, so Back does not return to a filled form.
- Responses: 400 → field errors; 404 on edit → alert "This client no longer exists." with a link to
  the list; anything else → "Something went wrong. Try again." with the reference.
- Tags input: chips with a remove button each ("Remove tag vip"); Enter or comma adds the typed tag
  lowercased; a duplicate is not added; Backspace in an empty input removes the last chip; text left
  in the input is added on blur; suggestions from the workspace's tags through `<datalist>`; at 10
  tags the input is disabled and the hint says so. Hint: "Press Enter or comma to add a tag."

**Delete.**

- A confirm dialog: "Delete <name>?", "The client disappears from the list and search. You can undo
  this right after.", "Cancel" and "Delete" (destructive; spinner while pending; the dialog cannot
  be dismissed while pending).
- Success: route replaced with `/clients`, toast "Client deleted" with "Undo" for 10 seconds. Undo
  restores and shows "Client restored"; a failed restore shows "Could not restore the client."
- 403 → dialog closes, toast "You can delete only clients you created."; 404 → route replaced with
  `/clients`, toast "This client was already deleted."; anything else → alert inside the dialog,
  which stays open for another try.

**Focus.**

- After a route change the app makes itself (create, save, delete, a 404 on delete), focus moves to
  the new page's `h1`, which has `tabIndex={-1}`. Cancel and links follow the router's default.
- "Load more": focus stays on the button while rows are appended; when the last page arrives and
  the button disappears, focus moves to the first newly loaded row's link.
- The delete dialog returns focus to the Delete button when it closes, also after a 403.
- The Undo toast pauses its 10 seconds while hovered, and sonner's Alt+T moves focus to the toasts
  and expands them, which also pauses it. The toaster is a live region, so "Client deleted" is
  announced.

Every screen is checked at 390×844 and 1280×800, in light and dark themes, at 360 px for horizontal
scroll, and by keyboard only.

## 6. Tests

- **Unit, packages/shared**
  - Create schema: name trimmed, blank → "Enter a name", 201 characters → "Use at most 200
    characters"; email `''` and `null` accepted, `" Ann@X.COM "` → `ann@x.com`, `ann@` → "Enter a
    valid email"; phone `+375 (29) 123-45-67` accepted, `12-34`, `abc`, 33 characters and `++375…`
    rejected; unknown source rejected, `null` accepted; tags `" VIP "` → `vip`, `["VIP", "vip"]` →
    "Tags must be unique", 11 tags, a 33-character tag and `a,b` rejected; NUL in notes and 5001
    characters rejected.
  - Update schema: `{}` accepted; `name: ''` and `name: null` rejected; `company: null` accepted.
  - List query: defaults `sort: newest`, `limit: 25`; `limit` `"10"` → 10, `0`, `101`, `abc`
    rejected; `source` as a string and as an array accepted, unknown rejected, 5 values rejected;
    `createdBy` other than `me` rejected; `q` of 101 characters and with NUL rejected.
  - `canDeleteRecord`: owner on anyone's record, manager on their own → true; manager on another's
    → false.
- **Unit, apps/api**
  - Cursor: round trip for each sort; not base64url, not JSON, a wrong tuple, an unknown sort, a
    cursor of another sort → invalid.
  - Like pattern: `100%` → `100\%`, `a_b` → `a\_b`, `a\b` → `a\\b`, plain text unchanged.
  - Clients service, repository mocked:
    - create passes `workspaceId` and the caller's id from `AuthUser`;
    - get, update, delete and restore of a missing client → `ClientNotFoundError`;
    - delete: a manager on another's client → `ClientDeleteForbiddenError` and no write; a manager on
      their own and an owner on anyone's → soft delete called; soft delete finding no row →
      `ClientNotFoundError`; restore follows the same rules;
    - list resolves `createdBy: me` to the caller's id, turns a single `source` into an array, and
      rejects an invalid cursor with `RequestValidationError` on `cursor`;
    - logs carry ids and no name, email or phone.
- **Integration, apps/api** (testcontainers, supertest, two registered workspaces, `resetDatabase`
  before each test)
  - Create → 201 matching `clientResponseSchema`, `createdBy` is the caller; blank optional fields
    stored as `NULL`; email and tags normalized; `workspaceId`, `createdById` and `deletedAt` in the
    body ignored. Invalid body → 400 with errors on `name`, `email` and `tags.1`.
  - Get → 200; another workspace's id → 404 `CLIENT_NOT_FOUND`; deleted → 404; `not-a-uuid` → 400
    on `id`.
  - Update: only the sent fields change; `null` and `''` clear; `updated_at` moves; `{}` → 200 and
    `updated_at` unchanged; another workspace's id → 404 and the row unchanged; deleted → 404.
  - Delete: owner deletes a manager's client → 204, `deleted_at` set, gone from get, list, search
    and tags; a manager deletes their own → 204; a manager deletes the owner's → 403
    `CLIENT_DELETE_FORBIDDEN`, row unchanged; again → 404; another workspace → 404.
  - Restore: after delete → 200 and back in the list; an active client → 200 unchanged; a manager on
    the owner's deleted client → 403; another workspace → 404.
  - List: only the caller's workspace, no deleted clients; each sort order; names `acme`, `Beta`,
    `zeta` in that order for `name_asc` and reversed for `name_desc`; with `limit=2` over five
    clients every client appears exactly once across three pages and the last `nextCursor` is
    `null`, for every sort; equal `created_at` set in the database is ordered by id; a client deleted
    between pages and one renamed between pages do not break the walk; a 200-character Cyrillic name
    with quotes as the last row of a page still pages under `name_asc`; a cursor of another sort and
    a tampered cursor → 400 on `cursor`.
  - Search: matches inside name, company, email and phone, case-insensitively; `100%` does not match
    `1000 Corp`, `a_c` does not match `abc`; a blank `q` filters nothing. Filters: one and two
    sources, tags as all-of, `createdBy=me` as owner and as manager, all of them combined.
  - Tags: counts per tag over active clients of the caller's workspace only, ordered.
  - Query count: a list of 25 clients by three creators issues as many SQL statements as a list of
    one (Prisma query events).
  - Schema: `name` has collation `und-x-icu`; `pg_trgm` is installed.
  - Without the access cookie every route → 401; `POST` with an untrusted origin → 403.
  - OpenAPI: seven operations under `/api/clients` with the cookie scheme and a 401 response; error
    responses reference `ApiProblem`; the list has the query parameters `q`, `source`, `tag`,
    `createdBy`, `sort`, `cursor` and `limit` by name; the `:id` operations have the path parameter
    `id`.
  - Migrations: deploy and the drift check in global setup pass.
- **Unit, apps/web (node)**
  - Prefetch: `/clients?source=website&tags=vip` fills the cache under the same key the client hook
    builds for that URL; a failure → one `warn` line with the query name and reason; an `expired`
    cookie → no request; a 404 of the client prefetch → no log line. The session prefetch tests
    stay.
- **Unit and component, apps/web (jsdom, MSW)**
  - List path: filters → `/api/clients?q=a&source=telegram&source=website&tag=vip&createdBy=me&sort=name_asc&limit=25`;
    filter defaults left out, `limit` always sent; two orderings of the same filters → one key and
    one URL.
  - Filters (nuqs testing adapter, fake timers): initial URL fills the controls; typing writes `q`
    once, 300 ms after the last key, and the list sends one request; Enter and clearing write at
    once; Back to an older `q` puts it into the input; sources write `source=a,b`; "Clear filters"
    keeps the sort; every update replaces history; `?source=fax&tags=VIP,` parses to no source and
    the tag `vip`; a 101-character `q` is cut to 100.
  - Clients view: skeleton, rows, empty workspace, no results with "Clear filters", error with "Try
    again" that refetches; "Load more" requests with the cursor and appends, focus staying on it; on
    the last page focus moves to the first new row; a failed next page shows its retry; old rows stay
    with `aria-busy` while new filters load; the live region text.
  - Client form: empty submit → name error and no request; create sends trimmed values and replaces
    the route with the card; a 400 on `email` and on `tags.0` lands on those fields; a 500 → alert
    with the reference; edit keeps "Save changes" disabled until a change and sends only changed
    fields; a 404 on edit → the "no longer exists" alert; Source "Not set" submits `null`; after
    create focus is on the card's heading.
  - Submit error: `tags.1` → the Tags field; `FormAlert` does not take focus from a focused textarea
    or select trigger; the auth cases keep passing.
  - Tag input: Enter and comma add a lowercased tag; a duplicate is ignored; Backspace removes the
    last; the remove button; text added on blur; disabled at 10.
  - Delete: hidden for a manager on another's client, shown for their own and for the owner; confirm
    → `DELETE`, route replaced, no further request for the deleted client, toast with Undo; Undo
    after the card has unmounted → `POST …/restore`, "Client restored" and the lists refetched;
    403 → toast and focus back on Delete; 500 → alert in the open dialog.
  - Client card: `mailto:` and `tel:` links, notes with line breaks, "—" for empty fields, the not
    found state on 404.
  - Local date: no text in server-rendered HTML; after hydration the formatted date with
    `dateTime`.
  - Main nav: `aria-current` on `/clients` and `/clients/<id>`, not on `/`.
  - Auth forms pass unchanged after the form pieces move.
  - The default MSW handlers gain `GET /api/clients/tags` with an empty list: the list page and the
    form request it on mount, and unhandled requests fail tests.
- **e2e**: none (spec 13).
- **Tooling checks**, done once on throwaway changes that are not committed; each must fail:
  - `features/client-form` importing `@/features/client-filters` (lint);
  - `entities/client` importing `@/features/delete-client` (lint);
  - `features/auth` importing `../../client-form/...` (lint).

## 7. Acceptance criteria

- [ ] `pnpm db:migrate` applies `clients` locally; `\d clients` in `psql` shows the indexes and the
      `und-x-icu` collation on `name`.
- [ ] With 10 000 clients generated in one workspace through `psql` (`generate_series`) and
      `ANALYZE clients` run, `EXPLAIN ANALYZE` of the search statement taken from the Prisma debug
      log, for a selective term of three or more characters (part of one unique email), uses the
      trigram indexes, and the first page answers within 100 ms locally. The SQL used and the plan
      go into the PR description.
- [ ] In the browser: create a client with every field, find it by part of its email and by part of
      its phone, filter by source and tag, sort by name, page with "Load more", edit it, delete it,
      undo, delete again.
- [ ] Filters live in the URL: a copied link opens the same list in a new tab; reload keeps them;
      Back from a card returns to the filtered list.
- [ ] A reload of `/clients` and of a card within 15 minutes of logging in: the server HTML
      response contains the data, and the browser does not request it again after hydration.
      Navigating to each client route shows that route's own skeleton, never the home greeting's.
- [ ] Manager rules are covered by integration tests; in the browser the owner sees Delete on every
      client.
- [ ] `browser-verify` over the screens of section 5 at both sizes and in both themes: no failed
      requests except the expected 401 before a refresh and the 404 of the not found card, no
      console errors except the browser's own line for those, no hydration warnings.
- [ ] Keyboard only: search, open every filter menu, open a card, edit, delete through the dialog,
      undo from the toast; focus always visible.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; the `image` smoke test
      applies the new migration in the container.
- [ ] Every tooling check from section 6 fails as described.
- [ ] `nuqs` is the latest stable version, exact-pinned; the shadcn components come from the CLI run
      of section 2; clean install has no engine, peer dependency or ignored build script warnings.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] One migration, `clients`, in the PR with the code that uses it.
- [ ] After the merge, the `main` run deploys by itself; the Render log shows the migration applied
      on Neon; on the live URL a client is created, found, edited, deleted and restored;
      `browser-verify` against the live URL over the screens of section 5 passes.
- [ ] ADR 0009 is written.
- [ ] This spec is part of the PR.
