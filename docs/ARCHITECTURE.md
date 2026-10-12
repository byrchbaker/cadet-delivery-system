# Architecture

A deliberately small stack so one person can keep it running.

```
shared/   Domain vocabulary used by both sides: roles, helper permissions, order
          statuses, service categories (and the questions each asks), message
          templates, zod schemas, formatting helpers, API types.
server/   Express 5 + better-sqlite3. One process: REST API, server-sent events,
          outbound text/email queue, scheduled jobs, static file serving.
web/      React 19 + Vite + TanStack Query. Hand-written CSS design system.
```

## Server

| Path | Responsibility |
|---|---|
| `src/db.ts` | Opens SQLite (WAL) and runs migrations. Add a new string to `MIGRATIONS`; never edit a shipped one. |
| `src/lib/auth.ts` | Cookie sessions (hashed tokens in `sessions`), CSRF header check, role/permission guards. |
| `src/lib/orders.ts` | The order engine: visibility rules, surprise redaction, creation rules (lead time, blackouts, capacity, subscriptions), status transitions and who gets notified. Start here. |
| `src/lib/threads.ts` | Conversations, unread tracking, inbound SMS routing. |
| `src/notify/` | `notify()` writes in-app notifications and queues texts/emails using the editable templates; `providers.ts` talks to Twilio (REST) and SMTP (nodemailer). |
| `src/realtime.ts` | SSE hub. The server only says *what changed*; clients refetch. |
| `src/jobs.ts` | Every minute: day-before reminders, retrying the outbound queue, the nightly backup. |
| `src/routes/` | HTTP handlers, grouped by area. |

### Permission model

`organizer` has everything. A `helper` must be `active` (approved) and holds a list of permissions (`deliver`, `claim`, `dispatch`, `inbox`, `payments`, `announce`, `people`). Checks live on the server — `relation()` in `lib/orders.ts` decides what each person can see of an order, and SQL in `listOrders` mirrors it. `hasPermission()` in `shared/` is the single definition used by both sides.

### Surprises

`surprise = 'hidden'` orders are invisible to the cadet until delivered. `'heads_up'` orders appear to the cadet once confirmed, redacted to time and place. Redaction happens in `toOrderDTO()`; the cadet also gets different notification templates (`surprise_heads_up`, `surprise_delivered`).

### Notifications

Every send is a row in `notifications` (`channel` = `inapp` | `sms` | `email`). Text and email rows start `pending`; the queue marks them `sent`, `failed` (after 3 attempts) or `skipped` (provider not configured). Chat messages skip text/email for people who currently have the app open.

## Web

- `src/lib/` — API client, auth context, theme provider, realtime hook, queries.
- `src/components/ui.tsx` — the component kit (buttons, fields, cards, modals, badges).
- `src/styles/tokens.css` — all colours per theme/mode. Charts use `--chart-1`, validated per theme for contrast and colour-vision safety.
- Staff pages are lazy-loaded so families download less.

## Tests

`npm test` runs API tests against an in-memory database with recording text/email drivers: setup, family linking, the full order lifecycle, surprises, payments, subscriptions, helper approval and permissions, messaging, inbound SMS signature checks and announcements.
