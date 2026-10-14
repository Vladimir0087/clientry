# 0014 — Dashboard

Status: accepted
Date: 2026-10-14

## Context

The first screen after login answers how sales are going: open deals by stage, money in the
pipeline, deals won and the win rate over six months, who works on what, and what the team did
recently. A workspace holds a few thousand rows. Amounts come in several currencies that are
never added up (ADR 0010). The API has no time zone (ADR 0012), yet a month starts at a different
instant for every reader. Activities so far covered deals only.

## Decision

- **Aggregates computed on read in SQL.** The summary is four statements in one `RepeatableRead`
  transaction (`inSnapshot`), so the tiles, the pipeline and the team table agree while deals move.
  The visibility rules of deals and tasks live once in `infra/prisma/visibility.ts`, so every
  count equals what the lists show.
- **Period bounds from the browser.** The browser sends the start of each month in its own zone
  as instants; the API groups closed deals with `width_bucket` over them. Bounds are bound as ISO
  strings and cast in SQL, so no `Date` passes through the driver adapter.
- **One currency at a time.** The won chart shows one currency, chosen in the URL; the tiles show
  counts first and totals per currency below.
- **One activity writer with a nullable foreign key per subject.** `activities` gains
  `client_id` and `task_id` next to `deal_id`; exactly one is set, from the type, by `ActivityLog`,
  the only application code that writes the table, always in the caller's transaction.
- **A feed that keeps entries of deleted records.** Each entry carries the subject's current label
  and `isAvailable`; deleted and hidden subjects stay in the feed without a link.
- **One mutation hook for freshness.** Every successful mutation invalidates the dashboard and the
  feed: an open dashboard refetches at once, a closed one on the next visit to `/`.
- **Recharts with a hidden table.** Charts draw in the browser only, behind `next/dynamic`, with
  the SVG hidden from screen readers and recharts' keyboard layer off; a visually hidden table holds
  every number. An ESLint pattern keeps recharts inside `features/dashboard-charts`.

## Alternatives

- **Stored counters or materialized views.** Counters drift with soft deletes, restores and
  handovers; a view needs refreshing. Not worth it at a few thousand rows. Rejected.
- **A time zone on the server.** Needs a zone per user, which arrives only with the Telegram bot.
  Rejected for v1.
- **Converting currencies.** There are no rates, and the board never adds currencies. Rejected.
- **A polymorphic `subject_kind` and `subject_id` without foreign keys.** Loses referential
  integrity and the joins that read the label. **A table per subject.** Splits one feed into
  several queries. Both rejected.
- **Hiding entries of deleted records.** The feed records what happened, deletions included.
  Rejected.
- **Invalidations in every feature.** A feature added later could forget them. Rejected.
- **A focusable chart.** Recharts' keyboard layer reads one bar at a time; a table reads better.
  Rejected.

## Consequences

- The won chart and its two tiles load after hydration, with skeletons in the server HTML.
- A new subject means a migration and a type in `ActivityLog`.
- The dashboard can disagree with the board by the writes of the last minute (the stale time).
- Clients and tasks created before the migration have no entries; the deal history is unchanged
  and shows deal events only.
