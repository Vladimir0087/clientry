# 07 — Deals

Status: approved

## 1. Goal

A team runs its sales on a board: deals for clients move through the workspace's stages by drag and
drop, by keyboard or from a menu, every change lands in the deal's history in the same transaction,
a record version stops two people from overwriting each other, and the owner shapes the stages.

## 2. In scope / Out of scope

### In scope

**Layout**

```
apps/api/
  prisma/schema.prisma                      # Deal, Activity, enums currency and activity_type
  prisma/migrations/<timestamp>_deals/      # COLLATE "C" on deals.position added by hand
  src/
    app.module.ts                           # DealsModule, WorkspacesModule
    common/http/api-error-response.decorator.ts  # ApiInvalidRequest, moved from clients
    infra/prisma/workspace-lock.ts          # SELECT … FOR NO KEY UPDATE on the workspace row
    modules/
      auth/default-stages.ts                # StageKind from @clientry/shared/deals
      clients/clients.controller.ts         # ApiInvalidRequest from common
      deals/
        deals.controller.ts                 # board, client deals, CRUD, move, restore, history
        stages.controller.ts
        deals.service.ts
        deal-moves.service.ts               # move and board
        stages.service.ts
        deals.repository.ts                 # contract, with a unit of work
        prisma-deals.repository.ts
        prisma-deals-transaction.repository.ts  # the unit of work's writes
        deal-reads.repository.ts            # raw SQL reads with joins: deals, board columns
        stale-deal.ts                       # 404 or 409 after a conditional write matched nothing
        deal-references.ts                  # one 400 message per reference field
        stages.repository.ts                # contract, with the workspace lock
        prisma-stages.repository.ts
        prisma-locked-stages.repository.ts  # stage writes under the workspace lock
        deal-position.ts                    # fractional keys between neighbours
        deal-changes.ts                     # field diff for an edit and its history entry
        errors.ts
        deals.module.ts
      workspaces/
        members.controller.ts
        members.service.ts
        members.repository.ts               # contract
        prisma-members.repository.ts
        workspaces.module.ts
  test/fixtures/deals.ts                    # direct inserts for board and history tests
  test/support/deal-doubles.ts              # repository doubles for the service unit tests
apps/web/src/
  app/
    globals.css                             # success and danger tokens
    (app)/
      _components/main-nav.tsx              # Deals link
      _components/home-greeting.tsx         # "Try again" focus box
      _lib/prefetch.ts                      # board, deal, history, stages, members, client deals
      clients/[id]/_components/client-view.tsx   # Deals section
      clients/[id]/page.tsx, [id]/edit/page.tsx  # the id parsed lowercase, as the cache keys
      clients/_components/clients-view.tsx  # "Try again" focuses the heading
      deals/
        page.tsx, loading.tsx               # board
        _components/board-view.tsx
        new/page.tsx, new/loading.tsx       # passes the heading id to the form
        [id]/page.tsx, [id]/loading.tsx     # deal page
        [id]/_components/deal-view.tsx
        [id]/edit/page.tsx, [id]/edit/loading.tsx
        stages/page.tsx, stages/loading.tsx
        stages/_components/stages-view.tsx
  features/
    move-deal/                              # board with dnd-kit, move menu
    change-deal-stage/                      # the deal page's stage select, without dnd-kit
    deal-filters/                           # "Only mine": URL state, toolbar toggle
    deal-form/                              # create and edit, client picker, amount input
    delete-deal/                            # confirm dialog, undo toast
    manage-stages/                          # add, rename, reorder, delete with a target;
                                            # exports StageListSkeleton for stages/loading
    client-form/                            # deal queries invalidated after an edit; the
                                            # source select over the shared OptionSelect
    delete-client/                          # dialog text, over the shared confirm dialog; deal
                                            # queries invalidated
  entities/
    deal/                                   # deals, stages and history: keys, API calls,
                                            # queries, the optimistic move, money, cards,
                                            # details, lists
    member/                                 # keys, list call, useMembers
    client/                                 # client search for the picker, clientKeys.search
  shared/
    api/api-status.ts                       # isNotFound, isForbidden, hasErrorCode; replaces
                                            # entities/client/model/is-not-found.ts
    lib/use-debounced-value.ts              # the client search delay
    lib/is-focus-stranded.ts                # focus on the body or a disabled button
    lib/submit-error.ts                     # an alert can carry an action button; the
                                            # generic alert is shared with the delete dialogs
  shared/ui/
    popover.tsx, command.tsx, dialog.tsx    # shadcn; dialog comes with command
    confirm-delete-dialog.tsx               # the delete confirmation of clients and deals
    badge.tsx                               # success and danger variants ("Won", "Lost")
    local-date.tsx                          # optional time
    form-alert.tsx                          # renders the alert's action
    page-heading.tsx                        # optional id
    retry-message.tsx                       # a load error with "Try again" that moves focus
                                            # to a given target, for every list and page
    retry-focus-box.tsx                     # the "Try again" target where no heading stays
    spinner.tsx                             # isDecorative: no live region of its own
    option-select.tsx                       # a labelled select, also for the client source
    back-link.tsx                           # "< Deals", "< Clients"
    submit-button.tsx                       # optional onKeyDown
apps/web/test/
  deals.ts                                  # stages, members and deals, makeBoard
  msw/handlers.ts                           # GET /api/stages and /api/members by default
  msw/fail-once.ts                          # a 400, then a held or given answer, for "Try again"
  held.ts                                   # a response the test releases itself
  msw/record.ts                             # PUT among the recorded methods
  setup-dom.ts                              # focus and the heading focus request reset per test
packages/shared/src/
  common/id.ts                              # request ids, UUIDs lowercased on parse
  clients/client-request.ts                 # clientIdParamsSchema on the shared id
  deals/                                    # new entry point @clientry/shared/deals
  workspaces/                               # new entry point @clientry/shared/workspaces
docs/adr/0010-deal-board.md
docs/specs/03-auth.md                       # out of scope line points at this spec
```

**Tenancy**

- Every repository method takes `workspaceId` first, from `AuthUser`, never from the body, the
  query or the path. Unknown body keys (`workspaceId`, `createdById`, `position`, `closedAt`,
  `deletedAt`) are stripped by the schemas.
- A deal is visible when it is not deleted and its client is not deleted. A deal of another
  workspace, a deleted deal and a deal of a deleted client answer 404 `DEAL_NOT_FOUND` on every
  route. A stage of another workspace answers 404 `STAGE_NOT_FOUND` on stage routes.
- References in a deal body are checked inside the write's transaction: `clientId` is an active
  client, `stageId` a stage and `assigneeId` a member of the caller's workspace. Anything else →
  400 `VALIDATION_FAILED` on that field ("Choose a client", "Choose a stage", "Choose a member"),
  with the same message whether the id is unknown, deleted or in another workspace. The client and
  the membership are read `FOR SHARE`: a delete of that client, or a removal of that member (spec
  09), running at the same time either waits for the deal to commit or is seen, giving that 400
  instead of a deal hidden or assigned to a non-member right after its write.
- The deals repository reads `clients`, `stages` and `memberships` for these checks itself, so the
  check and the write share one transaction. It writes only `deals` and `activities`; the one other
  writer of those tables is a stage deletion, inside the stages repository's unit of work.
- Move targets (`stageId`, `afterId`) that are not on the caller's board answer 409
  `BOARD_CHANGED`, one body for every cause.

**Roles**

| Action                               | owner | manager        |
| ------------------------------------ | ----- | -------------- |
| Deals: create, read, edit, move      | yes   | yes            |
| Delete a deal, restore after delete  | yes   | own deals only |
| Stages and members: read             | yes   | yes            |
| Stages: add, rename, reorder, delete | yes   | no             |

- "Own" means `createdById` equals the caller, through `canDeleteRecord` of spec 06. A manager
  deleting someone else's deal gets 403 `DEAL_DELETE_FORBIDDEN`; the check runs in the service
  after the deal is found.
- Stage writes carry `@Roles('owner')`, so a manager gets 403 `INSUFFICIENT_ROLE` from the guard
  before the handler runs. Spec 09 replaces it with the `stages.manage` permission.

**Stages**

- A workspace has open stages, exactly one won stage and exactly one lost stage. Registration
  creates them (spec 03). Here the owner adds, renames, reorders and deletes open stages and renames
  the won and lost ones. A kind never changes, so the won and lost stages always exist.
