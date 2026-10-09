# 0009 — Client search and pagination

Status: accepted
Date: 2026-10-09

## Context

The client list is searched on every pause in typing, filtered by source, tags and creator,
sorted by date or name, and paged with "Load more". Search must find the middle of a name, an
email or a phone. Pages must not skip or repeat rows when clients are added or deleted between
them. Name order must be the same on Neon, which creates databases with `C.UTF-8`, where `Zeta`
sorts before `acme`, and on the local Docker image, which uses `en_US.utf8`. Tags are free text
with no management screen in v1.

## Decision

- **Keyset pagination with an opaque value cursor.** The order is always completed with `id`, and
  the cursor is base64url JSON `[sort, value, id]` of the last row, where `value` is `created_at`
  or the name. The next page starts strictly after that tuple; Prisma has no row comparison, so
  the condition repeats `value` as a plain bound that lets the index seek to the cursor. A cursor
  that does not decode or was made for another sort answers 400. Cursors are not signed: a forged
  one only moves the position inside the caller's own workspace. The API reads `limit + 1` rows to
  know whether a next page exists and returns no total count.
- **`ILIKE '%q%'` backed by trigram GIN indexes** (`pg_trgm`) on name, company, email and phone.
  `%`, `_` and `\` in the term are escaped, because Prisma's `contains` passes them through as
  wildcards. Terms of three or more characters are index-served; shorter ones scan the workspace.
- **A column collation for `name`:** `und-x-icu`, set by hand in the migration, since Prisma does
  not model collations. Raw SQL over values that lose it, such as `unnest(tags)`, names it
  explicitly.
- **Tags as a `text[]` column with a GIN index**, lowercased on write. "All of these tags" is one
  `@>` condition.

## Alternatives

- **Offset pagination.** Simple, but a row added or deleted between pages shifts every later
  page, and deep offsets scan all skipped rows. Rejected.
- **Prisma's `cursor` option.** It reads the last row back by id, so renaming that row between
  pages moves the next page, and a deleted last row breaks it. Rejected.
- **Full-text search (`tsvector`).** Matches words, not parts of an email or a phone, and needs a
  language configuration for names in several languages. Rejected.
- **Plain `ILIKE` without indexes.** A sequential scan per keystroke as data grows. Rejected.
- **The database default collation.** Differs between Neon and Docker, so tests and the demo
  would sort differently. Rejected.
- **A tags table with a join table.** Needed for renaming or merging tags, which v1 does not
  have; it costs a join per filter. Rejected for now.

## Consequences

- A new sortable column needs its own composite index with `id`, a cursor value of its own and
  the same plain bound beside the tuple condition.
- Renaming a tag everywhere is an update over arrays; a tags table comes when tag management
  does.
- Prisma does not know the collation: a later migration that alters `name` must restate it by
  hand.
