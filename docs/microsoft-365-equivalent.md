# Building an Open Brain equivalent inside Microsoft 365

What this repo does, what the Microsoft stack can do instead, where it is worse,
where it is genuinely better, and the order to build it in.

Written against what is available in a normal corporate tenant in August 2026:
SharePoint, Power Automate, Teams, Planner / To Do, Outlook, Microsoft 365
Copilot (with ChatGPT also permitted), Copilot Notebooks, OneNote.

---

## 1. What Open Brain actually is

Strip the code away and there are six parts. Every design decision below is
about which of the six survives the move.

| # | Part | How it works here |
|---|------|-------------------|
| 1 | **Store** | One Postgres table `thoughts` — `content` text, `metadata` jsonb, `embedding` vector, timestamps. One table `tasks` with real columns and constraints. |
| 2 | **Enrichment on capture** | A GPT-4o-mini call reads the raw text and returns JSON: title, author, source name, source URL, published date, people, topics (nudged toward a controlled vocabulary), type, action items. |
| 3 | **Retrieval** | Hybrid. Vector similarity via `match_thoughts`, *plus* a literal keyword pass across title/content/topics/people/author/source, because "what is this about" and "which notes contain this word" are different questions. |
| 4 | **A machine interface** | An MCP server over HTTPS, 18 tools, key-gated. Crucially it **reads and writes**: any AI client can capture a thought, create a task, link two notes. |
| 5 | **A human interface** | A static PWA: facet browse by topic/person/author/source, inline edit, PDF → markdown import, task view, linked-notes panel, stats. |
| 6 | **Ops** | GitHub Actions deploys the edge function; the page is static hosting on a custom domain. |

The thing that makes it feel like a brain rather than a folder is **4 combined
with 3**: you can ask a model a vague question, get semantically near notes back,
and then tell the same model to write something new into the store. Hold onto
that sentence — it is the part Microsoft makes hardest.

---

## 2. The mapping, component by component

| Open Brain | Microsoft equivalent | Verdict |
|---|---|---|
| `thoughts` table | A SharePoint **list** in a dedicated site | Even |
| `metadata` jsonb | Site columns + the **managed metadata term store** | **Better** — the term store does synonyms and aliases properly, which `topics.txt` and `NAME_ALIASES` fake by hand |
| `embedding` + `match_thoughts` | Copilot's semantic index, via an agent, a Notebook, or the Copilot Retrieval API | Worse, but not closed — the API returns ranked chunks; you just do not own the index |
| keyword fallback pass | SharePoint search + indexed list columns | Even |
| `capture_thought` + LLM extraction | Power Automate flow + AI Builder **Run a prompt** with JSON output | Even — this part works well |
| MCP tools (models can **write**) | Copilot cannot write. Only a Copilot Studio / declarative agent with a flow as an *action* can | **The core gap** |
| PWA front end | Power Apps canvas app, or SharePoint list views + JSON column formatting | Worse, but adequate |
| `tasks` table | Planner and To Do are both lossy — a second SharePoint list is faithful | Worse if you use Planner, even if you don't |
| `link_thoughts` | Multi-value Lookup column + a mirror flow | Worse — no automatic backlink |
| `MCP_ACCESS_KEY` | Entra ID, tenant permissions, DLP, retention | **Better** — no keys to manage, and the data is where compliance already lives |

---

## 3. The build, in the order that makes sense

### Phase 0 — Decide the store: one list, not a library

Use a **SharePoint list** called `Notes`, in its own site (not a Teams-attached
site — you want to control permissions and lifetime separately).

Why a list and not a document library of files: your captures are structured
records with facets you filter on constantly, which is what lists are for, and
Power Automate writes to list columns without ceremony. A "Multiple lines of
text" column holds about 64,000 characters of plain text, which covers all but
the longest article captures. Attach the original PDF to the item — attachments
get indexed too, so Copilot sees the source even when the body was truncated.

Columns, mapping directly off the current `metadata` shape:

| Column | Type | Notes |
|---|---|---|
| `Title` | Single line | The extractor's title, not a slice of the body |
| `Body` | Multiple lines (plain) | The captured text |
| `NoteType` | Choice | observation / task / idea / reference / person_note |
| `Topics` | **Managed metadata**, multi | Backed by a term set — this replaces `topics.txt` |
| `People` | Person, multi (or text) | Person type only if they're all colleagues |
| `Author` | Single line | External author of the referenced piece |
| `SourceName` | Single line | Publication / channel |
| `SourceUrl` | Hyperlink | |
| `PublishedDate` | Date | Original publish date, distinct from capture date |
| `CapturedVia` | Choice | outlook / teams / mobile / onenote / manual — tells you later which surfaces nobody uses |
| `RelatedNotes` | Lookup to `Notes`, multi | |