- Positions are contiguous from 0: open stages in the owner's order, then won, then lost. The board
  shows columns in this order. Every stage write rewrites the positions to keep the rule.
- Names: trimmed, 1–50 characters, no NUL, unique within the workspace ignoring case. Renaming a
  stage to its own name in another case is allowed. Messages: "Enter a stage name", "Use at most 50
  characters".
- At most 10 open stages: the 11th → 409 `STAGE_LIMIT_REACHED`. At least one: deleting the last
  open stage → 409 `LAST_OPEN_STAGE`, checked before the target: with one open stage no target is
  valid, and the answer is this 409, not the 400 on `moveDealsTo`. Deleting the won or lost stage →
  409 `STAGE_NOT_DELETABLE`.
- Add (`POST /api/stages`): the new stage becomes the last open stage, before won.
- Reorder (`PUT /api/stages/order`): every open stage id in the new order. A list that is not
  exactly the current open stages (one was added or deleted meanwhile, a won or lost id) → 409
  `STAGES_CHANGED`, and the web refetches. Duplicates are rejected by the schema.
- Delete (`DELETE /api/stages/:id?moveDealsTo=<id>`): the target must be another open stage of the
  workspace, otherwise 400 on `moveDealsTo` "Choose another open stage". Every deal of the stage,
  deleted deals and deals of deleted clients included, moves to the end of the target, keeping
  their order, gets version + 1 and a `deal_moved` history entry with reason `stage_deleted`;
  then the stage row is deleted. The target is required even when the board shows the stage empty:
  deleted deals still sit in it, and a restored deal needs a column.
- Every stage write runs in one transaction that first locks the workspace row
  (`SELECT … FOR NO KEY UPDATE`, `infra/prisma/workspace-lock.ts`). Two owners editing stages at
  once are serialized, so the name, limit and order rules hold. `NO KEY UPDATE` rather than
  `UPDATE`: foreign key checks of inserts into the workspace (clients, deals, history entries) take
  `KEY SHARE` on that row, so a full lock would block them and deadlock with a deal write that
  already holds its row. Spec 09 takes the same lock for members and invites.
- Delete also locks the stage row before moving its deals. A deal written into that stage meanwhile
  waits on the foreign key and then fails it; the deals repository maps the failure to 400 on
  `stageId` for a create and to 409 `BOARD_CHANGED` for a move. Without the lock such a deal could
  commit between the move and the delete and fail the delete instead.
