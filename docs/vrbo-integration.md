# VRBO integration — design

Status: **proposal**. Nothing here is built yet. This document exists to be
disagreed with before any of it becomes a migration that has to be lived with.

## The setup

Four properties, all listed on Vrbo. JB does the cleans and looks after the
places over the summer. You handle anything big, and you run the guest
conversation yourself: a welcome email, a welcome message on WhatsApp (SMS if
they are not on WhatsApp), a goodbye message, and a review request — some of
which Vrbo already sends automatically. Separately you are building
**thewishingstream.com** and want the guest relationship to feed it.

## What this is for

1. **Bookings become work.** A reservation is not interesting in itself; the
   coordination it implies is. Reservations arrive on their own and generate
   tasks in the table the catalog already has.
2. **Bookings become searchable.** A stay you can ask about later — who, when,
   what went wrong — living in `thoughts` alongside everything else.
3. **A per-property knowledge base.** House manual, boiler reset, wifi code,
   JB's number, which supplier does the linen. The things currently in your head
   or in a text thread.
4. **Guest message drafting.** Compose the four messages you already send from
   1–3 rather than from scratch, and stop sending the ones Vrbo now sends for
   you.
5. **Feed thewishingstream.com.** Turn one-off Vrbo guests into people who know
   your site exists. This one has a compliance ceiling — see below — and the
   design is built to respect it rather than route around it.

## The constraint that shapes everything

Vrbo has no open API for individual owners. The Expedia Group partner API is
gated behind a signed property-manager agreement. What an owner can actually
reach is:

- the **iCal reservation feed** each listing exports, and
- the **emails** Vrbo sends when something happens.

You picked the iCal feed. It is the right backbone: it is a documented,
supported export, it needs no scraping, and it does not break when a marketing
team changes an email template.

**But the feed is deliberately thin.** Each `VEVENT` carries dates and a status
label — `Reserved`, `Unavailable`, optionally `Tentative` for inquiries. It does
not carry the guest's name, their contact details, the party size, or the
payout. This is a privacy decision on Vrbo's part, not an oversight, and it will
not change.

So the goals divide:

| Goal | Served by iCal alone? |
| --- | --- |
| Bookings → tasks | **Yes.** Dates are all a schedule needs. |
| Property knowledge base | **Yes** — it never depended on the feed. |
| Bookings → thoughts | **Partly.** You get a record with no one in it. |
| Guest message drafting | **No.** Needs a name and a phone number. |
| Feed thewishingstream.com | **No.** Needs a durable guest identity. |

The feed is therefore the **skeleton** — every booking's existence and dates —
and there is one clear seam where **flesh** (guest identity, contact details,
money) is attached from elsewhere.

That seam is not hypothetical, and this is the thing that changed since the
first draft: **you already do this by hand every booking.** You have the guest's
email and phone, because you email and WhatsApp them. Vrbo gives you those
details once a booking is confirmed. So the enrichment step is not a speculative
future feature — it is transcribing something you are already holding, and the
only real question is whether you keep typing it or whether the booking
confirmation emails get parsed for you later. The schema is identical either
way.

## Data model

Five new tables in `public`, same posture as `thoughts` and `tasks`: RLS on,
service-role only, reached exclusively through the edge function.

### `properties`

Not `vrbo_properties`. A property is a property; the channel it was booked
through is an attribute of the *booking*. Naming it for Vrbo means renaming it
the day one of the four also goes on Airbnb.

```
id                uuid pk
slug              text unique   -- 'maple-st'. Used verbatim as the task
                                -- `project` label and as a `thoughts` topic,
                                -- so it is a stable identifier, not a display
                                -- name.
name              text not null
address           text
timezone          text not null default 'Europe/London'
active            boolean not null default true

-- Who covers the ground work, and when. JB is not on every property in every
-- month, and a task addressed to the wrong person is worse than no task.
caretaker_name    text
caretaker_months  int[] not null default '{1,2,3,4,5,6,7,8,9,10,11,12}'
caretaker_phone   text

-- Which of the guest messages you actually send for this property, given that
-- Vrbo already sends some of them. Keys match the templates below.
message_settings  jsonb not null default '{}'

notes             text
created_at / updated_at
```