**Index every column you filter or sort on, on day one.** A list view stops
working above 5,000 items if the query touches an unindexed column, and you will
hit that quietly, months in.

### Phase 1 — Capture, from four places

One flow per entry point, all ending in the same "Create item" step. Build them
in a **solution** so they can be moved and co-owned rather than being personally
yours forever.

1. **Outlook.** An Outlook rule moves anything you forward to yourself with a
   subject prefix into a `Brain` folder; a flow triggers on new mail in that
   folder. This is your best capture path by a distance — it works from every
   device you own without installing anything.
2. **Teams.** "Create a flow from a message" gives you a right-click *Save to
   Brain* on any Teams message. This is genuinely better than anything here.
3. **Mobile.** A manually-triggered flow with a text input, pinned as a button
   in the Power Automate app.
4. **Web pages and PDFs.** The OneNote Web Clipper into a dedicated section,
   then a flow on new page in that section that promotes it into `Notes`. For
   PDFs, AI Builder's text extraction replaces the `pdf.js` import here — but it
   spends AI Builder credits, so check your tenant's capacity first.

### Phase 2 — Enrichment: the one piece that ports cleanly

Add an **AI Builder custom prompt** with its output format switched from text to
**JSON**, and paste in an example of the object you want. Then `Run a prompt` in
each capture flow, `Parse JSON`, and write the fields into the columns.

The prompt in `supabase/functions/open-brain-mcp/index.ts` (`extractMetadata`)
transfers almost verbatim, including the preferred-topics list. Keep the same
discipline it has: *a wrong tag from the list is the worst outcome of all.*

One change is worth making. Here the vocabulary is duplicated between
`topics.txt` and the edge function and silently drifts. In SharePoint, put the
vocabulary in the **term store**, have the flow read the term set, and inject it
into the prompt at run time. The drift problem disappears rather than being
managed.

Be aware that writing a managed metadata column from Power Automate is fiddly —
it wants `label` plus `termGuid`, and multi-value writes usually need *Send an
HTTP request to SharePoint* rather than the plain Create item action. If that
becomes a fight, use a plain text `Topics` column and keep the term set as the
reference list you validate against. You lose the synonym folding; you keep your
weekend.

### Phase 3 — Retrieval

Two surfaces, for two different questions.

**A Copilot agent grounded on the list** — built in Copilot's agent builder, with
the `Notes` list as its knowledge source. SharePoint lists became a supported
agent knowledge source in mid-2026, capped at **20,000 items in one list**. This
is your `search` and `fetch` tools. Pin it in Teams and it's a chat window you
can ask "what do I know about X" and get cited answers.

**A Copilot Notebook** for a specific piece of work — point it at the site, a
folder, and the OneNote section, and it grounds every answer on that set. Up to
300 files. This is the closest thing to sitting down with a subset of the
archive.

**The Copilot Retrieval API** is the third surface, and the one that matters if
you want retrieval inside an automation rather than a chat window. It is a Graph
REST endpoint that queries the tenant semantic index and hands back ranked,
chunked extracts with source references — callable from a flow via an HTTP
action. No extra cost with a Copilot licence, pay-as-you-go without one, and
subject to whatever DLP says about premium connectors.

What you still do not get: control of the index. No choice of embedding model,
no tunable threshold, no similarity scores to reason about, no "notes near this
note", and no hybrid vector-and-keyword blend of your own design. You get
somebody else's retrieval, and it is a black box. If owning that turns out to be
load-bearing, the honest answer is Azure AI Search plus Azure OpenAI embeddings —
a real subscription, a real cost centre, a real conversation with IT. Don't start
there. Find out first whether Copilot's index is good enough on your actual
notes.

Also: indexing is not instant. Capture-then-immediately-ask does not work the way
it does here. Expect minutes, sometimes longer.

### Phase 4 — Tasks

Read the comments at the top of `supabase/migrations/20260820000000_create_tasks.sql`
before choosing. They name exactly the fields shop-bought task apps skip:

- `defer_until` — Planner and To Do have no equivalent. Without it, every task
  you have ever had is in your face forever, and you stop opening the app.
- `dropped` as a status distinct from `done` — deciding not to do something is
  information.
- `recur` as a free-text phrase resolved on completion, and `recur_from` choosing
  between "due date" and "when I actually did it".
- `thought_id` — the link back to the note the task came out of, which is the
  whole reason the table lives next to the notes.

Planner keeps none of those four. So:

**Recommended:** a second SharePoint list, `Tasks`, with the same columns as the
table, and a Lookup to `Notes`. Views for Due, Deferred, Waiting, Someday. A
scheduled flow at 6am that resolves recurrence and clears expired defer dates —
the one bit of real logic, and it's a handful of actions.