- Delete reads the stage's deals with `FOR NO KEY UPDATE`. A deal moved out of the stage meanwhile
  either commits first and is not moved, or waits and then answers 409 `DEAL_CHANGED` on its
  version; without the lock the delete would move it back and overwrite that move. `NO KEY`, so
  history entries (and spec 08's tasks) can still be inserted for those deals meanwhile.
- `GET /api/stages`: every member; the stages in board order, each with `dealCount` of visible
  deals.
- `StageKind` in `modules/auth/default-stages.ts` comes from `@clientry/shared/deals` (deferred
  from the spec 03 review). Registration is otherwise unchanged.

**Deal fields**

| Field        | Required  | Rules                                                       |
| ------------ | --------- | ----------------------------------------------------------- |
| `title`      | yes       | trimmed, 1–200 characters, no NUL                           |
| `clientId`   | yes       | an active client of the workspace                           |
| `stageId`    | on create | a stage of the workspace; changed afterwards only by a move |
| `amount`     | yes       | an integer in minor units, from 0 to 100 000 000 000        |
| `currency`   | yes       | `USD`, `EUR`, `PLN`, `BYN`, `RUB`                           |
| `assigneeId` | yes       | a member of the workspace; the form defaults to the caller  |

- Money is an integer in minor units with an ISO 4217 code on each deal. Floats lose cents; a
  currency per deal keeps old deals right when the team starts billing in another one. Every listed
  currency has two minor digits, so `150000` with `USD` is $1,500.00; adding a currency with another
  exponent (JPY, KWD) needs an exponent table first.
- The upper bound is one billion in major units. The column is `bigint`, since `int4` ends at
  21 474 836.47; the repository converts to a number, which stays exact far below 2^53.
- Amounts in different currencies are never added up: board columns, and the dashboard of spec 10,
  total per currency.
- Messages: "Enter a title", "Use at most 200 characters", "Enter an amount", "Amount cannot be
  negative", "Use an amount up to 1,000,000,000", "Choose a currency".

**Create, edit, delete, restore**

- Create returns the full deal with 201. It goes to the top of its stage; in the won or lost stage
  `closedAt` is set to now. History: `deal_created`.
- Edit is `PATCH` with `version` and any of `title`, `clientId`, `amount`, `currency`,
  `assigneeId`; the stage changes only through a move. Inside the transaction the service compares
  the sent values with the stored ones and drops equal fields. Nothing left → 200 with the deal
  unchanged: no write, no version check, no history entry. Otherwise one conditional update on `id`,
  `workspace_id`, `deleted_at IS NULL` and `version` sets the fields and version + 1, and one
  `deal_updated` entry lists the changes. No row matched → 409 `DEAL_CHANGED`, or 404 when the deal
  is gone.
- Delete sets `deleted_at` after `canDeleteRecord`, with a conditional update on
  `deleted_at IS NULL`; no row → 404. History: `deal_deleted`. Delete does not check the version.
- Restore applies the same rule and clears `deleted_at`. An active deal answers 200 unchanged, so a
  double click on Undo is harmless. History: `deal_restored`, only when it was deleted. The deal
  returns to its stage and its place in the column. Restoring a deal of a deleted client → 404.
- Deleting a client (spec 06 left this open): its deals are not written to; they are hidden with
  the client on every route, in counts and totals, and come back unchanged when the client is
  restored. Undo of a client stays one update, and nothing is lost if the client was deleted by
  mistake. The client delete dialog says so.

**Record version**

- `version` starts at 1, and every write to a deal row adds 1: edit, move, delete, restore, a move
  caused by a stage deletion.
- Edits and moves send the version they saw; a mismatch → 409 `DEAL_CHANGED`, except for an edit
  that changes nothing, which answers 200 unchecked. Delete and restore do not check it: deleting is
  not decided on the deal's contents.
- Unlike clients (last write wins per field), deals take the second actor's decision as stale: two
  people drag the same card, or one edits the amount while another drops the deal into Lost. The
  web then shows the newer state instead of silently overwriting it.

**Board and positions**

- `GET /api/deals/board` returns every stage as a column, in order, with:
  - `deals`: in an open stage the first 100 visible deals by position; in the won and lost stages
    the 100 most recently closed (`closed_at` descending, then id descending);
  - `count`, and `totals` per currency (amount and count), over every visible deal of the column,
    not only the first 100.
- `?assignee=me` keeps only the deals assigned to the caller ("Only mine"); cards, counts and totals
  then cover only those. `me` is the one value for now, with room for a member id (spec 09), as
  `createdBy` on clients. "Mine" means assigned here, not created: the board answers who is working
  on what, while the delete rule still looks at the creator.
- Two SQL statements whatever the number of stages and deals (checked in tests): one `$queryRaw`
  joins the stages `LEFT JOIN LATERAL` to their first 100 visible deals with client and assignee
  names, so empty stages are columns too; one `groupBy` on stage and currency gives counts and
  totals. Bound parameters only; `bigint` values are converted before they reach JSON.
- A position is a fractional key from `fractional-indexing`: a base62 string made with the
  library's default digits, so a seed or a script calling the library can extend any column. A
  card goes between two others by writing one row. No column is renumbered, and two moves in one
  column do not touch each other's rows. The column has collation `"C"`: keys are case-sensitive,
  and ICU or `en_US` ordering would interleave upper and lower case. Equal keys, from two drops
  between the same neighbours at once, are ordered by id ascending.
- Positions never leave the API. A move says where the card goes by its neighbour:
  `POST /api/deals/:id/move` with `{ version, stageId, afterId }`, where `afterId` is the visible
  deal the card goes right after, or `null` for the top. In the won and lost stages `afterId` is
  ignored and the card comes first by close date.
- Inside one transaction: the target stage and `afterId` (a visible deal of the target stage, not
  the deal itself) are checked, otherwise 409 `BOARD_CHANGED`; the new key goes between `afterId`'s
  position and the next position strictly greater in that stage. Neighbours are read among all
  deals of the stage, deleted and hidden ones included, so a deal that comes back returns to its
  place. Then the conditional update on `version` sets stage, position, `closed_at` and version + 1,
  and a `deal_moved` entry is written when the stage changed. A reorder within a column writes no
  entry.
- `closed_at` is set to now when a deal enters the won or lost stage, including from the other of
  the two, and cleared when it enters an open stage.

**History**

- `activities` holds one row per deal event, written in the event's transaction. It feeds the
  deal's history here and the dashboard feed in spec 10.
- Payloads are snapshots: stage, client and member names as they were at that moment, so renaming
  a stage or a client does not rewrite history.

| Type            | Payload                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| `deal_created`  | `stage` (`{ id, name, kind }`), `amount`, `currency`                                          |
| `deal_moved`    | `from`, `to` (`{ id, name, kind }`); `reason: "stage_deleted"` when a stage deletion moved it |
| `deal_updated`  | `changes`: one item per changed field, `{ field, from, to }`                                  |
| `deal_deleted`  | none                                                                                          |
| `deal_restored` | none                                                                                          |

- Change items: `title` with strings; `amount` with `{ amount, currency }`, so a currency change is
  one item with the amount; `client` and `assignee` with `{ id, name }`.
- The payload is `jsonb`, written through `dealEventSchema` and read through `dealActivitySchema`
  (the same events with id, actor and time), discriminated unions on `type` in
  `@clientry/shared/deals`. A stored row that does not parse fails the request with 500; it is
  never dropped silently.
- `GET /api/deals/:id/history`: newest first, at most 100 entries and `hasMore`. A deal gathers a
  few dozen entries over its life; the workspace feed of spec 10 brings pagination if it needs it.
- Client events (created, edited, deleted) are not recorded; spec 10 decides.

**Client's deals**

- `GET /api/deals?clientId=<uuid>`: the client's visible deals, newest first, at most 50, and
  `hasMore`. A client of another workspace or a deleted one gives an empty list, as a filter
  does. `clientId` is required: v1 has no general deal list.

**Members**

- `GET /api/members`, agreed with the spec 09 draft:
  `{ items: [{ id, name, email, role, joinedAt }] }`, the user id as `id`, in join order
  (membership `created_at`, then id), readable by every member. The assignee select uses it.
- It lives in a new `workspaces` module; spec 09 adds role changes, removal, invites and rename
  there.

**Logging**

- `info` with workspace id and user id on deal create, move (from and to stage ids), delete and
  restore, and on stage create, rename, reorder and delete (target id, number of moved deals).
- No titles, amounts, client, stage or member names in log lines.

**Errors (`modules/deals/errors.ts`)**

| Class                      | Kind      | Code                    | Detail                                        |
| -------------------------- | --------- | ----------------------- | --------------------------------------------- |
| `DealNotFoundError`        | NotFound  | `DEAL_NOT_FOUND`        | Deal not found                                |
| `DealDeleteForbiddenError` | Forbidden | `DEAL_DELETE_FORBIDDEN` | Managers can delete only deals they created   |
| `DealChangedError`         | Conflict  | `DEAL_CHANGED`          | The deal was changed by someone else          |
| `BoardChangedError`        | Conflict  | `BOARD_CHANGED`         | The board changed; reload it and try again    |
| `StageNotFoundError`       | NotFound  | `STAGE_NOT_FOUND`       | Stage not found                               |
| `StageNameTakenError`      | Conflict  | `STAGE_NAME_TAKEN`      | A stage with this name already exists         |
| `StageLimitReachedError`   | Conflict  | `STAGE_LIMIT_REACHED`   | A pipeline can have at most 10 open stages    |
| `LastOpenStageError`       | Conflict  | `LAST_OPEN_STAGE`       | A pipeline needs at least one open stage      |
| `StageNotDeletableError`   | Conflict  | `STAGE_NOT_DELETABLE`   | Won and lost stages cannot be deleted         |
| `StagesChangedError`       | Conflict  | `STAGES_CHANGED`        | The stages changed; reload them and try again |

A malformed `:id` answers 400 `VALIDATION_FAILED` on `id` before any query, with the params
validated as one object, as in spec 06.

**Units of work**

- `DealsRepository.inTransaction(work)` and `StagesRepository.inWorkspaceLock(workspaceId, work)`
  open the transaction (and take the lock), then pass `work` a repository bound to it. The rules
  stay in the services and run inside, so services are tested without a database. Spec 09 uses the
  same shape.

**Swagger**

- Tags `deals`, `stages`, `members`. Every operation carries the cookie scheme and documents its
  error responses with examples built from the domain errors; 401 is declared once per controller.
  Stage writes document 403 `INSUFFICIENT_ROLE`. Query schemas have no `.meta({ id })`, so
  `assignee`, `clientId` and `moveDealsTo` are listed as parameters (spec 06).

**Shared contracts**

- `@clientry/shared/deals`, new entry point:
  - `stageSchema` (`Stage`: `{ id, name, kind }`), `stageListResponseSchema`
    (`{ items }` with `dealCount`), `createStageRequestSchema`, `renameStageRequestSchema`,
    `reorderStagesRequestSchema` (`{ ids }`, 1–10 unique UUIDs, "Stages must be unique"),
    `deleteStageQuerySchema` (`{ moveDealsTo }`), `stageIdParamsSchema`, `STAGE_LIMITS`;
  - `CURRENCIES`, `DEAL_LIMITS` (title length, the amount bound, board column size, history size,
    client deals size), `amountSchema`, which the web amount input parses into;
  - `createDealRequestSchema`, `updateDealRequestSchema` (`version` required, every other field
    optional), `moveDealRequestSchema` (`afterId` required, nullable), `dealIdParamsSchema`,
    `dealListQuerySchema`, `boardQuerySchema` (`{ assignee }`, only `me`);
  - `dealSchema` (`Deal`), `boardResponseSchema` (`Board`, with `DealCard` and `BoardColumn`),
    `dealListResponseSchema`, `dealEventSchema` (`DealEvent`, a history entry as written),
    `dealActivitySchema` (`DealActivity`), `dealHistoryResponseSchema`;
  - inferred types for each. Schemas used only inside the package (currency, stage kind, card,
    column, total, reference, change) are not exported.
- `@clientry/shared/workspaces`, new entry point: `memberSchema` (`Member`),
  `memberListResponseSchema`. Spec 09 adds the rest.
- Dates are ISO strings, as in spec 06.
- Ids in requests (path, query and body) go through `idSchema` from `@clientry/shared/common`: a
  UUID is lowercased on parse, since services compare ids as strings.

**Web: data layer (`entities/deal`, `entities/member`)**

- `dealKeys`: `all`, `boards`, `board(filters)`, `detail(id)`, `history(id)`, `clientLists`,
  `byClient(clientId)`; `stageKeys`: `all`, `list`; `memberKeys`: `all`, `list`. Below, "board"
  means every cached board (`dealKeys.boards`), whatever its filter.
- `BoardFilters` and `boardPath(filters)`: the browser and the server prefetch build the API URL
  with one function, and the filter is part of the query key.
- API calls through the browser client with the shared schemas, and `useBoard(filters)` (with
  `placeholderData: keepPreviousData`, so the old board stays while a new filter loads), `useDeal`,
  `useDealHistory`, `useClientDeals`, `useStages`, `useMembers`.
- `formatMoney(amount, currency)` uses `Intl.NumberFormat` in `en-US` with style `currency` and
  `trailingZeroDisplay: 'stripIfInteger'`, so `$1,500` and `$1,500.50`.
- UI: the deal card body, deal details, the history list, the client's deal list, the stage badge,
  skeletons, the not found state.
- `entities/deal` does not import `entities/client`: entities cannot import each other (lint). The
  deal page builds the link to the client card in the app layer and passes it in.
- Cache after writes:
  - create: the detail is written; board, stages and client deals are invalidated;
  - edit: the detail is written; board, history and every client's deals (`dealKeys.clientLists`,
    as a changed client moves the deal from one list to another) are invalidated;
  - a create or an edit refused with 400 on `stageId` or `assigneeId` refetches the stages or the
    members, so the refused option, deleted or removed elsewhere, leaves the select;
  - move: see below;
  - delete: the route is replaced first, then board, stages and client deals are invalidated and
    the detail is marked stale without a refetch, as with clients;
  - restore: in the mutation's own options, since Undo outlives the page: board, stages, client
    deals, detail and history;
  - stage writes: stages and every deal query (`dealKeys.all`), as a delete moves deals (new
    versions and history entries) and a rename changes the stage names deals show; a reorder only
    the board. The reorder and rename responses are written into the stages cache;
  - client edit, delete and restore (`features/client-form`, `features/delete-client`): every deal
    query (`dealKeys.all`), for client names on cards and hidden deals; a delete and a restore also
    the stages, whose deal counts leave out a deleted client's deals. A delete only marks them
    stale (`refetchType: 'none'`), as the client card is leaving and nothing else shows them.

