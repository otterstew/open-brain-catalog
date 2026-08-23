# Build guide: the Microsoft version, for one user

Step by step, in an order where every step is testable before the next one
starts. Scoped to the **demo build** — one person, one site, no pilot ceremony.
Where something changes at pilot scale, it says so and moves on.

Assume several evenings. The first flow takes longer than all the others put
together, because that is where you learn the idioms.

UI labels drift between tenants and releases. Where a label here does not match
what you see, the action is described by what it does — find that.

---

## Part 0 — Pre-flight, before you build anything

Fifteen minutes, and it tells you whether the plan survives contact with your
tenant. Do it first: two of these can stop the build dead, and it is better to
know tonight than on evening three.

| Check | How | If no |
|---|---|---|
| Can I create a SharePoint site? | SharePoint start page → *Create site* | Ask for one site. This is the one thing you cannot work around. |
| Can I create flows? | make.powerautomate.com → *Create* | Ask for maker access to the default environment. Usually already granted. |
| Is the AI Builder prompt action available? | In a new flow, search actions for *Run a prompt* | Fall back: no automatic metadata. Still worth building — you type the title yourself. |
| Do I have AI Builder capacity? | AI Hub → build a prompt → *Test*. Testing is free and shows projected credits. | Ask for capacity, or check whether Power Automate Premium is assigned to you. |
| Is the HTTP connector permitted? | Add an *HTTP* action to a draft flow; DLP blocks show as a policy error on save | Skip the Retrieval API entirely. Structured lookup covers most of it. |
| Do I have a Copilot licence? | Does Copilot appear in Teams / M365 app launcher | You can still build capture and browse; the agent step waits. |

### What you actually need, in licensing terms

| Thing | Comes from | Notes |
|---|---|---|
| SharePoint list, Teams, Outlook, To Do | Any M365 business plan | Already yours |
| Power Automate, standard connectors | Included with M365 | SharePoint, Outlook, Teams, To Do are all standard |
| **Premium connectors** — HTTP, HTTP with Entra ID | Power Automate Premium, per user | Only needed for the Retrieval API. Skip for the demo. |
| **AI Builder prompts** | Seeded credits with Premium, or an add-on, or pay-as-you-go | Seeded credits are withdrawn 1 November 2026 |
| **Copilot agent over the list** | Microsoft 365 Copilot licence, or pay-as-you-go Copilot Credits | The retrieval half of the demo |
| **Retrieval API** | No extra cost with a Copilot licence | Also needs the premium HTTP connector, and likely an app registration with admin consent |

### Permissions to ask for, named precisely

Ask for these together, once. Asking four times over three weeks is what makes
people say no.

- **Site owner** on one new SharePoint site. Not contributor — you need to add
  columns and index them.
- **Maker** in the default Power Platform environment.
- **AI Builder capacity**, or confirmation of what you may consume.
- **Term store contributor**, on one term group — *only* if you want managed
  metadata. Skip it for the demo; see step 1.

Deliberately not asked for yet: app registration, admin consent, Copilot Studio,
a service account. All of those are pilot-phase, and each one is a conversation.

---

## Part 1 — The store

### Step 1.1 · Create the site

SharePoint start page → *Create site* → **Communication site**. Not a Team site:
that creates a Microsoft 365 group, a mailbox and a Teams team you do not want,
and it entangles the lifetime of your archive with a group someone may later
tidy up. Name it something boring and durable.

### Step 1.2 · Create the list, and mind the internal names

Create a list called `Notes`. Then add columns.

**The trap that costs an hour if you miss it:** SharePoint derives a column's
*internal* name from the display name at the moment of creation, and never
changes it afterwards. Create a column called "Note Type" and its internal name
is `Note_x0020_Type` forever — which is what you will be typing into every flow
expression and every filter query. So: **create each column with a single
run-together word, then rename the display name afterwards.**

