# thewishingstream.com — build and visibility plan

Status: **proposal**. Companion to `vrbo-integration.md`, which owns the booking
data model and the availability architecture. This document owns the site, the
CRM, and getting found.

## Where this sits

The Vrbo design already establishes the thing this plan depends on: `bookings`
in Supabase is the single source of truth for availability across every channel,
and direct bookings are pushed back to Vrbo through an iCal feed Vrbo subscribes
to. **Nothing on this site can take a booking before that outbound feed is
working** (slice 8 there), or the two systems will sell the same week.

Decided so far: the site is on a **site builder**, and the first version is
**enquiry-first** — property pages, live availability, a request-to-book form
that lands in your task list, no card payments yet.

Enquiry-first is the right call for a reason beyond payments: request-to-book
removes the ~50-minute iCal sync window in which Vrbo and your site could sell
the same dates. You are not trading safety for simplicity here; you get both,
and you defer Stripe, refunds, and being the merchant of record until the
machinery has proven itself.

## Booking on a site builder

A site builder cannot run your server code, so the architecture is: **the
builder renders the pages, your own infrastructure serves the booking bits, and
the pages embed them.**

```
thewishingstream.com  (site builder: pages, copy, images, SEO)
        │
        ├─ <embed> availability calendar  ──► GET  /availability/:slug
        └─ <embed> request-to-book form   ──► POST /enquiries
                                               │
                                     open-brain-mcp edge function
                                               │
                                     bookings / enquiries / tasks
```

Both embeds are small self-contained HTML+JS widgets. They can be served as
static files from the same GitHub Pages setup that already serves the catalog —
no new hosting, no build step, consistent with how this project already works.

### Two new public routes

Both are unauthenticated, because a site visitor has no key. That makes them the
attack surface, so both are narrowly scoped:

**`GET /availability/:slug`** returns booked date ranges for one property and
nothing else — no guest names, no prices, no booking ids, no channel. It does
reveal how full you are, which is true of every booking site in existence and is
not worth defending against. Cache for a few minutes.

**`POST /enquiries`** creates an enquiry and the task that tells you to answer
it. This one takes untrusted input from the open internet, so:

- **Honeypot field** plus a minimum time-on-form — stops most bots for free.
- **Rate limit** per IP and per property.
- **Cloudflare Turnstile** if the honeypot proves insufficient. Do not start
  here; start simple and add it when spam actually arrives.
- **Validate hard**: dates must parse, checkout after checkin, party size within
  the property's capacity, message length capped. Reject rather than clean.
- **Never trust the price.** If the form ever shows a total, the server
  recalculates it. This matters more once payments exist, but the habit starts
  now.

An enquiry is **not** a booking and does not block the calendar. It becomes a
`pending` booking only when you accept it — which is the moment the exclusion
constraint from the Vrbo design starts protecting you.

### The plan-tier trap

Every major builder supports custom HTML embeds, but **usually only on paid
tiers** — Squarespace gates code blocks behind Business plan and above, Wix
needs the HTML embed element, WordPress depends on your host and theme. Worth
checking before designing around it, because "we can't embed custom code on this
plan" changes the answer to a linked page on your own domain instead of an
inline widget. That fallback works fine; it is just less seamless.

### Email

Request-to-book means two emails per enquiry: yours telling you it arrived, and
the guest's acknowledgement. Builder form-handlers will not do this, because the
form is not theirs. You need a sending service — Resend or Postmark are the
straightforward choices — plus SPF and DKIM on the domain or the acknowledgements
land in spam, which for a booking enquiry is the same as not sending them.

## The CRM

You asked to build this off the back of confirmed rentals, and that is exactly
the right place to build it from: those are people who have already paid you and
already enjoyed themselves.

The `guests` table in the Vrbo design is the core. Two tables turn a customer
list into something worth the name.

### `enquiries` — the top of the funnel

```
id            uuid pk
property_id   uuid fk -> properties
guest_id      uuid fk -> guests        -- null until matched or converted
checkin       date
checkout      date
party_size    int
message       text
status        text check in ('new','responded','converted','lost','spam')
source        text                     -- 'site' | 'email' | 'phone'
utm_source / utm_medium / utm_campaign text
booking_id    uuid fk -> bookings      -- set on conversion
responded_at  timestamptz
created_at / updated_at
```

**A CRM without lost enquiries is just a customer list.** The enquiries you
did not convert are the only data that tells you whether the site is working,
which properties are priced wrong, and which months need attention.

It also gives you the one number that matters most in direct booking:
**time-to-response**. Enquiry conversion falls off sharply with delay, and it is
the cheapest lever you have — no redesign, no ad spend, just answering faster.
`responded_at` minus `created_at`, tracked per property, tells you whether you
are actually doing it.

### `guest_interactions` — the history

```
id            uuid pk
guest_id      uuid fk -> guests on delete cascade
booking_id    uuid fk -> bookings
kind          text    -- 'welcome_email' | 'whatsapp' | 'goodbye' |
                      -- 'review_request' | 'enquiry' | 'outreach'
channel       text    -- 'email' | 'whatsapp' | 'sms' | 'phone' | 'in_person'
direction     text check in ('out','in')
template_key  text
utm_campaign  text
occurred_at   timestamptz not null
notes         text
```

Every message from the Vrbo design's five templates logs a row here. That gives
you, per guest: what they were sent, what they replied to, whether the outreach
worked. It is also what stops you sending a returning guest the same "come back
and book direct" message for the third time.

### Derived, not stored

Segments are a query, not a column, because a stored segment is wrong the moment
somebody books:

- **first_timer** — one confirmed booking
- **repeat** — two or more
- **lapsed** — last checkout more than 18 months ago, no future booking
- **direct** — has ever booked through the site rather than Vrbo

