# Organizer guide

Everything you need to run the service day to day. No technical knowledge needed.

## First day checklist

1. **Settings → Business.** Business name, your phone and email, the package shipping address (only shown to signed-in families when they pick a package delivery), service area and hours.
2. **Settings → Services & prices.** Check each service and its fee. The *category* decides which questions families are asked. The *instructions* box is where tips like "choose bottled drinks" or "request bags — Colorado charges for them" go; families see them while they fill in the order.
3. **Settings → Drop-off points.** Where you deliver, e.g. "Arnold Hall — delivery shelf (Richter Lounge, by the soda machines)".
4. **Settings → Payments.** Tap **Venmo**, **PayPal**, **Cash App** or **Zelle** to add a method, then replace `YOUR-HANDLE` with yours. Keep `{amount}` and `{note}` in links — the app fills in the right amount and order number for each family.
5. **Settings → Text & email setup.** Connect texting (Twilio) and email. Send yourself a test of each. Until this is done, messages wait in the Outbox.
6. **Share your site link** on Facebook and with families. They create an account, link with their cadet, and order.

## Your daily rhythm

**Dispatch** is your home screen.

- **Requests** — new orders waiting for you. Tap **Accept** and the family is texted a confirmation with the delivery fee. **Review** opens the order if you need to decline (you'll be asked for a short message to the family) or change something.
- **Today's deliveries** and **Coming up** — what's confirmed.
- **Short notice** tags mark orders placed inside your minimum-notice window, so you can decide case by case.

When it's time to drive, open **Run Mode**.

## Run Mode — updates without typing

Run Mode is built for your phone. Each delivery is a card with the store, the name on the order, the order number, the cadet and the drop-off point.

1. Before you pull out, pick the minutes (10 / 15 / 20 / 30) and tap **On the way**. The family and cadet get a text with the ETA and a tracking link.
2. Need a new ETA? Pick the minutes and tap **New ETA**.
3. At the drop-off, tap **Delivered**, take a photo and pick a note ("On the delivery shelf"). The family gets the photo link.

Doing a group run? Tick the boxes on several cards and use the bar at the top to send *Heading to pickups* or *On the way* to all of them at once.

**Navigate** opens the store in Google Maps. The phone buttons call or text the cadet if you need to.

> Tap updates before you leave or once you're parked. That's the point — the app does the texting.

## Surprises

Families can choose:

- **Heads-up surprise** — the cadet is told when and where to be (when you tap *On the way*) but not what it is.
- **Total surprise** — the cadet hears nothing until it's delivered, then gets a "Surprise!" text.

Surprise orders show a purple badge for you and in Run Mode. Don't mention the contents to the cadet.

## Messages — one inbox

Everything lands in **Inbox**: messages sent in the app, conversations on specific orders, and **replies to the texts the app sends**. When you reply from the inbox, it reaches them by text (or email, per their settings) if they aren't in the app right now — people who have the app open just see it there.

Quick replies ("On my way now.", "Delivered — it is on the shelf.") are one tap.

If someone reaches you on Facebook or by personal text, you can still keep it all here: **People → Add a family** creates their profile (no account needed), then **Log an order** on their page.

## Group runs

**Group runs** are scheduled pickups families can join at a lower fee — e.g. "Tuesday Chick-fil-A run, pickup 1730". Set a cutoff time and an optional order limit. **Next week** copies a run forward; the calendar button repeats it for four weeks. Open runs appear on the home page and at the top of the order form.

## Announcements (instead of Facebook posts)

**Announcements** posts to everyone's app. Choose to also email or text it, limit it to families, cadets or one class year, and pin important ones. The **copy** button formats it for a Facebook post, with your site link.

## Payments

Families pay the delivery fee with your links and tap **I've sent it**. You'll see those under **Payments → To verify**; tap **Paid** once it shows up in your Venmo/Zelle. **Unpaid** lists everything outstanding. You can also **Waive** a fee.

**Semester subscribers:** open the cadet in **People**, add a subscription with start and end dates. Their orders in that window are marked *Covered* automatically.

## Helpers

People can apply from the sign-up page ("Helper"). You'll get a text. In **Team**:

- Read their note, choose what they can do, then **Approve** or **Decline**.
- Or skip the application: **Invite a helper** creates a one-time link that's pre-approved with the access you choose.

| Permission | Lets them… |
|---|---|
| Run deliveries | Use Run Mode for deliveries assigned to them. |
| Claim open orders | See confirmed orders nobody is driving and take them. |
| Dispatch | See all orders, accept/decline, edit, assign drivers. |
| Shared inbox | Read and answer every conversation. |
| Payments | Mark payments received or waived. |
| Announcements | Post announcements. |
| Customer directory | See family contact details. |

Assign a driver from any order (the **Driver** drop-down); they get a text. **Make organizer** gives someone full access; **Deactivate** removes access immediately and puts their unstarted deliveries back in the open pool.

## Changing what the texts say

**Settings → Message templates** lists every text and email the system sends. Pick one, edit the words, and tap the blue chips to insert details like `{eta}` or `{location}`. The preview shows exactly what a family will see, and the SMS segment counter helps keep texts short. Turn text or email on/off per message. **Reset to default** undoes your changes.

## Closed days and rules

**Settings → Scheduling**: minimum notice, your usual delivery window, a daily limit, the time day-before reminders go out, and **blackout dates** (e.g. holiday weekends when Arnold Hall is closed) — families can't book those days.

## If something seems wrong

- **A family says they didn't get a text.** Check **Settings → Outbox**. Failed or "not sent" messages show the reason and have a **Resend** button. Also check their notification preferences on their People page.
- **Someone forgot their password.** They can use *Forgot password* on the sign-in page, or open them in **People** and use **Password reset link** to send it yourself.
- **You want a copy of everything.** **Settings → Backups & data → Download full backup.** A backup also runs automatically every night.

## Your theme

Profile → Theme: Academy (blue and silver), Falcon (navy and brass) or Neutral, in light, dark or automatic. Settings → Sign-up & look sets the default everyone sees.