| Create as | Rename to | Type |
|---|---|---|
| `Title` | Title | Single line (exists already) |
| `Body` | Body | Multiple lines, **plain text** |
| `NoteType` | Type | Choice: observation, task, idea, reference, person_note |
| `Topics` | Topics | Single line of text — see below |
| `People` | People | Single line of text |
| `Author` | Author | Single line |
| `SourceName` | Source | Single line |
| `SourceUrl` | Link | Hyperlink |
| `PublishedDate` | Published | Date only |
| `CapturedVia` | Captured via | Choice: outlook, teams, mobile, manual |

**Topics as plain text, not managed metadata, for the demo.** Managed metadata
writes from a flow want a label *and* a term GUID, and multi-value writes
usually need a raw HTTP call to SharePoint — which is a premium connector and
possibly blocked. Store `Topics` as a semicolon-joined string now. You lose
synonym folding; you keep your evenings. Converting later is a one-off script
over a few hundred rows.

**People as text, not the Person type.** The Person column only resolves people
in your directory. Half of what you capture is about authors and outsiders who
are not in it, and a flow writing an unresolvable name to a Person column fails
the whole run.

### Step 1.3 · Index the columns

List settings → Indexed columns. Add `NoteType`, `Topics`, `People`,
`CapturedVia`, `PublishedDate`.

At demo scale this changes nothing. Do it anyway — above 5,000 items a view
whose filter touches an unindexed column stops working, and retrofitting an
index on a large list is a worse job than doing it now.

### Step 1.4 · Test it by hand

Add three items manually. Make one of them a real capture — paste in something
you actually read this week. Build one grouped view (by Type) and one filtered
view. If this is not pleasant to look at now, no amount of automation later
fixes it.

---

## Part 2 — Enrichment

### Step 2.1 · Build the prompt in AI Hub first

Do this before any flow. Testing a prompt is free, and iterating inside a flow
is miserable by comparison.

AI Hub → Prompts → new custom prompt. Give it one input, the note text. Paste
in the extraction instructions — the prompt in `extractMetadata` transfers
almost verbatim, preferred-topics list included.

Then switch the output format from text to **JSON**, and give it an example of
the object you want:

```json
{
  "title": "A short descriptive title, under twelve words",
  "author": "Named author of an external piece, or null",
  "source_name": "Publication or channel, or null",
  "source_url": "URL if one is given, or null",
  "published_date": "2026-08-01",
  "people": ["Names discussed in the commentary"],
  "topics": ["One to three short tags"],
  "type": "observation"
}
```

Test it on five real captures of different shapes — a forwarded article, a
two-line thought, something with no external source. Check the projected credit
cost while you are there.

### Step 2.2 · Keep the vocabulary in the prompt for now

At pilot scale the topic list belongs in the term store, read at run time, so it
cannot drift. For one user, pasted into the prompt is fine — and it is the same
drift problem the current system already has, so you are no worse off.

---

## Part 3 — Capture

### Step 3.1 · Flow one: Outlook folder → Notes

This is the workhorse. Everything else is a variation on it.

1. In Outlook, create a folder called `Brain`. Add a rule: anything you forward
   to yourself with a subject starting `b:` moves there.
2. New automated cloud flow, trigger **When a new email arrives (V3)**. Set the
   folder to `Brain`. Turn on *Include Attachments* if you want the PDFs.
3. Add **Html to text** on the email body. The trigger gives you HTML; writing
   that raw into a plain-text column produces something unreadable, and embeds
   markup into whatever the model reads next.
4. Add **Run a prompt**, passing the converted text.
5. Add **Parse JSON** on the prompt output. Generate the schema from a sample of
   the output you got when testing — do not hand-write it.
6. Add **Create item** on the `Notes` list. Map:
   - `Title` ← the parsed title, with a fallback to the email subject. A blank
     Title on a SharePoint item is genuinely awful to work with, so use a
     `coalesce()` rather than trusting the model.
   - `Body` ← the converted text
   - `Topics` ← `join(body('Parse_JSON')?['topics'], '; ')`
   - `People` ← same join
   - `PublishedDate` ← `formatDateTime(...,'yyyy-MM-dd')`, and only if the model
     returned one. An empty string in a date column fails the action.
   - `CapturedVia` ← `outlook`