**Web: board filter (`features/deal-filters`)**

- nuqs, as the client filters of spec 06: page param `mine` (`true`), left out when off. Updates are
  shallow and replace the history entry; a shared link, a reload and Back from a deal page restore
  the same board.
- The parser lives in a module imported from `nuqs/server` and serves both the client hook and a
  `createLoader` for the server page, so the server prefetches exactly the board the client asks
  for. Any value but `true` parses as off.
- A move keeps the card on a filtered board, since moving does not change the assignee.

**Web: moving deals (`features/move-deal`, `features/change-deal-stage`, `entities/deal`)**

- The board uses `@dnd-kit/core` and `@dnd-kit/sortable`: one sortable list per column; the won and
  lost columns accept drops but do not sort, as their strategy moves no card.
- Each card has a drag handle ("Drag <title>", grip icon, full card height,
  `touch-action: none`). Mouse and touch drag by it after 4 px, so a swipe anywhere else scrolls the
  board and the title stays a plain link. Keyboard: focus the handle, Space or Enter lifts, Up and
  Down move within the card's column (nothing happens at its end), Left and Right move to the
  neighbouring column, Space drops, Escape cancels. A drag overlay follows the pointer and the
  columns preview the drop; nothing is sent before the drop.
- Announcements in words through dnd-kit's live region: "Picked up <title> in <stage>.", "<title>
  is in <stage>, position 2 of 5.", "Dropped <title> in <stage>.", "Moving <title> was cancelled."
  Instructions: "Press Space to pick up a deal. Use the arrow keys to move it, Space to drop it and
  Escape to cancel."
- Each card has a menu, "Actions for <title>", with "Move to" and every stage, the current one
  checked. It moves the deal to the top of the chosen stage. Dragging always has this one-tap
  alternative (WCAG 2.5.7), and on a phone it is the easy path.
- The deal page's stage select uses the same mutation and also moves to the top. It is a slice of
  its own, `features/change-deal-stage`, so the deal page does not load dnd-kit; `useMoveDeal` and
  `applyMove` live in `entities/deal`, since both slices use them and features cannot import each
  other. The select lists the cached stages, plus the deal's own stage when the list lacks it, so
  it never shows blank.
- `useMoveDeal` is optimistic:
  - it keeps a snapshot, applies the move to every cached board with a pure `applyMove` (out of the
    source column, after `afterId` or at the top of the target, counts and totals moved by
    currency, `closedAt` set or cleared), then cancels board queries, so a drop never shows the
    card back in place for a frame;
  - on error only the failed card goes back to its place in the snapshot, keeping its current
    fields, while cards of other queued moves stay where they were put; a card with another move of
    its own still queued stays, as that move decides its place. One toast explains however many
    moves failed, the board refetches, and the deal's detail and history are invalidated, so the
    deal page shows the newer version or the not found state;
  - on success the server's deal replaces the card (its new version) and the detail; the history
    and the client's deals are invalidated;
  - every settled move invalidates the stages, whose deal counts it changed;
  - moves share one mutation scope, so they run one at a time, and each reads the deal's version
    from the cache when it starts, not when it was queued: dragging one card twice quickly does not
    conflict with itself;
  - the board refetches only after the last pending move settles, and the move settles only once
    that refetch is done; window focus and reconnect refetches are skipped while a move is pending.
    Other refetches are not held back: a navigation that hydrates the board, or an invalidation by
    another write (Undo, a client or stage write), can briefly show a pending card in its old
    place, and the last move's refetch puts it right.
- Known limits, each corrected by that refetch: when two queued moves fail, the second revert uses
  a snapshot that holds the first move's optimistic state, so two failed neighbours can swap for a
  moment and a card moved twice can stop in the middle column.
- A card dropped below the last shown card of another open column that is truncated, or already
  shows 100 cards, goes above that card, so it is the last card shown and the former last card
  leaves the view; past it the server would place it beyond the first 100 and the refetch would
  hide it.
- Toasts: 409 `DEAL_CHANGED` → "This deal was changed by someone else. The board is updated." on the
  board and "This deal was changed by someone else. The page is updated." on the deal page; 409
  `BOARD_CHANGED` → "The board changed. Try again."; 404 → "This deal no longer exists."; anything
  else → "Could not move the deal. Try again."

**Web: deal form (`features/deal-form`)**

- One form for create and edit. The form schema is the create schema with `amount` as text: money is
  typed with separators and decimals, so it is the one field with a string input. On submit it
  becomes minor units; a server error on `amount` lands on the same field.
- Amount input: digits with optional `,` or space thousands separators and at most two decimals
  after a dot; `1,500.50` → `150050`. A comma with one or two digits after it is a decimal comma,
  as some phone keyboards offer no dot: `1500,50` and `1 500,5` → `150050`; three digits after a
  comma stay thousands. A no-break or narrow no-break space, as copied ru, pl or fr amounts have,
  counts as a space. Messages: "Enter an amount", "Enter an amount like 1500 or 1500.50", "Use at
  most two decimal places", "Use an amount up to 1,000,000,000". Edit shows the stored amount as
  `1500.50`, without separators.
- Client picker: a combobox from shadcn `popover` and `command`. The trigger reads "Choose a
  client" or the chosen name. Its search field queries
  `GET /api/clients?q=<term>&sort=name_asc&limit=10` through `entities/client` 300 ms after the
  last keystroke and lists name and company; "No clients found", a loading row and an error row
  with "Try again" in one polite live region that is always there, below the list. A client given
  in the URL shows its name, loaded with `useClient`.
- Currency: the shadcn `select`, options such as "USD — US Dollar" from `Intl.DisplayNames`,
  default `USD`.
- Stage (create only): every stage in board order, default the first open stage.
- Assignee: members in join order, default the caller.

**Web: server prefetch**

- `/deals`: the board for the filter in the URL. `/deals/[id]`: the deal, its history and the
  stages. `/deals/[id]/edit`: the deal and the members. `/deals/new`: stages, members, and the
  client given in the URL. `/deals/stages`: the stages. `/clients/[id]`: the client's deals next to
  the client.
- Through `(app)/_lib/prefetch.ts` of spec 06: one attempt within a second, a `warn` line
  `<Label> prefetch failed` on failure. A 404 of the deal or history prefetch is expected and not
  logged. The file splits by entity if it outgrows the size limit.
- `/deals/new` reads `stageId` and `clientId` from the URL on the server and passes them to the form
  as defaults; a malformed or unknown value is ignored.

**UI kit**

- `pnpm dlx shadcn@4.21.1 add popover command`, the same CLI version as specs 04 and 06. The owner
  approved this temporary run for this spec; the CLI is not installed and is not a dependency.
  `command` brings `dialog` and the `cmdk` dependency. Spec 09 then finds `dialog` in place.
- `badge` gains a `success` variant; `globals.css` gains `--success` and `--success-foreground` for
  both themes, with AA contrast; likewise `danger` with `--danger` and `--danger-foreground`. Won
  stages use `success`, lost stages `danger`.
- `local-date` takes an optional `hasTime` (`timeStyle: 'short'`) for history entries.

**Dependencies**

- Web: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, and `cmdk` through the CLI. API:
  `fractional-indexing`. Latest stable versions, exact-pinned.
- `@dnd-kit/react` (0.x) is the successor of `@dnd-kit/core` but has not reached 1.0; the core and
  sortable packages are the stable line and support keyboard dragging and announcements (ADR 0010).

**Architecture decision record**

- `0010-deal-board.md`: fractional position keys over integer positions (a move renumbers the
  column and conflicts with other moves) and over floats (precision runs out after about 50
  bisections in one spot); a record version over last write wins and over row locks held across a
  form; integer minor units with a currency per deal over decimals or floats and over one currency
  per workspace; snapshot payloads in `jsonb` over history rebuilt from current names;
  `@dnd-kit/core` over `@dnd-kit/react` 0.x. Consequences: the board never returns positions,
  every edit and move sends a version, and totals are per currency.

### Out of scope

