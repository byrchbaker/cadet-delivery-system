# Cadet Delivery System

One place to run a cadet delivery service: families and cadets place orders, the organizer accepts and dispatches them, drivers post ETAs with one tap, and everyone gets texts, emails and live tracking automatically. It replaces the mix of Google Forms, Facebook Messenger, personal texts, emails and Facebook posts with a single system.

It ships empty. The first person to open it sets up the business (name, contact details, prices, payment links), and everything is editable from **Settings** without touching code.

## Who it's for

| Role | What they get |
|---|---|
| **Parent / family** | Order for their cadet, send **surprise** deliveries (fully secret, or "when and where" only), ask the cadet to confirm first, pay delivery fees with pre-filled Venmo/PayPal/Cash App links, see every order for their cadet, live tracking with ETA and a drop-off photo. |
| **Cadet** | Order for themselves, ask family to cover the fee, accept or decline orders family set up, live tracking, join group runs. Doesn't need an account — a parent can add them and texts still reach their phone. |
| **Organizer** | Dispatch dashboard, request queue with one-tap accept, **Run Mode**, calendar, group runs, unified inbox (app + replies to texts), announcements with "copy for Facebook", customer directory, payments ledger, semester subscriptions, reports, message templates, team management, backups. |
| **Helper** | Apply to help, wait for approval, then see only what the organizer allows: run deliveries, claim open orders, dispatch, shared inbox, payments, announcements, or the customer directory. |

## Highlights

- **One adaptive order form.** Instead of one long form trying to cover food, birthdays, groceries, packages, laundry and rides, the wizard asks only the questions that service needs (order number and "name on the order" for food, flight details for airport rides, bag label for laundry), pre-fills `CADET LASTNAME`, and warns about short notice or closed days.
- **No texting while driving.** Run Mode gives big buttons — *Heading out*, *On the way · 15 min*, *Delivered + photo* — and every tap texts and emails the family with the ETA. Several orders can be updated at once.
- **One inbox.** In-app messages, order conversations and replies to delivery texts all land in the same place. People who are in the app don't get duplicate texts.
- **Live everywhere.** Screens update instantly (server-sent events). Texts include a no-login tracking link.
- **Helpers with guard rails.** Applications wait for approval; permissions are per person and enforced by the server, not just hidden in the UI.
- **Low maintenance.** One Node process, one SQLite file, nightly automatic backups, one-click backup download, an Outbox that shows every text and email and lets you resend failures.
- **Themes.** Academy (blue and silver, default), Falcon (navy and brass) or Neutral (no military styling), each in light and dark. Military time is shown alongside civilian time.

## Run it locally

Requires Node.js 22+.

```bash
npm install
npm run dev          # API on :8080, web app on http://localhost:5173
```

Open http://localhost:5173 and complete the first-time setup. Without text/email credentials, outgoing messages are logged to the console and kept in **Settings → Outbox**.

```bash
npm test             # API test suite
npm run typecheck
npm run build        # production build (web + server)
npm start            # serves everything on :8080
```

## Deploy

The simplest production setup is the included Docker image — one container and one volume:

```bash
cp .env.example .env     # set APP_URL at minimum
docker compose up -d
```

See [docs/DEPLOY.md](docs/DEPLOY.md) for hosting options, HTTPS, connecting Twilio and email, backups and updates.

## Documentation

- [Organizer guide](docs/ORGANIZER_GUIDE.md) — day-to-day use, written for the person running the service.
- [Deployment & maintenance](docs/DEPLOY.md)
- [Architecture](docs/ARCHITECTURE.md) — for whoever maintains the code.

---

Independent family-run service software. Not affiliated with or endorsed by the U.S. Air Force Academy or the Department of the Air Force.