**If mobile ticking-off matters more than fidelity:** one-way mirror the open
tasks into To Do or Planner and treat SharePoint as the system of record. Do not
build two-way sync. Two-way sync between two task systems is a permanent
maintenance tax and it always loses.

### Phase 5 — The interface

In ascending order of effort:

1. **SharePoint list views + JSON column formatting.** Grouped views by topic,
   filtered views for each facet, colour-coded type badges. This gets you
   surprisingly close to the chip row and facet panel for a couple of hours' work.
2. **A Power Apps canvas app** — list, detail, edit, capture, pinned as a
   personal app in Teams. This is the real equivalent of `index.html`. Canvas
   apps over SharePoint standard connectors are covered by your existing M365
   licence; only premium connectors or Dataverse cost extra.
3. **The Copilot agent as the front door**, and browse only when you need to.

Skip the graph view. It was built on `linked_thought_ids` and there is no
sensible way to draw it in SharePoint.

### Phase 6 — Linking notes

A multi-value Lookup column gets you links in one direction. `link_thoughts`
here is bidirectional, so add a flow on item-update that mirrors the link onto
the other item. Two cautions: a view can hold only about 12 lookup columns, and
multi-value lookups filter and group badly. If linking turns out to be something
you do constantly, this is the second-weakest part of the whole design.

---

## 4. The limitations, named

You said linking data up feels limited. It is, and it is worth being able to
name exactly why, so you design around the real constraints rather than fighting
imagined ones.

1. **Copilot reads; it does not write.** This is the big one. Every "save that to
   my brain" from a chat has to go through a Power Automate flow, exposed either
   as an agent action or as a button. The seamless loop you have — ask, then tell
   it to capture the answer — has to be rebuilt as two deliberate steps, or as a
   Copilot Studio agent with flow actions, which is its own licensing
   conversation.
2. **No vector search you own.** The Retrieval API will query the tenant index
   from a flow, but you choose neither the embedding model nor the ranking, and
   you get no scores or threshold to tune. Fine for grounding, not a substitute
   for a retrieval layer you can reason about.
3. **20,000 items** is the cap on a list used as agent knowledge, and it must be
   one list. **300 files** in a Notebook. **5,000 items** is where unindexed list
   views break.
4. **Managed metadata is hard to write** from flows, and it is exactly the column
   type you most want.
5. **Lookup columns have no automatic backlink**, and don't filter well.
6. **AI Builder consumes credits.** Check tenant capacity before designing
   around per-capture LLM calls.
7. **Premium connectors may be blocked by DLP policy** — HTTP, Azure OpenAI,
   Dataverse. Find out before you design on top of one.
8. **Personally-owned flows are a single point of failure.** Put them in a
   solution, give them a second owner or a service account.
9. **Indexing lag** between capture and retrievability.
10. **Agent licensing.** Agents grounded in tenant data need a Microsoft 365
    Copilot licence or pay-as-you-go Copilot Credits. Instruction-only or
    public-data agents are free. Confirm which side of that line you sit on
    before building.

---

## 5. What is actually better at work

Being fair about this matters, because two of these are things this repo cannot
have at all.

- **The term store** is a proper controlled vocabulary with synonyms and
  governance. It is the feature `topics.txt`, the duplicated `PREFERRED_TOPICS`
  array, and `NAME_ALIASES` are all crude imitations of.
- **Capture from Outlook and Teams** is native, permitted, and on every device
  already. No bookmarklet, no access key typed into a phone.
- **Identity, permissions, retention, DLP, eDiscovery** come free, and there is
  no API key to leak.
- **Your notes join a bigger corpus.** Copilot answers across the archive *and*
  your mail, chats, and documents together, with citations. Open Brain can only
  ever see what you fed it.

---

## 6. If you only do one thing

A SharePoint list, one capture flow from an Outlook folder, one AI Builder
prompt returning JSON, and one Copilot agent grounded on the list.

That is a weekend, it needs no licence you don't have, and it is about 70% of the
value. Everything above it — the canvas app, the task list, the linking, the
mirror flows — is polish you can add once you know which parts you actually use.

Build that first, capture into it for a month, then look at `CapturedVia` and see
which surfaces you really used. Same discipline as the `source` column here: it
exists to tell you later which things were built for nobody.

---

## 7. The list to take to IT

- Can I have a SharePoint site of my own, with term store contributor rights?
- What is our AI Builder credit capacity, and can I use `Run a prompt` in flows?
- Which Power Platform connectors does DLP block?
- Do I have a Microsoft 365 Copilot licence, or Copilot Chat with pay-as-you-go
  credits — and which do agents grounded on tenant data fall under for me?
- Can I create and publish a declarative agent, or does it need review?
- Is Copilot Studio available, and at what cost per message?
- What is the retention policy on a list like this, and can I exempt it?