- Board filters other than "Only mine" (member, client, amount) and search, a deal list or table
  view, a trash view, bulk actions.
- Deal notes, expected close date, probability, lost reason, products, attachments.
- Several pipelines per workspace, reordering or adding won and lost stages, changing a stage's
  kind, WIP limits.
- Currency conversion, a workspace default currency, currencies with other exponents.
- Live board updates (v2 WebSocket); until then the board refetches on focus and after own writes.
- Client events in the history and the workspace activity feed (spec 10).
- Tasks on deals (spec 08), member management and filters by member (spec 09), demo deals (spec 12).
- Hard delete and a purge of deleted deals; an unsaved-changes prompt.
- Indexes on `assignee_id`, `created_by_id` and `actor_id`: users are never deleted, and "Only
  mine" walks a column through the stage index and filters, which stays cheap at a few hundred
  deals per column. They come with the queries that need them (spec 10).

## 3. Data model

One migration, `deals`, created as in spec 06 with
`pnpm --filter @clientry/api exec prisma migrate dev --create-only --name deals`, edited to add
`COLLATE "C"` to `deals.position`, then applied with `pnpm db:migrate`. Prisma does not model
column collations and `migrate diff` ignores them, as the drift check showed for `clients.name`. If
it reports the collation anyway, implementation stops and the owner decides.

| Table        | Columns                                                                                                                                                                                                                                                 | Constraints and indexes                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deals`      | `id`, `workspace_id`, `client_id`, `stage_id`, `assignee_id`, `created_by_id`, `title`, `amount` (`bigint`), `currency` (`currency`), `position` (`text`, `"C"`), `version` (`int`, default 1), `closed_at?`, `created_at`, `updated_at`, `deleted_at?` | index `(stage_id, position, id)`; index `(workspace_id, stage_id, closed_at, id)`; index `(client_id, created_at)`; cascade from workspaces; no action from clients and stages; restrict from users |
| `activities` | `id`, `workspace_id`, `deal_id`, `actor_id`, `type` (`activity_type`), `payload` (`jsonb`), `created_at`                                                                                                                                                | index `(deal_id, created_at, id)`; cascade from workspaces; no action from deals; restrict from users                                                                                               |

- Enums: `currency` (`USD`, `EUR`, `PLN`, `BYN`, `RUB`) and `activity_type`
  (`deal_created`, `deal_moved`, `deal_updated`, `deal_deleted`, `deal_restored`). Specs 08 and 10
  add values with their own migrations.
- `stages` is unchanged.
- The first index serves the open columns of the board, the neighbour lookups of a move and the
  stage foreign key, which a stage delete checks by `stage_id` alone; a stage belongs to one
  workspace, so `workspace_id` in front would add nothing. The second serves the won and lost
  columns, read backwards; the third the client's deals; the last the history. The deals' workspace
  foreign key is served by the second index; the activities' one gets its own index when a
  workspace can be deleted (v2), as no query reads activities by workspace before that.
- References inside a workspace (deals to clients and stages, activities to deals) are `NO ACTION`
  (`onDelete: NoAction`), not `RESTRICT`: both refuse to delete a referenced row, but `NO ACTION`
  is checked at the end of the statement, so deleting a workspace (v2) can cascade through
  clients, stages, deals and activities in one statement. References to users stay `RESTRICT`, as
  in spec 06.
- `activities.deal_id` is required: every event in v1 belongs to a deal. Spec 10 relaxes it if it
  records client events. No `updated_at`: entries are never changed.
- `updated_at` is Prisma's `@updatedAt`; a move changes it too. No check constraints on amounts or
  lengths: the shared schemas are the only writer's gate (spec 06).

## 4. API

All routes need the access cookie.

| Method | Path                     | Request                      | Success                         | Errors                                                                                                |
| ------ | ------------------------ | ---------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/api/deals/board`       | `boardQuerySchema`           | 200 `boardResponseSchema`       | 400                                                                                                   |
| GET    | `/api/deals`             | `dealListQuerySchema`        | 200 `dealListResponseSchema`    | 400                                                                                                   |
| POST   | `/api/deals`             | `createDealRequestSchema`    | 201 `dealSchema`                | 400, 403 `UNTRUSTED_ORIGIN`                                                                           |
| GET    | `/api/deals/:id`         | —                            | 200 `dealSchema`                | 400 (`id`), 404 `DEAL_NOT_FOUND`                                                                      |
| PATCH  | `/api/deals/:id`         | `updateDealRequestSchema`    | 200 `dealSchema`                | 400, 403 `UNTRUSTED_ORIGIN`, 404, 409 `DEAL_CHANGED`                                                  |
| POST   | `/api/deals/:id/move`    | `moveDealRequestSchema`      | 200 `dealSchema`                | 400, 403 `UNTRUSTED_ORIGIN`, 404, 409 `DEAL_CHANGED` / `BOARD_CHANGED`                                |
| DELETE | `/api/deals/:id`         | —                            | 204                             | 400, 403 `UNTRUSTED_ORIGIN` / `DEAL_DELETE_FORBIDDEN`, 404                                            |
| POST   | `/api/deals/:id/restore` | —                            | 200 `dealSchema`                | 400, 403 `UNTRUSTED_ORIGIN` / `DEAL_DELETE_FORBIDDEN`, 404                                            |
| GET    | `/api/deals/:id/history` | —                            | 200 `dealHistoryResponseSchema` | 400, 404                                                                                              |
| GET    | `/api/stages`            | —                            | 200 `stageListResponseSchema`   | —                                                                                                     |
| POST   | `/api/stages`            | `createStageRequestSchema`   | 201 `stageSchema`               | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 409 `STAGE_NAME_TAKEN` / `STAGE_LIMIT_REACHED`     |
| PATCH  | `/api/stages/:id`        | `renameStageRequestSchema`   | 200 `stageSchema`               | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404, 409 `STAGE_NAME_TAKEN`                        |
| PUT    | `/api/stages/order`      | `reorderStagesRequestSchema` | 200 `stageListResponseSchema`   | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 409 `STAGES_CHANGED`                               |
| DELETE | `/api/stages/:id`        | `deleteStageQuerySchema`     | 204                             | 400, 403 `UNTRUSTED_ORIGIN` / `INSUFFICIENT_ROLE`, 404, 409 `STAGE_NOT_DELETABLE` / `LAST_OPEN_STAGE` |
| GET    | `/api/members`           | —                            | 200 `memberListResponseSchema`  | —                                                                                                     |

Every route can also answer 401 `AUTHENTICATION_REQUIRED`. `/board` is declared before `/:id`.

`dealSchema`:

```json
{
  "id": "0199b1e2-3c4d-7e5f-8a9b-0c1d2e3f4a5b",
  "title": "Landing page for Romashka",
  "amount": 150000,
  "currency": "USD",
  "stage": {
    "id": "0199a3c4-6f70-7a81-9b2c-3d4e5f6a7b8c",
    "name": "Proposal sent",
    "kind": "open"
  },
  "client": { "id": "0199a3c4-7d10-7c2e-9a4b-5c6d7e8f9a0b", "name": "Romashka LLC" },
  "assignee": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
  "createdBy": { "id": "0199a3c4-5e6f-7a8b-9c0d-1e2f3a4b5c6d", "name": "Ann" },
  "closedAt": null,
  "version": 3,
  "createdAt": "2026-10-09T09:30:00.000Z",
  "updatedAt": "2026-10-09T11:05:00.000Z"
}
```

`boardResponseSchema`, one column shown:

```json
{
  "columns": [
    {
      "stage": { "id": "…", "name": "Proposal sent", "kind": "open" },
      "deals": [
        {
          "id": "…",
          "title": "Landing page for Romashka",
          "amount": 150000,
          "currency": "USD",
          "client": { "id": "…", "name": "Romashka LLC" },
          "assignee": { "id": "…", "name": "Ann" },
          "closedAt": null,
          "version": 3
        }
      ],
      "count": 3,
      "totals": [
        { "currency": "USD", "amount": 450000, "count": 2 },
        { "currency": "EUR", "amount": 120000, "count": 1 }
      ]
    }
  ]
}
```

A `dealHistoryResponseSchema` entry:

```json
{
  "id": "0199b1f0-…",
  "type": "deal_moved",
  "actor": { "id": "…", "name": "Ann" },
  "payload": {
    "from": { "id": "…", "name": "Call", "kind": "open" },
    "to": { "id": "…", "name": "Proposal sent", "kind": "open" }
  },
  "createdAt": "2026-10-09T11:05:00.000Z"
}
```