`timezone` is not decoration. Check-in and check-out are calendar days in the
property's local time. A turnover due "Saturday" must not become Friday because
the sync ran on a server in another zone — the same reasoning that put the
UTC-only date arithmetic in `tasks.ts`.

`caretaker_months` encodes "JB looks after the place in summer" without
pretending a season is a date range that recurs. If the checkout month is in the
array, the coordination task is addressed to JB; if it is not, it is addressed
to you. **I need you to confirm the reading here** — see open question 2, because
"JB does the clean and looks after the place in summer" parses two ways and they
produce different tasks in February.

### `property_feeds`

One row per iCal URL per property. All four are Vrbo today; this costs nothing
now and is the difference between adding a channel and migrating a schema.

```
id                uuid pk
property_id       uuid fk -> properties on delete cascade
channel           text check in ('vrbo','airbnb','booking','other')
ical_url          text not null
active            boolean not null default true
last_synced_at    timestamptz
last_success_at   timestamptz
last_status       text        -- 'ok' | 'http_404' | 'parse_error' | ...
last_error        text
etag              text        -- for conditional GET
last_modified     text
created_at / updated_at
```

**The URL is a credential.** Vrbo's export URL embeds an unguessable token and is
not otherwise authenticated: anyone holding it can read that property's booked
dates forever. Consequences the implementation must honour:

- It never appears in `index.html`, in any client-side code, or in a log line.
- It is never returned in full by an MCP tool — tools return a masked form
  (`…/icalendar/9f3c…a71b.ics`).
- A service-role-only table is acceptable given the existing posture. Supabase
  Vault is available if you want it out of table storage; at four listings I
  would not bother.

### `guests`

The guest is a person, not a booking. They can come back — and the entire point
of goal 5 is that some of them should. A table keyed on the booking cannot
express "this is their third stay", which is exactly the fact that makes an
outreach message worth sending.

```
id                 uuid pk
name               text
email              text
phone              text
-- Whether WhatsApp reached them. There is no reliable way to detect this
-- programmatically without the WhatsApp Business API, so this records what you
-- found out the first time and saves you guessing again.
whatsapp           boolean          -- null = not yet known
marketing_consent  boolean not null default false
consent_source     text             -- how and where they agreed
consent_at         timestamptz
notes              text
created_at / updated_at
```

Matched on lowercased email first, then phone in E.164. Never on name — two
different Smiths is not a merge.

### `bookings`

```
id              uuid pk
property_id     uuid fk -> properties on delete cascade
guest_id        uuid fk -> guests on delete set null
channel         text not null default 'vrbo'

uid             text not null      -- the VEVENT UID, as given
previous_uids   text[] not null default '{}'

checkin         date not null
checkout        date not null
status          text not null check in
                  ('confirmed','tentative','blocked','cancelled')

summary_raw     text               -- the raw SUMMARY / DESCRIPTION, kept so a
description_raw text               -- better parser can be re-run over history
                                   -- without re-fetching anything

-- Enrichment. None of this comes from iCal.
party_size      int
payout_amount   numeric(10,2)
payout_currency text
enriched_from   text               -- 'manual' | 'gmail' | null
enriched_at     timestamptz

thought_id      uuid fk -> thoughts on delete set null

first_seen_at   timestamptz not null default now()
last_seen_at    timestamptz not null default now()
cancelled_at    timestamptz
created_at / updated_at

unique (property_id, channel, uid)
```

Guest identity lives on `guests` and is reached through `guest_id`, so a
returning guest is one row with three bookings rather than three strangers who
happen to share an email address.

Indexes: `(property_id, checkin)` for the calendar view, a partial index on
`checkout` where `status in ('confirmed','tentative')` for "what turns over
next", and `(property_id, checkin, checkout)` for the identity matching below.

### `message_templates`

The message text is content you will want to edit without a deploy, so it lives
in a table rather than in the source.

```
id            uuid pk
property_id   uuid fk -> properties  -- null = the default for all four
template_key  text not null          -- 'welcome_email' | 'welcome_message' | ...
channel       text check in ('email','whatsapp','sms','none')
subject       text                   -- email only
body          text not null          -- with {{guest_name}}, {{checkin}}, ...
active        boolean not null default true
created_at / updated_at

unique (property_id, template_key)  -- nulls not distinct
```

