# VRBO integration — design

Status: **proposal**. Nothing here is built yet. This document exists to be
disagreed with before any of it becomes a migration that has to be lived with.

## What this is for

Four things, in the order they earn their keep:

1. **Bookings become work.** A reservation is not interesting in itself; the
   turnover clean it implies is. Reservations arrive on their own and generate
   tasks in the table the catalog already has.
2. **Bookings become searchable.** A stay you can ask about later — who, when,
   what went wrong — living in `thoughts` alongside everything else.
3. **A per-property knowledge base.** House manual, boiler reset, wifi code,
   cleaner's number, which supplier does the linen. The things currently in
   your head or in a text thread.
4. **Guest message drafting.** Compose replies from 1–3 rather than from
   scratch.

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

So the four goals divide cleanly:

| Goal | Served by iCal alone? |
| --- | --- |
| Bookings → tasks | **Yes.** Dates are all a turnover schedule needs. |
| Bookings → thoughts | **Partly.** You get a record with no one in it. |
| Property knowledge base | **Yes** — it never depended on the feed. |
| Guest message drafting | **No.** Needs a name at minimum. |

The design below therefore treats the feed as the **skeleton** — every booking's
existence and dates — and defines one clear seam where **flesh** (guest identity,
money, notes) is attached from somewhere else. Today that somewhere else is you,
typing. Later it can be Gmail parsing, with no schema change. Goal 4 stays
designed but unbuildable until that seam has something in it; building the
skeleton first is what makes it cheap to finish later.

## Data model

Three new tables. They live in `public` alongside `thoughts` and `tasks`, with
the same posture: RLS on, service-role only, reached exclusively through the
edge function.

### `properties`

Not `vrbo_properties`. A property is a property; the channel it was booked
through is an attribute of the *booking*, not of the house. Naming it for Vrbo
means renaming it the day a listing also goes on Airbnb.

```
id           uuid pk
slug         text unique   -- 'maple-st'. Used verbatim as the task `project`
                           -- label and as a `thoughts` topic, so it is a
                           -- stable public identifier, not a display name.
name         text not null -- '12 Maple Street'
address      text
timezone     text not null default 'Europe/London'
active       boolean not null default true
notes        text
created_at   timestamptz
updated_at   timestamptz
```

`timezone` is not decoration. Check-in and check-out are calendar days in the
property's local time. A turnover due "Saturday" must not become Friday because
the sync ran on a server in another zone — the same reasoning that put the
UTC-only date arithmetic in `tasks.ts`.

### `property_feeds`

One row per iCal URL per property, so a second channel is a row rather than a
migration.

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

**The URL is a credential.** Vrbo's export URL embeds an unguessable token and
is not otherwise authenticated: anyone holding it can read your booked dates
forever. Consequences, all of which the implementation must honour:

- It never appears in `index.html`, in any client-side code, or in a log line.
- It is never returned in full by an MCP tool — tools return a masked form
  (`…/icalendar/9f3c…a71b.ics`).
- Storing it in a service-role-only table is acceptable given the existing
  posture. Supabase Vault is available if you want it out of table storage;
  I would not bother at one or two listings, and would at ten.

### `bookings`