Web pages:

| Path               | Access    | Title     |
| ------------------ | --------- | --------- |
| `/deals`           | protected | Deals     |
| `/deals/new`       | protected | New deal  |
| `/deals/[id]`      | protected | Deal      |
| `/deals/[id]/edit` | protected | Edit deal |
| `/deals/stages`    | protected | Stages    |

## 5. UI

**Shell.** The main navigation gains "Deals" after "Clients", with `aria-current="page"` on
`/deals` and below.

**Board (`/deals`).**

- Heading "Deals" and a "New deal" button; owners also get an "Edit stages" link to
  `/deals/stages`.
- Above the columns, an "Only mine" toggle (`aria-pressed`): only deals assigned to the caller.
- Columns in stage order, 18rem wide. The board scrolls sideways inside its own container, snapping
  to columns below the `md` width except while a card is dragged, as snapping would fight the drag's
  auto-scroll; the page itself never scrolls sideways. Each column is a `section` labelled
  by its stage name, with the cards in a list.
- Column header: the stage name; a "Won" or "Lost" badge on the closed stages; the count and the
  totals, "3 deals · $4,500 · €1,200"; on open stages an "Add deal" button, named "Add deal to
  <stage>", to `/deals/new?stageId=<id>`.
- Card: the handle, the title as a link to the deal page, the client's name, the amount, the
  assignee's name, the actions menu; in closed columns also "Closed <date>". Screen readers hear
  "Client <name>" and "Assigned to <name>".
- A column with more deals than it shows ends with "Showing 100 of 134 deals". An empty column
  shows "No deals" in a drop zone. A closed column shows a ring while the dragged card is over it
  or any card in it.
- States: skeleton columns while loading; "We could not load the board." with "Try again"; a
  workspace without deals shows the columns and the line "No deals yet. Add the first one with New
  deal."; with "Only mine" on and nothing assigned to the caller, the line "No deals are assigned
  to you." with "Show all deals", which turns the filter off; a filter change keeps the old columns,
  dimmed and `aria-busy`, until the new board loads, with dragging and the card menus off, since a
  move would not show on the old columns.

**Deal page (`/deals/[id]`).**

- Link "Deals" back to the board; heading with the title and the client's name below it, linked to
  the client card; "Edit" button; "Delete" button only when `canDeleteRecord` allows it, hidden
  while the session loads.
- Details: Amount; Stage, a select that moves the deal to the top of the chosen stage, disabled with
  a spinner while pending, and a polite live region, always there, that says "Moving the deal…"
  meanwhile; Assignee; "Closed on <date>" in a closed stage; "Added by <name> on <date> · Updated
  <date>".
- History, under the heading "History", newest first, each line with date and time:
  - "<actor> created the deal in <stage> · <amount>"
  - "<actor> moved the deal from <stage> to <stage>", with "when <stage> was deleted" for a stage
    deletion
  - "<actor> renamed the deal from “<old>” to “<new>”"
  - "<actor> changed the amount from <old> to <new>"
  - "<actor> changed the client from <old> to <new>"
  - "<actor> changed the assignee from <old> to <new>"
  - "<actor> deleted the deal", "<actor> restored the deal"
  - "Older changes are not shown." when there are more than 100.
- The history has its own skeleton and its own error with "Try again".
- States: skeleton; error with "Try again"; not found ("Deal not found", "It may have been
  deleted.", link to the board) for a 404.

**New deal and Edit deal (`/deals/new`, `/deals/[id]/edit`).**

- Fields: Title, Client, Amount with Currency beside it, Stage (create only), Assignee. Buttons
  "Create deal" or "Save changes", and "Cancel" back to the board or the deal page.
- The form rules of spec 06: react-hook-form, mode `onTouched`, server field errors on their fields,
  one form alert for the rest, the button disabled with a spinner while submitting.
  `autocomplete="off"` throughout.
- Edit loads the deal into the form, keeps "Save changes" disabled until a field changes, and sends
  `version` with the changed fields only. A newer deal that reaches the cache after the form
  mounted (the server prefetch hydrates a cached deal after mount) replaces the values and the
  version while no field has changed; once one has, the form keeps the typed values and its
  version, and the save meets the conflict below. Until the deal loads it shows a form skeleton; a
  load error shows "Try again"; a 404 shows the deal's not found state.
- Client picker: Enter or Space on the trigger opens it with focus in the search field; arrows move
  through the results, Enter chooses, Escape closes; focus returns to the trigger. The popover is
  named "Choose a client" and the chosen client's option adds "(current client)" for screen
  readers. Results of an older term stay in view but disabled until the new ones arrive, so Enter
  cannot choose them; once they arrive the first one is highlighted, even when they are the same
  clients. The live region (the loading line, "No clients found" and the error with "Try again")
  sits below the list, outside the listbox, where cmdk's empty state would not be announced, and
  outside `command`, whose key handler takes every Enter: "Try again" answers Enter too.
- Success replaces the route with the deal page.
- Responses: 400 → field errors (`clientId` on Client, `stageId` on Stage, `assigneeId` on
  Assignee); 409 `DEAL_CHANGED` on edit → alert "Someone else changed this deal while you were
  editing." with "Reload", which refetches the deal and resets the form to it ("Could not reload
  the deal. Try again." with "Reload" again when the refetch fails, the deal's not found state
  when it finds the deal gone); 404 on edit → alert "This deal no longer exists." with a link to
  the board; anything else → "Something went wrong. Try again." with the reference.

**Delete.**

- A confirm dialog: "Delete <title>?", "The deal disappears from the board and the client's deals.
  You can undo this right after.", "Cancel" and "Delete" (destructive; spinner while pending; not
  dismissible while pending).
- Success: route replaced with `/deals`, toast "Deal deleted" with "Undo" for 10 seconds. Undo
  restores and shows "Deal restored"; a failed restore shows "Could not restore the deal."
- 403 → dialog closes, toast "You can delete only deals you created."; 404 → route replaced with
  `/deals`, toast "This deal was already deleted."; anything else → alert inside the dialog.

**Stages (`/deals/stages`).**

- Link "Deals" back to the board; heading "Stages"; the line "Deals move through these stages from
  left to right on the board."
- The stages in board order, each with its name, a "Won" or "Lost" badge on the closed ones and the
  number of deals.
- Owners get, on open stages, "Move up" and "Move down" (named "Move <name> up") and "Delete"; on
  every stage "Rename", which turns the row into a form with the field "Stage name", "Save" and
  "Cancel"; Escape on any of them cancels, except while the name saves, when "Cancel" is off too,
  and "Save" stays disabled until the name changes. Below the list, the field "New stage" and "Add
  stage". At 10 open stages the field and button are disabled with the hint "A pipeline can have at
  most 10 open stages."; on the only open stage "Delete" is disabled with the hint "A pipeline needs
  at least one open stage."
- Delete dialog: "Delete <name>?"; when the stage has deals, "Its N deals move to" ("Its 1 deal
  moves to") with a select of the other open stages, the previous one by default (the next one for
  the first stage); without deals, "This stage has no deals." and the default target is sent. The
  count and the select follow the stage list, also when it refetches while the dialog is open.
  "Cancel" and "Delete" (destructive, spinner, not dismissible while pending).
- Managers see the list without controls and the line "Only owners can change stages."
- Responses: 409 `STAGE_NAME_TAKEN` → on the name field; `STAGE_LIMIT_REACHED`, `LAST_OPEN_STAGE`
  and `STAGE_NOT_DELETABLE` → a toast with the error's detail and the stages refetched;
  `STAGES_CHANGED` → toast "The stages were changed elsewhere. The list is updated." and a refetch;
  404 → toast "This stage no longer exists." and a refetch; 403 `INSUFFICIENT_ROLE` → toast "Only
  owners can change stages." and the session refetched; 400 on `moveDealsTo` (the target is gone)
  → its message in the dialog and the stages refetched, the default target taking its place; a
  delete dialog that a refetch left without another open stage answers "Delete" as
  `LAST_OPEN_STAGE` would, without a request; anything else → "Something went wrong. Try again."
- States: skeleton; error with "Try again".

**Client card.**

- A "Deals" section after the details: a "New deal" link to `/deals/new?clientId=<id>` and the
  client's deals, each with the title as a link, a stage badge, the amount and the assignee. Empty:
  "No deals yet". "Showing the 50 newest deals." when there are more. Its own skeleton and error
  with "Try again".