A null `property_id` is the house style; a row with a `property_id` overrides it
for that property. Four properties will share most wording and differ on the
arrival instructions, which is exactly what this shape is for.

## Booking identity — the hard part

A sync that cannot tell "this is the booking I already have" from "this is a new
one" produces either duplicate messages to a guest or missed cleans. The obvious
key is the `UID`, and **Vrbo does not document that its UIDs are stable.** I
could not find a guarantee either way, and channel-sync tools broadly treat
re-issued UIDs as a fact of life. So the design does not depend on it:

1. Match on `(property_id, channel, uid)`. Almost always hits.
2. Otherwise match on `(property_id, checkin, checkout)` among bookings not
   already cancelled. A hit means the same stay came back under a new UID:
   adopt the new `uid`, push the old onto `previous_uids`, keep the row and
   therefore keep the tasks and the guest link hanging off it.
3. Otherwise insert.

Ambiguity in step 2 — two non-cancelled bookings for the identical property and
dates — is not resolvable automatically and must not be guessed. Log it, leave
both rows untouched, and surface it in the sync report.

### Disappearance is not always cancellation

If an event vanishes from the feed, the booking was probably cancelled. But it
also vanishes when the fetch half-failed, when the token was rotated, when Vrbo
served a stale or empty calendar, or when the export's window does not reach
that far. Marking bookings cancelled off a bad fetch silently drops real cleans
and sends a goodbye message to somebody who has not arrived. Rules:

- Only reconcile disappearance after a fetch that returned **HTTP 200, parsed
  cleanly, and yielded at least one `VEVENT`**. An empty-but-valid calendar is
  treated as a failed sync, never as "everything was cancelled".
- Only consider bookings whose `checkout` is in the future. History is never
  retroactively cancelled.
- Cancellation sets `status = 'cancelled'` and `cancelled_at`. Rows are never
  deleted — same reasoning as the `dropped` task status.
- A booking that reappears after cancellation is un-cancelled, not duplicated.

## Sync mechanics

### Where the code goes

Add to the **existing** `open-brain-mcp` edge function rather than standing up a
second one. It already has the auth model, the deploy workflow, the CORS fix and
the client. A second function is a second thing to deploy and a second place for
the access key to leak.

Pure logic goes in `supabase/functions/open-brain-mcp/ical.ts`, mirroring how
`tasks.ts` was split out: parsing and date arithmetic are testable without a
network or a database, and they are exactly the parts that fail quietly.

### Parsing, and the two bugs everyone writes

- **Line unfolding.** RFC 5545 folds long lines at 75 octets with a CRLF and a
  leading space. Unfold before parsing or long `DESCRIPTION`s parse as garbage.
- **`DTEND` is exclusive for all-day events.** A stay of the 12th to the 19th is
  `DTSTART;VALUE=DATE:20260812` / `DTEND;VALUE=DATE:20260819`, and the guest
  leaves on the 19th. Checkout is `DTEND` as written — subtracting a day here is
  the most common bug in this kind of integration, and it silently moves every
  clean and every goodbye message to the wrong day.
- **`DATE` vs `DATE-TIME` with `TZID`.** Vrbo exports all-day `DATE` values, but
  the parser should not fall over given a timestamp; convert into the property's
  timezone and take the calendar date.
- **Status mapping.** `SUMMARY` containing "Reserved" → `confirmed`;
  "Tentative" → `tentative`; "Unavailable"/"Blocked" → `blocked` (an owner
  hold). Anything unrecognised → `confirmed` with the raw text preserved,
  because treating an unknown label as "no booking" risks missing a real stay.

### Scheduling

Vrbo regenerates its export roughly every 30 minutes, so polling faster than
hourly buys nothing. Two options:

- **GitHub Actions cron** (recommended to start). A scheduled workflow POSTs a
  `tools/call` for `sync_vrbo_feeds` at the MCP endpoint — exactly what the
  catalog's front-end already does, so it needs no new server code path, just
  the existing `x-brain-key` as a repo secret. Caveats to accept knowingly:
  scheduled workflows on public repos are disabled after 60 days of repository
  inactivity, and cron firing can be delayed under load. Neither matters for a
  three-hourly poll of a calendar that changes a few times a month.