```
id              uuid pk
property_id     uuid fk -> properties on delete cascade
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

-- Enrichment. None of this comes from iCal. All nullable, forever.
guest_name      text
guest_email     text
guest_phone     text
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

Indexes: `(property_id, checkin)` for the calendar view, a partial index on
`checkout` where `status in ('confirmed','tentative')` for "what turns over
next", and `(property_id, checkin, checkout)` to support the identity matching
below.

## Booking identity — the hard part

A sync that cannot tell "this is the booking I already have" from "this is a new
one" produces either duplicate turnovers or missed ones. The obvious key is the
`UID`, and **Vrbo does not document that its UIDs are stable.** I could not find
a guarantee either way, and channel-sync tools broadly treat re-issued UIDs as a
fact of life. So the design does not depend on it:

1. Match on `(property_id, channel, uid)`. Almost always hits.
2. Otherwise match on `(property_id, checkin, checkout)` among bookings not
   already cancelled. A hit means the same stay came back under a new UID:
   adopt the new `uid`, push the old one onto `previous_uids`, keep the row and
   therefore keep the tasks hanging off it.
3. Otherwise insert.

Ambiguity in step 2 — two non-cancelled bookings for the identical property and
dates — is not resolvable automatically and must not be guessed. Log it, leave
both rows untouched, and surface it in the sync report.

### Disappearance is not always cancellation

If an event vanishes from the feed, the booking was probably cancelled. But it
also vanishes when the fetch half-failed, when the token was rotated, when Vrbo
served a stale or empty calendar, or when the export's date window simply does
not reach that far. Marking bookings cancelled off a bad fetch silently drops
real turnovers, which is the worst failure this system can have.

Rules:

- Only reconcile disappearance after a fetch that returned **HTTP 200, parsed
  cleanly, and yielded at least one `VEVENT`**. An empty-but-valid calendar is
  treated as a failed sync, not as "everything was cancelled".
- Only consider bookings whose `checkout` is in the future. History is never
  retroactively cancelled.
- Cancellation sets `status = 'cancelled'` and `cancelled_at`. Rows are never
  deleted — same reasoning as the `dropped` task status: knowing a booking
  existed and went away is information.
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

`ical.ts` must handle:

- **Line unfolding.** RFC 5545 folds long lines at 75 octets with a CRLF and a
  leading space. Unfold before parsing or long `DESCRIPTION`s parse as garbage.
- **`DTEND` is exclusive for all-day events.** A stay of the 12th to the 19th is
  `DTSTART;VALUE=DATE:20260812` / `DTEND;VALUE=DATE:20260819`, and the guest
  leaves on the 19th. Checkout is `DTEND` as written — subtracting a day here is
  the single most common bug in this kind of integration, and it silently moves
  every turnover clean to the wrong day.
- **`DATE` vs `DATE-TIME` with `TZID`.** Vrbo exports all-day `DATE` values, but
  the parser should not fall over if given a timestamp; convert into the
  property's timezone and take the calendar date.
- **Status mapping.** `SUMMARY` containing "Reserved" → `confirmed`;
  "Tentative" → `tentative`; "Unavailable"/"Blocked" → `blocked` (an owner
  hold, which still implies no guest but usually no turnover either).
  Anything unrecognised → `confirmed` with the raw text preserved, because
  treating an unknown label as "no booking" risks missing a real stay.

### Scheduling

Vrbo regenerates its export roughly every 30 minutes, so polling faster than
hourly buys nothing. Two options:

- **GitHub Actions cron** (recommended to start). A scheduled workflow POSTs a
  `tools/call` for `sync_vrbo_feeds` at the MCP endpoint — exactly what the
  catalog's own front-end already does, so it needs no new server code path,
  just the existing `x-brain-key` as a repo secret. Caveats to accept knowingly:
  scheduled workflows on public repos are disabled after 60 days of repository
  inactivity, and cron firing can be delayed under load. Neither matters much
  for a three-hourly poll of a calendar that changes a few times a month.
- **`pg_cron` + `pg_net`.** Both extensions are available on your project but
  **not currently installed**. More reliable and independent of GitHub, at the
  cost of scheduling logic living somewhere the repo does not show you.

Start with Actions; move to `pg_cron` if you ever find a missed sync mattered.

Send `If-None-Match`/`If-Modified-Since` from the stored `etag`/`last_modified`
and treat `304` as a successful no-op — polite, and it makes the common case
almost free.

### Sync report

Every run returns, and records, a short human-readable summary: per feed, how
many events were seen, created, updated, cancelled, and skipped as ambiguous.
Silence is not evidence a sync worked.

## Bookings → tasks

A join table rather than new columns on `tasks`:

```
booking_tasks
  booking_id   uuid fk -> bookings on delete cascade
  template_key text          -- 'turnover' | 'welcome_message' | 'review_request'
  task_id      uuid fk -> tasks on delete cascade
  primary key (booking_id, template_key)