- The delete dialog's text becomes "The client and their deals disappear from lists, search and the
  board. You can undo this right after."

**Focus.**

- After a route change the app makes itself (create, save, delete, a 404 on delete), focus moves
  to the new page's `h1`, as in spec 06.
- During a keyboard drag the handle keeps focus, also when the card crosses into another column
  and mounts there anew; the lifted card's body and menu fade while the handle and its focus ring
  stay opaque. After a keyboard drop, focus stays on the moved card's handle; after a move from the
  menu, it goes to the moved card's menu button in its new column, which scrolls the board to it.
  When a move fails, focus waits for the board's refetch and then follows the card to its handle or
  menu button wherever the refetch put it, unless the user has moved on to something else, a drag
  of another card included; when the card is gone (deleted, or out of "Only mine"), the "Deals"
  heading takes it. After a failed pointer drag focus comes back only if it was in the card when
  the drag started, and without scrolling the board (heading included); keyboard drags and menu
  moves scroll to it. After "Show all deals" focus goes to the "Only mine" toggle, now off.
- Deal page: the stage select is disabled while its move is pending and takes focus back after it,
  unless the user has moved on. Edit: after "Reload" focus goes to Title, or to the not found
  heading when the deal is gone. Client picker: after "Try again" focus goes to the search field.
- Every other load error's "Try again" (`RetryMessage`) moves focus, before its button leaves, to
  the heading of what loads: the `h1` of the board, Stages, New deal, Edit deal, Clients and Edit
  client; "History" on the deal page; "Deals" on the client card. Where no heading is on screen
  while loading (the deal page, the client card, the home greeting), the box the state loads into
  takes it and hands it to the heading that loads (the title, the client's name, the greeting, or
  the not found heading); the box is focusable only until then. On the edit pages a retry that
  finds the deal or client gone sends focus to the not found heading, unless the user moved on.
  This covers the client pages of spec 06 too; the app's error pages keep Next's own retry.
- Stages: after "Move up" or "Move down" focus stays on the same stage's button, or moves to the
  other one when the stage reached the end; after a rename it returns to that stage's "Rename";
  after "Add stage" it stays in the cleared field and a polite live region says "Stage <name>
  added", emptied as the user types the next name, so every add is announced; when that stage is
  the tenth open one, the field is disabled, so focus goes to the "Stages" heading and the region
  adds "A pipeline can have at most 10 open stages."; an add refused with `STAGE_LIMIT_REACHED`
  sends focus there too when it was in the form, as the refetch disables the field; after a
  delete it goes to the "Stages" heading, and so after a refused delete (the stage gone, the last
  open one) or a rename that finds the stage gone, as the row goes or keeps only a disabled
  "Delete"; after the delete dialog is cancelled, or closed after an alert, to that stage's
  "Delete". Any other error that leaves a rename or add form in place returns focus to its field
  when focus is on the body or still on the button disabled while saving, never when the user has
  moved on.
- Dialogs return focus to their trigger. A delete dialog keeps its buttons off after the delete
  succeeds or answers 404, while the page leaves.

Every screen is checked at 390×844 and 1280×800, in light and dark themes, at 360 px for horizontal
scroll of the page, and by keyboard only.

## 6. Tests

- **Unit, packages/shared**
  - Create deal: title trimmed, blank → "Enter a title", 201 characters rejected; amount `0`
    accepted, `-1`, `1.5` and `100000000001` rejected with their messages; unknown currency
    rejected; missing `clientId`, `stageId` or `assigneeId` rejected.
  - Update deal: `{ version: 1 }` accepted; missing `version` rejected; `stageId` stripped.
  - Move: `afterId: null` accepted, missing `afterId` and missing `version` rejected.
  - Board query: no `assignee` and `assignee=me` accepted, anything else rejected.
  - Stages: name trimmed, blank → "Enter a stage name", 51 characters and NUL rejected; reorder
    with a duplicate → "Stages must be unique", empty and 11 ids rejected; delete query without
    `moveDealsTo` rejected.
  - History: an entry of each type parses; an unknown type and a `deal_moved` without `to` are
    rejected.
- **Unit, apps/api**
  - Deal position: a key for an empty column, before the first, after the last and between two;
    N keys after the last are ascending; keys extend and are extended by the library's defaults;
    equal keys throw, which is why a move reads the next neighbour as the first strictly greater
    key (the move integration tests cover that read).
  - Deal changes: equal fields dropped; title, amount with currency as one item, client and
    assignee with names; nothing changed → empty.
  - Deals service, repository mocked: create passes `workspaceId` and the caller; a missing client,
    stage or member → `RequestValidationError` on that field and no write; an edit with nothing
    changed writes nothing; a version mismatch → `DealChangedError`; a missing deal →
    `DealNotFoundError`; delete and restore by a manager on another's deal →
    `DealDeleteForbiddenError` and no write, by a manager on their own and an owner on anyone's →
    written; logs carry ids only.
  - Deal moves service: a stage or `afterId` not on the board, or `afterId` equal to the deal →
    `BoardChangedError`; entering won or lost sets `closedAt`, entering an open stage clears it;
    `afterId` is ignored for closed stages; a reorder within a column writes no entry.
  - Stages service: the 11th open stage → `StageLimitReachedError`; a name taken in another case →
    `StageNameTakenError`, the stage's own name in another case passes; reorder with a stale list →
    `StagesChangedError`; delete of won or lost, of the last open stage, with a closed, equal or
    unknown target → their errors; positions rewritten contiguous with won and lost last.
- **Integration, apps/api** (testcontainers, supertest, two registered workspaces, the first with an
  owner and a manager, the second with an owner, `resetDatabase` before each test)
  - Create → 201 matching `dealSchema`, first in its column on the board, one `deal_created`
    entry; in the won stage `closedAt` set; another workspace's client, a deleted client, another
    workspace's stage and a non-member assignee → 400 on that field and no row written;
    `workspaceId`, `createdById`, `position` and `version` in the body ignored.
  - Get → 200; another workspace's deal, a deleted deal and a deal of a deleted client → 404;
    `not-a-uuid` → 400 on `id`.
  - Edit: only sent fields change and version goes up by one; sending stored values → 200, version,
    `updated_at` and history unchanged; a stale version → 409 `DEAL_CHANGED` and the row unchanged;
    one `deal_updated` entry with the old and new names; another workspace's client, a deleted
    client and a non-member assignee → 400 on that field with the row and history unchanged;
    another workspace's deal → 404 `DEAL_NOT_FOUND`.
  - Concurrency: two edits with the same version at once → one 200, one 409; two moves with the
    same version at once → one 200, one 409, one entry.
  - Move: after a card in the same column, to the top, to another stage with an entry; into won
    sets `closedAt`, back to open clears it; `afterId` from another stage, another workspace or a
    deleted deal, and a stage of another workspace → 409 `BOARD_CHANGED` and nothing changed;
    another workspace's deal → 404 `DEAL_NOT_FOUND` and nothing changed; 50 moves between the
    same two neighbours keep the order; a deleted and restored deal is back in its place.
  - Board: every stage in order, empty ones included; open columns by position, closed columns by
    `closedAt` descending; 101 deals in one stage → 100 cards, `count` 101, totals over 101; totals
    per currency; deleted deals, deals of deleted clients and another workspace's deals absent from
    cards, counts and totals; the same number of SQL statements for one deal and for 30 deals over
    six stages by three assignees (Prisma query events).
  - Board with `assignee=me`, as an owner and as a manager: only deals assigned to the caller,
    including ones someone else created, with counts and totals over them; `assignee=someone` → 400.
  - Delete and restore follow the client rules of spec 06, with entries; restore of a deal of a
    deleted client → 404.
  - Client deletion hides its deals from the board, the client's deals and the deal routes; the
    client's restore brings them back with their version unchanged.
  - History: newest first; renaming a stage after a move keeps the old name in the entry; 101
    entries → 100 and `hasMore`; another workspace → 404.
  - Client's deals: only that client's visible deals, newest first; another workspace's client →
    empty list; no `clientId` → 400.
  - Stages: the list in order with `dealCount`; a manager gets 403 `INSUFFICIENT_ROLE` on every
    write and nothing changes; add puts the stage before won with contiguous positions; the 11th →
    409; a taken name in another case → 409; reorder → the board follows; a stale list → 409
    `STAGES_CHANGED`; delete moves every deal, deleted and hidden ones included, to the end of the
    target with an entry and version + 1 each, then the positions are contiguous; a closed, equal,
    missing or foreign target → 400 on `moveDealsTo`; the last open stage, won and lost → 409;
    another workspace's stage → 404; two concurrent adds of one name → one 201, one 409.
  - Members: own workspace only, in join order, readable by a manager.
  - Registration still creates six stages in order (spec 03 tests pass with the shared kind).
  - Without the access cookie every route → 401; writes with an untrusted origin → 403.
  - OpenAPI: the 15 new operations with their tags, the cookie scheme and 401; stage writes list
    403 `INSUFFICIENT_ROLE`; error responses reference `ApiProblem`; `assignee`, `clientId` and
    `moveDealsTo` are query parameters by name; `:id` operations have the path parameter `id`.
  - Schema: `deals.position` has collation `C`; the foreign keys from deals to clients and stages
    and from activities to deals are `NO ACTION`.
  - Migrations: deploy and the drift check in global setup pass.