7. If you want attachments: **Add attachment** after Create item, inside an
   *Apply to each* over the email attachments. Create item cannot do it in one.

**Test it with the ugliest email you can find** — a newsletter with tables and
tracking pixels. Clean text is not the test.

### Step 3.2 · Flow two: save a Teams message

New **instant** flow, trigger **For a selected message** (Teams). Same body
after that: prompt, parse, create item, `CapturedVia` = `teams`.

This gives you a right-click *Save to Brain* on any Teams message, and it is the
capture route most likely to become a habit, because it sits where the day
already happens.

### Step 3.3 · Mobile

Reuse flow two from the Teams mobile app, or make a manually-triggered flow with
a single text input and pin it in the Power Automate app. Do not build anything
new for this.

---

## Part 4 — Retrieval

### Step 4.1 · A Copilot agent grounded on the list

From the SharePoint site, create a Copilot agent and add the `Notes` list as a
knowledge source. Cap is 20,000 items in a single list, which you will not
trouble. Pin it in Teams.

Ask it the questions you actually have: what do I know about X, what did I
conclude about Y. This is the demo. If this step is unimpressive, the archive is
too thin rather than the machinery being wrong — capture for another fortnight
and try again.

### Step 4.2 · Structured lookup, which you should build regardless

For "what do I know about Sarah", a **Get items** action filtered on the
`People` column beats semantic search outright, because that is a join and not a
question. It is free, deterministic, needs no premium connector and no licence.

Build this before you consider the Retrieval API.

### Step 4.3 · The Retrieval API — later, and only if you need it

A Graph REST endpoint that queries the tenant semantic index and returns ranked
chunks with sources. It is the right tool for open-ended enrichment. It is also
a premium HTTP connector, an app registration and admin consent — three
conversations you deliberately avoided in Part 0.

Leave it. Revisit when you can say precisely what the structured lookup could
not answer.

---

## Part 5 — Only once the archive has earned it

In rough order of value, none of it needed for the demo:

- **Views and column formatting** — grouped by Type, colour-coded badges. A
  couple of hours, and it makes the thing look considered.
- **A `Tasks` list** with a lookup to `Notes`, and one scheduled flow at 6am
  that clears expired defer dates and resolves recurrence.
- **The Life Engine gate** — a plain no-AI flow every 30 minutes that checks the
  calendar and only calls a model when there is something to consider.
- **Managed metadata** for topics, once the vocabulary has stabilised.
- **A Power Apps canvas app**, if browsing in list views starts to annoy you.

---

## The traps, collected

Written in the same spirit as the Life Engine's rebuild notes — these are the
ones that cost time rather than the ones that look dangerous.

- **Internal column names are set at creation and never change.** Create
  run-together, rename after.
- **Html to text before anything reads the body.** Raw HTML poisons both the
  prompt and the column.
- **An empty string into a Date column fails the whole action.** Guard every
  optional date with a condition, not a hope.
- **Generate the Parse JSON schema from real sample output.** Hand-written
  schemas drift from what the model actually returns and fail at run time.
- **Never trust the model for Title alone.** Coalesce to the subject line.
- **Create item cannot add attachments.** Separate action, inside a loop.
- **Flows run in UTC.** Anything comparing to "today" needs converting, or your
  6am job fires at the wrong hour half the year.
- **Test with the worst input, not the best.** A newsletter, a two-word note, an
  email with no body at all.
- **Personally-owned flows break when you change role.** Fine for a demo, not
  fine the moment anyone else depends on it — that is when it moves into a
  solution with a second owner.
- **DLP failures show up at save time, not design time.** You can build an
  entire flow around a blocked connector before anything tells you.

---

## What "done" looks like

You can forward an article from your phone, and ninety seconds later it is in
the list with a title, a source, an author and two topics you did not type. You
can right-click a Teams message and save it. And you can ask Copilot what you
know about something and get an answer with citations pointing back at your own
notes.

That is the demo. It is about four evenings, and it costs the organisation
nothing but a SharePoint site.