- **`pg_cron` + `pg_net`.** Both extensions are available on your project but
  **not currently installed**. More reliable and independent of GitHub, at the
  cost of scheduling logic living somewhere the repo does not show you.

Start with Actions; move to `pg_cron` if a missed sync ever matters.

Send `If-None-Match`/`If-Modified-Since` from the stored `etag`/`last_modified`
and treat `304` as a successful no-op.

### Sync report

Every run returns, and records, a short human-readable summary: per feed, how
many events were seen, created, updated, cancelled, and skipped as ambiguous.
Silence is not evidence a sync worked.

## Bookings → tasks

A join table rather than new columns on `tasks`:

```
booking_tasks
  booking_id   uuid fk -> bookings on delete cascade
  template_key text
  task_id      uuid fk -> tasks on delete cascade
  primary key (booking_id, template_key)
```

`tasks` stays generic, and the primary key does the idempotency work: re-syncing
the same booking a hundred times cannot produce a second welcome email, because
the second insert collides. That is the whole reason for the table.

The templates below are your actual sequence, not a guess at a generic host's:

| key | title | due | channel |
| --- | --- | --- | --- |
| `notify_caretaker` | `Confirm {caretaker} — turnover {property}` | checkin − 7 days | — |
| `welcome_email` | `Welcome email — {guest} at {property}` | checkin − 7 days | email |
| `welcome_message` | `Welcome WhatsApp — {guest}` | checkin − 1 day | whatsapp/sms |
| `goodbye_message` | `Goodbye message — {guest}` | checkout | whatsapp/sms |
| `review_request` | `Ask {guest} for a review` | checkout + 2 days | email |

All get `project = property.slug` and `source = 'vrbo-sync'`.

**Every template is switchable per property via `properties.message_settings`,
and this is the point of that column.** You said Vrbo already sends some of these
automatically. A system that cheerfully generates a task to send a welcome email
Vrbo already sent is not neutral — it trains you to ignore the list. Before slice
3 ships, we go through the five keys per property and turn off the ones Vrbo has
covered. Default for anything unconfirmed is **off**: a missing message you
notice beats a duplicate one the guest notices.

`notify_caretaker` replaces the "turnover clean" task from the first draft. You
do not clean; JB does. The task is confirming JB has it, which needs lead time,
not a reminder on the day. It is addressed to JB when the checkout month is in
`caretaker_months` and to you otherwise.

Behaviour on change:

- **Dates move** → move the task's `due_date`, but only while it is still open.
  A completed task is a historical fact and is left alone.
- **Booking cancelled** → set open generated tasks to `dropped`, not deleted,
  and never silently: a cancelled booking whose welcome email already went out
  is exactly the case you need to see.
- **Blocked/owner hold** → generate nothing. Not a guest stay.
- **Tentative** → generate nothing by default. Inquiries expire far more often
  than they convert.

One derived signal worth having, cheap here and painful by hand: **same-day
turnarounds**, where one booking's `checkout` equals the next's `checkin` at the
same property. Flag it on `notify_caretaker` — that is the day JB has hours, not
a day, and it is the day things get missed.

## Bookings → thoughts

Here I want to push back on the shape rather than the goal.

A thought per raw booking means four properties' worth of near-identical rows —
call it 80–150 a year — each embedded, each competing in semantic search with
the notes you actually wrote. The catalog has 103 thoughts today. Adding that
volume of low-information rows makes it measurably worse at its main job.

So: **`bookings` is the record; `thoughts` is for what was worth remembering.**
Create a thought when there is something to say — guest notes, how the stay went,
damage, a repair needed, a review written — not when a date is booked.
`bookings.thought_id` links the two and a `list_bookings` tool returns stay
records directly, so nothing is lost for retrieval. If you would rather have one
thought per booking regardless, it is a one-line change in the sync; I just do
not think you will like the search results in a year.

## Property knowledge base

No new table: it is `thoughts`, filtered by topic. A note tagged `vrbo` and
`maple-st` is the house manual entry. Two things must happen:

1. **The controlled vocabulary needs the new topics** — `vrbo`, plus a slug per
   property. Note the warning already in `index.ts`: `PREFERRED_TOPICS` is a
   duplicate of `topics.txt` and the two drift silently. **Neither `topics.txt`
   nor `tidy-archive.py` is in this repository** — only the edge-function copy
   is. Before touching the vocabulary we should get the source file into the
   repo, or accept that the check that comment describes cannot be run.
2. **A retrieval tool that is property-shaped.** `get_property_context(slug)`
   returns the property row, its open bookings, JB's details, and its
   knowledge-base thoughts in one call.

## Guest message drafting

`draft_guest_message(booking_id, template_key)` assembles context — property,
dates, guest name, whether WhatsApp worked last time, the same-day-turnaround
flag, the relevant template row, and the property's knowledge-base thoughts —
and returns a draft.

Two hard limits:

- **It drafts. It does not send.** No Vrbo messaging, no email, no WhatsApp
  automation, no auto-reply. Anything outward-facing stays a human keystroke.
  This is not timidity: see the compliance section, where an automated message
  containing the wrong thing costs you a listing.
- **It refuses to invent.** If `guest_name` is null it says so rather than
  opening "Hi there" over a stay it knows nothing about.

## Feeding thewishingstream.com

This is the goal with a hard external constraint, so here is the constraint
before the design.

**Vrbo's Off-Platform Booking Policy explicitly prohibits** sending messages that
offer alternative booking methods such as a personal website, and including
links, QR codes, buttons, or contact details intended to redirect guests away
from Vrbo. Enforcement is not theoretical: Vrbo states it may suspend or
terminate accounts, and may charge or withhold amounts equal to the fees the
booking would have earned. Repeat violations can suspend the listing. Their
messaging is monitored, and pre-booking contact details are the specific thing
it is monitored for.

With four listings on one platform, a suspension is not a setback, it is the
business. So the design does not put your URL anywhere Vrbo is looking, and it
does not treat this as a rule to be clever about.

What is left is still substantial, because the restriction is about **Vrbo's
channel and Vrbo's booking**, not about the rest of your life:

1. **Physical touchpoints inside the property.** The welcome book, a card by the
   kettle, the wifi card, a fridge magnet. Not on Vrbo's channel, seen by every
   guest, and the highest-converting placement you have. This costs a print run
   and no engineering, and it is genuinely the best answer to goal 5.
2. **Your own channel, after you legitimately hold their details.** Once a
   booking is confirmed Vrbo gives you the guest's contact details, and you
   already email and WhatsApp them. That is your channel, not Vrbo's message
   thread. It is where a "we're direct at thewishingstream.com next time" line
   can sit — with the caveat that this is *lower* risk, not *no* risk, and it is
   your call where on that line to sit. The safest version is post-stay, after
   the Vrbo booking is complete, not during.
3. **The review request is the natural carrier.** It goes out after checkout,
   through your own email, to someone who has just had a good stay.

The system's job is to make that repeatable and measurable, not to send it:

- Templates carry **UTM-tagged links** so your site analytics tells you which
  message actually drove a visit —
  `https://thewishingstream.com/?utm_source=guest&utm_medium=whatsapp&utm_campaign=goodbye`.
  Without this you will have no idea whether any of it works.
- `guests.marketing_consent` gates anything that is marketing rather than
  service. **UK GDPR applies** — the properties look UK-based and the default
  timezone says so. Service messages about a stay they booked need no consent;
  "come back and book direct" is marketing and does. The soft opt-in for
  existing customers is usually workable, but it needs an unsubscribe route and
  a record of when and how they agreed, which is what `consent_source` and
  `consent_at` are for. Getting this shape right now costs nothing; retrofitting
  consent onto a year of guest records is genuinely unpleasant.
- A `repeat_guest` flag on the booking, since somebody on their third stay is a
  different conversation from a first-timer.

**Not designed, deliberately:** bulk email sending, a mailing list, or any
automated outreach. Those need a sending platform, deliverability, and an
unsubscribe mechanism, and they are a separate project from this one. This design
gets the data and the consent right so that project is possible later.

## Privacy and retention

Guest PII now enters the system by design rather than by accident, so:

- Contact details are needed while a stay is live and for a while after. They
  are not needed forever. A retention rule — null `email`/`phone` N months after
  the last stay, keeping the guest row, the bookings and any thought — is a
  ten-line scheduled job **if the columns are designed for it now**.
- Under UK GDPR a guest can ask what you hold and ask you to delete it. With
  `guests` as a single row per person that is one query and one update. Spread
  across bookings it is a fishing expedition. This is a second, quieter reason
  the `guests` table exists.

## Failure modes

| Failure | Result if unhandled | Handling |
| --- | --- | --- |
| Feed 404s / token rotated | Every future booking looks cancelled | Only reconcile after a clean 200 with ≥1 event; surface `last_error` |
| Empty but valid calendar | Same | Treated as failure, never as mass cancellation |
| UID re-issued | Duplicate booking, duplicate messages to a guest | Date-based fallback match |
| Two identical-date bookings | Wrong row updated | Refuse to guess; report ambiguity |
| `DTEND` read as inclusive | Every clean and goodbye a day early, forever | Parser tests with known fixtures |
| Sync runs twice concurrently | Duplicate tasks | `booking_tasks` PK collides; sync takes an advisory lock |
| Timezone drift | Tasks on the wrong day | Dates resolved in the property's timezone |
| iCal URL leaked | Booking calendar readable by anyone | Never client-side, never logged, masked in tool output |
| Template duplicates a Vrbo message | Guest gets it twice; you stop trusting the list | Per-property `message_settings`, defaulting to off |
| Site URL reaches a Vrbo message | Listing suspension, withheld fees | Drafting never sends; URLs live only in your own channels |

## Testing

`ical.ts` is pure, so it is tested the way `tasks.ts` is — a Deno test run from
the deploy workflow, before anything reaches the live server. Fixtures should
include a real folded-line export, an all-day `DTEND`, a tentative event, an
owner block, a re-issued UID, and an empty calendar. Task generation gets the
same treatment: caretaker-month resolution and the same-day-turnaround flag are
pure functions over a booking list. The GUI side follows
`tests/task_view_test.js`: drive the real page against a stubbed MCP server.

The recurrence test is already wired into `deploy-edge-function.yml`; these join
it in the same step.

## Build order

Each slice is independently useful and independently abandonable.

1. **Schema + parser.** The tables, `ical.ts`, and its tests. No sync yet.
2. **Sync.** `sync_vrbo_feeds`, conditional GET, identity matching, cancellation
   reconciliation, sync report. Run it by hand against all four feeds and read
   the report before automating anything.
3. **Enrichment.** `enrich_booking` — guest name, email, phone, party size — plus
   guest matching. Deliberately before tasks: a welcome email task with no guest
   name attached to it is not usable, so there is no point generating one.
4. **Tasks.** `booking_tasks`, the five templates, per-property settings agreed
   with you first, date-change and cancellation handling, same-day-turnaround.
5. **Schedule.** The GitHub Actions cron.
6. **Property context + drafting.** `get_property_context`,
   `draft_guest_message`, `message_templates` seeded with your actual wording,
   vocabulary additions, and a property/booking view in the catalog.
7. **The site funnel.** UTM tagging, consent capture, `repeat_guest`.

Slices 1–5 are the part that pays for itself in saved coordination. 6–7 are
worth doing once you have run 1–5 over a few real bookings and know what you
reach for.

## Open questions

1. **Does thewishingstream.com take bookings yet, or is it a brochure site?**
   Changes the call to action in the templates, and whether "book direct" is
   even truthful yet. Does not change the schema, which is why it is not
   blocking slice 1.
2. **JB's coverage.** "JB does the clean and looks after the place in summer"
   reads either as *JB cleans all year and additionally caretakes in summer*, or
   *JB does both, only in summer*. Which is it, and who covers the other months?
   This is the one answer I need before slice 4.
3. **Which messages does Vrbo already send, per property?** Best done by
   forwarding me one of each, or just telling me which of the five to default
   off.
4. **Are the four properties all in one timezone?** Assumed `Europe/London`.
5. **Guest contact retention** — how long after the last stay should email and
   phone survive?
6. **Do you want a thought per booking anyway?** I argued against it above; your
   call, one line either way.