- **Unit, apps/web (node)**
  - Prefetch: the board, a deal, its history, the stages, the members and a client's deals fill the
    keys the hooks read, and `/deals?mine=true` fills the key the client hook builds for that URL;
    a failure → one `warn` line with the label and reason; a deal 404 → the request made and no
    log line.
- **Unit and component, apps/web (jsdom, MSW)**
  - `applyMove`: within a column, across columns, to the top, into a closed column first with
    `closedAt`, out of it with `closedAt` cleared; counts and totals move by currency and a total
    whose count reaches zero is dropped.
  - Board view: skeleton, columns with totals text, the truncated column line, the empty board,
    error with "Try again" that refetches.
  - Board filter (nuqs testing adapter): `?mine=true` presses the toggle and the request carries
    `assignee=me`; the toggle writes and removes `mine=true`, replacing history; `?mine=yes`
    filters nothing; the filtered empty state and "Show all deals", which leaves focus on the
    toggle; old columns stay with `aria-busy` while the filtered board loads.
  - Move menu: the card moves before the response; the request is
    `{ version, stageId, afterId: null }`; 409 `DEAL_CHANGED` → the card returns, the toast shows
    and the board refetches; two quick moves of one card → the second request carries the version
    of the first response; focus lands on the menu button in the new column, and after a failure
    on the card where the refetch put it, or on the heading when the deal is gone.
  - Failed and queued moves: a failed card goes back while other queued cards stay; a card with its
    own move queued stays; two failures show one toast; the board refetches only after the last
    move, and not on window focus or reconnect while one is pending.
  - A pointer drag renders no other card again; `revertMove` puts back one card with its current
    fields; a failed pointer drag leaves focus alone when the card did not have it and returns it
    without scrolling when it did; the keyboard coordinates keep Up and Down in the card's column.
  - Dragging across columns is not tested in jsdom, which has no layout for dnd-kit to measure; the
    browser check covers it, and spec 13 adds e2e.
  - Deal page: the stage select sends a move and the details follow, shows its stage when the
    cached list lacks it, and a 409 shows the deal page's toast; every history line of section 5;
    the not found state on 404.
  - Deal form: empty submit → errors and no request; `1,500.50` → `amount: 150050` in the request,
    `1.234` and `-1` → their messages; typing in the client picker sends one request with the last
    term as `q`, and `useDebouncedValue`, under fake timers, waits the full delay and starts it over
    on every change; "No clients found" is in the live region; "Try again" refetches and focuses
    the search field; choosing sets the client; a client from the URL shows its name; assignee
    defaults to the caller; create replaces the route with the deal page and focuses its heading; a
    400 on `clientId` lands on Client; edit sends `version` and changed fields only; 409 → the alert,
    and "Reload" resets the form to the new deal; 404 on edit → the alert.
  - Delete: hidden for a manager on another's deal, shown for their own and for the owner; confirm
    → `DELETE`, route replaced, toast with Undo; Undo after the page unmounted →
    `POST …/restore`, "Deal restored"; 403 → toast and focus back on Delete; 500 → alert in the
    dialog.
  - Stages: an owner sees the controls, a manager the note; "Move up" sends the new order and keeps
    focus; the delete dialog defaults its target and sends it; add is disabled at 10 open stages;
    `STAGE_NAME_TAKEN` lands on the field; `STAGES_CHANGED` → the toast and a refetch; an error
    that leaves a rename or add form in place returns focus to its field.
  - Client card: the deals section, its empty state and "New deal" link; the new delete dialog text;
    deleting a client invalidates the board and the stages.
  - Money: `formatMoney(150000, 'USD')` → `$1,500`, `150050` → `$1,500.50`, `EUR` → `€1,500`.
  - Main nav: `aria-current` on `/deals` and `/deals/<id>`.
  - The default MSW handlers gain `GET /api/stages` with the six default stages and
    `GET /api/members` with the session user: the deal forms, the deal page's stage select and the
    stages page request one or both on mount, and unhandled requests fail tests.
- **e2e**: none (spec 13).
- **Tooling checks**, done once on throwaway changes that are not committed; each must fail:
  - `features/move-deal` importing `@/features/deal-form` (lint);
  - `entities/deal` importing `@/entities/client` (lint);
  - `entities/member` importing `@/entities/deal` (lint).

## 7. Acceptance criteria

- [ ] `pnpm db:migrate` applies `deals` locally; `\d deals` in `psql` shows the indexes, collation
      `C` on `position` and the foreign keys of section 3; `\d activities` likewise.
- [ ] With 2 000 deals generated in one workspace through `psql` and `ANALYZE` run, `EXPLAIN ANALYZE`
      of the board statement taken from the Prisma debug log uses the
      `(stage_id, position, id)` index for open columns, and the board answers within
      100 ms locally. The SQL and the plan go into the PR description.
- [ ] In the browser: create a deal from the board and one from a client card; move a deal through
      every stage by mouse, by keyboard and from the menu; reorder within a column and reload: the
      order holds; the history shows each step; edit the amount; delete; undo.
- [ ] Two windows, owner and manager: both move the same card without reloading; the second sees
      the toast and the first's result. Both edit one deal; the second save shows the conflict
      alert, and "Reload" shows the first's changes.
- [ ] Stages: add, rename, reorder and delete with a target; the board follows; a manager sees the
      list read-only.
- [ ] "Only mine" lives in the URL: a copied link opens the same board in a new tab, reload keeps
      it, Back from a deal page returns to the filtered board.
- [ ] On a 390 px phone the board swipes sideways, the handle drags, the menu moves; at 360 px the
      page has no horizontal scroll.
- [ ] A reload of `/deals` and of a deal page within 15 minutes of logging in: the server HTML
      contains the data, and the browser does not request it again after hydration. Each deal
      route shows its own skeleton.
- [ ] Manager rules for deals and stages are covered by integration tests; in the browser the owner
      sees Delete on every deal and "Edit stages".
- [ ] `browser-verify` over the screens of section 5 at both sizes and in both themes: no failed
      requests except the expected 401 before a refresh, the 404 of a not found deal and the 409s
      the conflict check provokes; no console errors except the browser's own lines for those; no
      hydration warnings.
- [ ] Keyboard only: drag a card across columns with the handle and hear the announcements in the
      accessibility tree, move one from the menu, open a deal, change its stage, edit it, delete
      through the dialog, undo; add, rename, reorder and delete a stage; focus always visible.
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` pass locally;
      a second `pnpm build` is a full Turborepo cache hit.
- [ ] CI on this PR: `lint`, `typecheck`, `test`, `image`, `pr-title` green; the `image` smoke test
      applies the new migration in the container.
- [ ] Every tooling check from section 6 fails as described.
- [ ] `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` and `fractional-indexing` are the
      latest stable versions, exact-pinned; `popover` and `command` come from the CLI run of section
      2; clean install has no engine, peer dependency or ignored build script warnings.
- [ ] No new environment variables: `.env.example` and the hosting panels are unchanged.
- [ ] One migration, `deals`, in the PR with the code that uses it.
- [ ] After the merge, the `main` run deploys by itself; the Render log shows the migration applied
      on Neon; on the live URL a deal is created, moved by drag and from the menu, edited, deleted
      and restored, and a stage is added and deleted with a target; `browser-verify` against the
      live URL over the screens of section 5 passes.
- [ ] ADR 0010 is written.
- [ ] This spec is part of the PR.