```

`tasks` stays generic. The primary key does the idempotency work: re-syncing the
same booking a hundred times cannot produce a second turnover, because the
second insert collides. This is the whole reason for the table.

Generated per confirmed booking, from a small declarative list of templates:

| key | title | due |
| --- | --- | --- |
| `turnover` | `Turnover clean — {property.name}` | checkout date |
| `welcome_message` | `Send check-in details — {property.name}` | checkin − 2 days |
| `review_request` | `Review the guest — {property.name}` | checkout + 1 day |

All get `project = property.slug` and `source = 'vrbo-sync'`, so they group with
everything else for that house and you can later tell which surface actually
generates your work.

Behaviour on change:

- **Dates move** → move the task's `due_date`, but only while it is still open.
  A completed turnover is a historical fact and is left alone.
- **Booking cancelled** → set open generated tasks to `dropped`, not deleted.
  The task table's own documentation makes this argument; it applies here.
- **Blocked/owner hold** → generate nothing. It is not a guest stay.
- **Tentative** → generate nothing by default. Inquiries expire far more often
  than they convert, and a task list that fills with work that never happens
  stops being read. Worth a per-property flag if your inquiries convert well.

One genuinely useful derived signal, cheap to compute here and painful to notice
by hand: **same-day turnarounds**, where one booking's `checkout` equals the
next's `checkin` at the same property. Flag them on the turnover task — that is
the day the clean has hours, not a day.

## Bookings → thoughts

Here I want to push back on the shape rather than the goal.

A thought per raw booking means 40 near-identical rows a year reading "Reserved,
12–19 August, no guest name" — each one embedded, each one competing in semantic
search with the notes you actually wrote. The catalog has 103 thoughts. Adding a
hundred low-information rows a year makes it measurably worse at its main job.

So: **`bookings` is the record; `thoughts` is for what was worth remembering.**
Create a thought when there is something to say, not when a date is booked:

- on enrichment, if you added guest notes,
- at checkout, if you record how the stay went, damage, or a repair needed,
- when a review is written.

`bookings.thought_id` links the two, and a `list_bookings` tool can return the
stay record directly, so nothing is lost for retrieval. If you would rather have
one thought per booking regardless, say so — it is a one-line change in the sync
and I will build it that way; I just do not think you will like the search
results in a year.

## Property knowledge base

This needs no new table: it is `thoughts`, filtered by topic. A note tagged
`vrbo` and `maple-st` is the house manual entry.

Two things must happen for that to work properly:

1. **The controlled vocabulary needs the new topics** — `vrbo`, plus a slug per
   property. Note the warning already sitting in `index.ts`: `PREFERRED_TOPICS`
   is a duplicate of `topics.txt`, and the two drift silently. **Neither
   `topics.txt` nor `tidy-archive.py` is in this repository** — only the
   edge-function copy is. Before touching the vocabulary we should get the
   source file into the repo, or accept that the check documented in that
   comment cannot actually be run.
2. **A retrieval tool that is property-shaped.** `get_property_context(slug)`
   returns the property row, its open bookings, and its knowledge-base thoughts
   in one call — so an assistant answering "what's the wifi at Maple St" makes
   one call rather than three and a guess.

## Guest message drafting

Blocked on enrichment, by construction: you cannot address a guest the feed
never named. Designed now so it is trivial later.

`draft_guest_message(booking_id, kind)` where `kind` is `check_in_details`,
`pre_arrival`, `mid_stay`, `checkout_reminder`, or `review_request`. It assembles
context and returns it — the property, the dates, the same-day-turnaround flag,
whatever enrichment exists, and the relevant knowledge-base thoughts — for the
model to draft from.

Two hard limits:

- **It drafts. It does not send.** No Vrbo messaging, no email, no auto-reply.
  Anything outward-facing stays a human keystroke.
- **It refuses to invent.** If `guest_name` is null the draft says so rather
  than inventing "Hi there" over a stay it knows nothing about.

## Privacy and retention

Guest PII only ever enters via enrichment, which means you choose what lands
there. Worth deciding up front, not after the first hundred stays:

- Keep `guest_email`/`guest_phone` at all, or only `guest_name`? The drafting
  tool needs a name; it does not need a phone number.
- A retention rule — null the contact fields N months after checkout, keeping
  the booking and any thought — is a ten-line scheduled job **if the columns are
  designed for it now**, which the nullable-forever shape above allows.

## Failure modes

| Failure | Result if unhandled | Handling |
| --- | --- | --- |
| Feed 404s / token rotated | Every future booking looks cancelled | Only reconcile after a clean 200 with ≥1 event; surface `last_error` |
| Empty but valid calendar | Same | Treated as failure, never as mass cancellation |
| UID re-issued | Duplicate booking, duplicate turnover | Date-based fallback match |
| Two identical-date bookings | Wrong row updated | Refuse to guess; report ambiguity |
| `DTEND` read as inclusive | Every turnover a day early, forever | Parser tests with known fixtures |
| Sync runs twice concurrently | Duplicate tasks | `booking_tasks` PK collides; sync takes an advisory lock |
| Timezone drift | Turnover on the wrong day | Dates resolved in the property's timezone |
| iCal URL leaked | Booking calendar readable by anyone | Never client-side, never logged, masked in tool output |

## Testing

`ical.ts` is pure, so it is tested the way `tasks.ts` is — a Deno test run from
the deploy workflow, before anything reaches the live server. Fixtures should
include a real folded-line export, an all-day `DTEND`, a tentative event, an
owner block, a re-issued UID, and an empty calendar. The GUI side follows
`tests/task_view_test.js`: drive the real page against a stubbed MCP server.

The recurrence test is already wired into `deploy-edge-function.yml`; the iCal
test joins it in the same step.

## Build order

Each slice is independently useful and independently abandonable.

1. **Schema + parser.** The three tables, `ical.ts`, and its tests. No sync yet.
2. **Sync.** `sync_vrbo_feeds` tool, conditional GET, identity matching,
   cancellation reconciliation, sync report. Run it by hand first and read the
   report before automating anything.
3. **Tasks.** `booking_tasks`, the templates, date-change and cancellation
   handling, same-day-turnaround flag.
4. **Schedule.** The GitHub Actions cron.
5. **Property context.** `get_property_context`, vocabulary additions, and a
   property/booking view in the catalog.
6. **Enrichment + drafting.** Manual enrichment tool, then `draft_guest_message`.
   Gmail parsing only if manual entry proves annoying enough to justify it.

Slices 1–4 are the part that pays for itself. 5–6 are worth doing only once
you have used 1–4 for a few real bookings and know what you actually reach for.

## Open questions

1. **How many properties, and do any also list on Airbnb?** The design assumes
   more than one is possible but the shape barely changes if it is exactly one
   forever.
2. **Do you want a thought per booking anyway?** I argued against it above.
   Your call — it is a one-line change.
3. **Should tentative bookings generate tasks?** Default is no.
4. **Which turnover templates do you actually want?** The three above are a
   guess at your workflow, not a survey of it.
5. **Who does the clean?** If it is a third party, the turnover task probably
   wants to become a "confirm cleaner" task with a lead time, which is a
   different template and a different due date.
6. **Guest contact retention** — name only, or contact details too?