`repeat` and `lapsed` are the two that earn money. A lapsed guest who had a good
stay is the warmest possible audience for a direct booking, and they cost
nothing to reach.

### What this is not

Not a mailing list platform, not bulk sending, not marketing automation. Those
need deliverability management and an unsubscribe mechanism, and they are a
separate project. This gets the data and the consent right so that project is
possible. Consent capture belongs **in the enquiry form from day one** — a
checkbox, unticked, with its own wording — because direct enquiries are the
cleanest lawful basis you will ever have and retrofitting consent onto a year of
records is genuinely unpleasant.

## Getting found

### A correction first

I told you earlier that a Google Business Profile per property was probably your
highest-return single action. **That was wrong, and it changes what you should
do.** Google's business eligibility guidelines specifically list rental
properties such as vacation homes among the categories that are **not eligible**
for a Business Profile. Individual holiday cottages do not get one.

What is available instead:

- **A Business Profile for The Wishing Stream as a business**, if it operates as
  a real letting/management business with a genuine address. One profile for the
  business, not one per cottage.
- **Google Vacation Rentals**, which is the actual holiday-let channel and is
  separate from Business Profile. Its entry requirement is being a registered
  property-management business with a **direct-booking website**, or being on a
  booking site already integrated with it.

That second point is the strategically interesting one: **the site you are
building is the thing that unlocks that channel.** Be aware that in practice
most independent owners reach Google Vacation Rentals through a connectivity
partner or property-management system rather than integrating directly, so treat
it as a goal with a dependency rather than a switch to flip. It is worth
confirming the current route before building anything for it.

### SEO foundations

The unglamorous work, in the order it pays:

1. **Write fresh property copy. Do not reuse your Vrbo descriptions.** This is
   the single most common own-goal in this business. Duplicate text across your
   site and your Vrbo listing puts you in a contest with a domain that has
   vastly more authority than yours, and you lose it. Same properties, same
   facts, different words.
2. **One page per property**, each with a unique title and meta description,
   a single `<h1>`, and real prose rather than a facilities list.
3. **Structured data.** `VacationRental` markup on property pages, with
   `LodgingBusiness` on the site. This is what lets Google show details richly
   rather than as a blue link. One caution: do **not** mark up your Vrbo review
   scores as your own `AggregateRating` — review markup has to reflect reviews
   genuinely collected on your site, and misusing it risks a manual penalty.
4. **Sitemap and robots.txt** — most builders generate these; verify rather than
   assume, and submit the sitemap in Search Console.
5. **Search Console and Analytics from day one.** Not because you will look at
   them next week, but because they only start collecting from the day you set
   them up, and in six months you will want the history.
6. **Images.** On a builder, page speed is mostly out of your hands — image
   weight is the exception and it is usually the whole problem. Correct
   dimensions, modern formats, descriptive alt text that helps image search.
7. **Internal linking** from area guides into property pages, which is what
   makes the content below convert rather than just attract.

### Content, and the only strategy that works at your size

You cannot outrank Vrbo for "cottage in {your area}". They have thousands of
times your domain authority and they are not going away. Competing there is
setting money on fire.

You can comfortably outrank them for the long tail, because Vrbo's pages are
templated and yours can be specific:

- **"dog friendly cottage with a woodburner near {river}"** — the specific
  combinations real guests search, which no templated listing page targets well.
- **Area guides**: things to do, where to eat, best walks, what to do when it
  rains, which beach is good at low tide. This is top-of-funnel traffic from
  people who have chosen the *place* but not the *property*, and it is the
  traffic Vrbo never competes for because it is not a directory of cottages.
- **Seasonal pages** for the weeks you struggle to fill, written months ahead.

Area guides are also the content you are uniquely positioned to write, because
you actually know the area. Generic AI-written area copy is abundant and ranks
badly; a page that knows which pub does a proper Sunday roast does not.

### The guest-to-direct funnel

Designed in `vrbo-integration.md`. The short version: your site URL never goes
in a Vrbo message, because Vrbo's Off-Platform Booking Policy prohibits it and
enforces with suspension and withheld fees. It goes in the physical welcome book
and on your own email and WhatsApp after checkout, UTM-tagged so you can see
what converts. These are your warmest and cheapest visitors, and with the
`enquiries` table above you will finally be able to prove whether it works.

## Sequence

1. **Confirm the builder and plan tier.** Determines embed versus linked page.
2. **Property pages with fresh copy** and structured data. Ships value on day
   one, with no backend at all.
3. **Search Console, Analytics, sitemap.** Cheap, and the clock starts now.
4. **Availability widget** — read-only, low risk, and genuinely useful even
   before enquiries work.
5. **Enquiries** — the endpoint, the form, spam protection, both emails,
   consent capture, and the task that lands in your list.
6. **The CRM tables** and the conversion/response-time reporting.
7. **Area guides**, ongoing.
8. **Payments**, only once enquiry volume makes the manual step annoying.

Steps 2–3 need nothing from the Vrbo work and can start immediately. Step 4
needs the bookings table; step 5 needs the outbound Vrbo feed before it can
accept anything.

## Open questions

1. **Which builder, and which plan tier?** Blocks the embed decision.
2. **Where are the properties?** I cannot write area content, long-tail
   keywords, or local strategy without knowing the area. This is the single
   biggest unblock for the content work.
3. **Is The Wishing Stream a registered business** with a genuine business
   address? Determines whether the business-level Google profile and the Google
   Vacation Rentals route are open to you at all.
4. **Do you have professional photography?** On a holiday-let site it outranks
   almost every other conversion factor, and no amount of copy compensates.
5. **What are your current direct enquiry volumes, if any?** Sets whether step 8
   is months or years away.
