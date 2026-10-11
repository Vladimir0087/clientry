# 0010 — Deal board

Status: accepted
Date: 2026-10-09

## Context

Deals move through a workspace's stages on a kanban board by drag and drop, by keyboard and from a
menu. Cards keep a manual order inside a column, several people move cards at the same time, and
one person may edit a deal while another drops it into Lost. Amounts are money in several
currencies. Every change goes into the deal's history, and renaming a stage or a client later must
not rewrite what the history says happened.

## Decision

- **Fractional position keys.** `deals.position` is a base62 string from `fractional-indexing`
  with the library's default digits; a card placed between two others gets a key between theirs,
  so a move writes one row. The column has the `"C"` collation, set by hand in the migration, so
  keys compare byte by byte. Equal keys, from two drops between the same neighbours at once, are
  ordered by id ascending. The upper neighbour is always read as the first key strictly greater
  than the lower one, so equal keys never reach the library. Positions never leave the API: a move
  names the card it goes after (`afterId`).
- **A record version.** `deals.version` starts at 1 and every write adds 1. Edits and moves send
  the version they read and update conditionally on it; no row matched means `409 DEAL_CHANGED`
  (or 404 when the deal is gone). Delete and restore do not check it.
- **Integer minor units with a currency per deal.** `amount` is a `bigint` of minor units, bounded
  at one billion major units, and each deal carries an ISO 4217 code. Totals are per currency.
- **Snapshot payloads in `jsonb`.** Each history entry stores the names of the stage, client and
  member as they were, validated on write by a discriminated union of events in
  `@clientry/shared/deals` and on read by the same events with id, actor and time; a stored entry
  that does not parse fails the request.
- **`@dnd-kit/core` and `@dnd-kit/sortable`** on the web, with keyboard dragging, screen reader
  announcements and a menu as the one-tap alternative.

## Alternatives

- **Integer positions.** Moving a card renumbers the rest of the column, and two moves in one
  column conflict on the rows they both renumber. Rejected.
- **Float positions.** Bisecting the gap halves it each time; after about 50 inserts in one spot
  the doubles run out of precision and a renumbering pass is needed anyway. Rejected.
- **Last write wins**, as for clients. Two people dragging one card, or an amount edit racing a
  drop into Lost, would silently drop one decision. Rejected for deals.
- **Row locks held across a form.** A lock open for as long as someone keeps the edit page open
  blocks everyone else and needs timeouts. Rejected.
- **Decimals or floats for money.** Floats lose cents; `numeric` works but brings string handling
  to every layer for no gain over integers. Rejected.
- **One currency per workspace.** Old deals would change meaning when the team starts billing in
  another currency. Rejected.
- **History rebuilt from current names.** Renaming a stage would rewrite every past move, and a
  deleted stage would leave entries with nothing to show. Rejected.
- **`@dnd-kit/react`.** The successor of `@dnd-kit/core`, still 0.x; the core and sortable
  packages are the stable line. Rejected for now.

## Consequences

- The board and every deal response carry `version` and never a position; every edit and move
  sends the version it read, and the web shows the newer state on a conflict instead of overwriting
  it. Delete and restore do not send one.
- Totals are never added across currencies; a currency with another exponent needs an exponent
  table before it can be listed.
- Prisma does not know the `"C"` collation: a later migration that alters `position` must restate
  it by hand.
- Anything else that writes positions (a seed, a script) must call `fractional-indexing` with its
  default digits: keys made with an explicit digit set are not valid default keys, and the next
  move into that column would fail.
- A new history event type needs a payload schema in the shared union and its own migration for
  the `activity_type` value.
- Keys grow by a character every few bisections in one spot and are never rebalanced; thousands
  of drops into the same gap would be needed before a key nears the index row size limit.
- Two cards with equal keys cannot be split: a card placed after the first gets a key above both
  and lands after the second, while the web shows it between them until the board refetches.
- The board reads its cards and its totals with two statements at once, on separate snapshots: a
  move between them can leave a column's count one off until the next refetch.
- The web's optimistic board can show a card out of place for a moment, all put right by the
  refetch after the last pending move: a refetch other than on window focus or reconnect (a
  hydrating navigation, another write's invalidation) can briefly put a pending card back, and
  when two queued moves fail the second revert starts from the first one's optimistic state.
- Column totals are returned as numbers: they stay exact up to 2^53 minor units, about 90 000
  deals at the maximum amount in one column and currency.
