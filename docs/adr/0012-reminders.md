# 0012 — Reminders

Status: accepted
Date: 2026-10-11

## Context

A task can carry one reminder, an absolute time, and its assignee must get it in the app once, at
that time. The demo runs on free tiers: Valkey (Render Key Value) has 25 MB and no persistence, so
a restart loses every key, and Neon bills compute by the hour it is awake and sleeps after 5 idle
minutes. The API is one process on Render; there is no separate worker service.

## Decision

- **Postgres is the source of truth, Valkey holds only timers.** `remind_at` and
  `reminder_sent_at` live on the task. Valkey keeps a delayed BullMQ job only for a pending
  reminder within two hours of now. After a task write commits, its pending reminder is added at
  once; an hourly sweep reads every pending reminder over the `remind_at` index and adds the
  missing jobs with one `addBulk`. Job ids carry the task and the reminder time, so an add whose
  job exists is ignored.
- **Exactly once through the delivery transaction.** The worker locks the task row, checks that
  the reminder is still the pending one the job names, sets `reminder_sent_at` and inserts the
  notification in one transaction. A second run of a job, or a second job for the reminder, finds
  it sent and writes nothing. The assignee is read at delivery.
- **A process clock instead of BullMQ job schedulers.** Every 5 minutes the API adds each recurring
  job (the sweep, the session purge) with deduplication for one period, so BullMQ ignores the add
  while one added less than a period ago exists, however many ticks or instances there are.
- **Plain `bullmq` instead of `@nestjs/bullmq`.** Queues fail an add within seconds while Valkey is
  down; workers retry forever and have no command timeout. Two small classes keep these options
  and the closing order explicit: workers close before the HTTP server, queues with Prisma after
  it.
- **Instants only, no user time zone.** The API stores and returns UTC instants; the browser turns
  local input into instants and shows them in its own zone.
- **Polling until the v2 WebSocket.** The bell asks for the unread count once a minute, only while
  the tab is visible and the user was active within 15 minutes.

## Alternatives

- **Polling Postgres for due reminders every minute.** Simple and needs no Valkey, but Neon would
  never sleep and the month's compute would run out. Rejected.
- **Queueing every reminder when it is written.** Valkey's 25 MB would fill with tasks planned
  months ahead and with stale jobs of changed reminders, and a Valkey restart would still lose them
  all. Rejected.
- **BullMQ job schedulers for the sweep and the purge.** They live in Valkey and vanish with its
  data, which would stop the sweep until the next deploy. Rejected.
- **`@nestjs/bullmq`.** It supports Nest 12, but one connection setting serves both queues and
  workers, and the closing order is the library's. Rejected.
- **A user time zone setting.** Not needed while the browser formats every time; Telegram (v2)
  formats on the server and brings one. Deferred.

## Consequences

- An idle API wakes Neon about once an hour for the sweep: about 15.5 of the 100 CU-hours a month.
- After Valkey loses its data, the next tick, within 5 minutes, runs the sweep and every pending
  reminder is back, so a reminder can come up to 5 minutes late. After API downtime longer than an
  hour, a reminder can wait up to an hour for the next sweep.
- A reminder more than a day late is dropped, and the bell lags a reminder by up to a minute.
- A reopen, restore or reassignment that lands in the milliseconds while the reminder's previous
  job is finishing is ignored by its job id; that reminder then waits for the next sweep, up to an
  hour. Accepted as rare.
- Seven Valkey connections of the 50 Render allows: the probe, two queues, two workers with two
  each.
