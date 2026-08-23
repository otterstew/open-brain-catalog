# Could the Life Engine be built with Microsoft functionality?

Mostly yes — and in several respects it would be better. The retrieval step is
closer than it first looks, one part genuinely does not port, and one property
of the current design quietly becomes expensive.

Companion to `microsoft-365-equivalent.md`, which covers the archive. This covers
the heartbeat.

---

## What the Life Engine actually is

Six parts, from the note describing the working system:

1. **A scheduler** — launchd, every 30 minutes plus one at login.
2. **A session that exercises judgement** — reads the situation and decides
   whether anything needs saying. Most cycles decide no.
3. **External pull** — calendar events, Apple Reminders. *What is happening.*
4. **Internal enrich** — searches Open Brain for context on whoever and whatever
   turned up. *So what.*
5. **Two-way Telegram** — messages out; messages in are answered and filed as
   thoughts.
6. **State** — five tables, so nothing is sent twice, plus a weekly review in
   which it proposes one change to itself.

Parts 1, 3, 5 and 6 port cleanly or better. Part 4 is the loss. Part 2 depends
entirely on which of two architectures you pick.

---

## The mapping

| Life Engine | Microsoft | Verdict |
|---|---|---|
| launchd, every 30 min | Power Automate recurrence, or a Copilot Studio workflow with a recurrence trigger | **Better** — cloud-hosted, so no sleeping Mac and no "fires once on wake" |
| A session that decides | AI Builder `Run a prompt`, or a Copilot Studio agent as a step in the workflow | Depends — see below |
| Calendar (via the Mac) | Office 365 Outlook connector, *Get calendar events* | **Better** — a first-class API, no Automation permission to grant |
| Apple Reminders, read-only, unreadable under launchd | Microsoft To Do or Planner | **Better** — readable *and writable*, which removes a stated limitation |
| Search Open Brain for context | The Copilot Retrieval API, called over HTTP | Close, with conditions |
| Telegram out | Teams DM from the Flow bot | Even — and it lands on a phone you already carry |
| Telegram in | A Copilot Studio agent in Teams | **Better** — replies immediately rather than on the next tick |
| Bot token, one poller only | No token, no polling | **Better** — the three silently-swallowed messages cannot happen |
| `life_engine_*` tables | A SharePoint list | Even |
| Weekly self-modification | Not really possible | **Worse** — degrade to a proposal you approve |

---

## Two architectures, and they are not close

### A. Power Automate only

A recurrence flow every 30 minutes: pull calendar and tasks, assemble the
situation into text, hand it to `Run a prompt`, and post to Teams if the model
says something is worth saying.

This works, and with the Retrieval API in front of the prompt it covers more
than it looks. Its limit is that the model gets **one shot**: you assemble the
context up front, ask once, and take what comes back. It cannot decide halfway
through that it should go and look something up. The Life Engine's session can.

### B. A Copilot Studio agent inside a workflow

Autonomous triggering now lives in Workflows — you build a workflow with a
recurrence trigger and place the agent as a step inside it, rather than putting
triggers in the agent editor. The agent has knowledge sources, actions it can
call, and persistent memory across interactions.

This is a genuine equivalent of part 2: an agent that can look at the situation,
go and retrieve something, decide, and act. It is also the only version that
does two-way conversation properly, because a Copilot Studio agent in Teams
answers immediately instead of on the next tick.

It costs money in a way A does not. See below.

---

## Retrieval: closer than it looks, with conditions

The obvious worry is that step 4 — the *so what* — has no equivalent, because
Copilot is a chat surface rather than something a flow can query. That was true
until recently and is not any more.

**The Microsoft 365 Copilot Retrieval API** is a Graph REST endpoint that queries
the tenant's semantic index directly and returns ranked, chunked extracts with
their source references. A Power Automate flow can call it with an HTTP action.
That is a real equivalent of the enrich step, and it means architecture A is
much less compromised than it first appears.

Three conditions attach to it, and they are the things to check before designing
around it:

- **Licensing.** No extra cost with a Microsoft 365 Copilot licence. Without
  one, it is available pay-as-you-go for tenant sources such as SharePoint.
- **The HTTP action is a premium connector**, so DLP policy may block it. This
  is the single most likely thing to stop it working, and it is a policy
  question rather than a technical one.
- **It is retrieval, not judgement.** It hands back relevant chunks; deciding
  what matters is still a separate model call.

Even with the API available, the cheap structured path is worth keeping for
meeting prep specifically. "Who is in this meeting and what do I know about
them" is a **lookup by name**, not a semantic question — filtering the Notes
list on the `People` column returns exactly the right notes, deterministically,
for free. Use the Retrieval API for the open-ended half, and a list filter for
the part that is really a join.

## What genuinely does not port

The weekly self-modification. A flow cannot safely rewrite its own prompt and an
agent cannot edit itself. The honest degradation is a monthly message that
reviews which briefings got a response and proposes one change for you to make
by hand — which is arguably what should have been happening anyway.

Beyond that, in architecture A the model still gets **one shot**: you assemble
context, ask once, and take what comes back. Retrieval before the call is not
the same as a session that can decide halfway through to go and look something
up. Architecture B recovers that.

## The cost trap, and the design that avoids it

The Life Engine's best property is that **most cycles are silent**. On a Mac,
silence is free. In Microsoft it is not:

> Event trigger activity counts toward consumption. A message includes payloads
> sent to agents from event triggers.

So a 30-minute tick is roughly **1,440 billable events a month**, whether or not
the agent says anything. Copilot Studio capacity is sold in packs of 25,000
Copilot Credits at $200 a month, with pay-as-you-go also available — so a
constantly-waking agent is not free in the way the current one is.

The fix is to invert the design, and it is worth doing even in architecture A:

**Put a deterministic gate in front of the model.** A plain flow — no AI — wakes
every 30 minutes and asks cheap questions: is there an event starting in the next
45 minutes? Is anything overdue? Is it the first tick of the day? Has anything
arrived from me? If every answer is no, it exits without touching a model.

That collapses the model calls from 48 a day to maybe six or eight, cuts the
cost by most of an order of magnitude, and changes nothing about the behaviour —
because those silent ticks were always going to decide to say nothing. The
judgement that matters is *what* to say, not *whether* there is anything at all
to consider. The second question is answerable with a date comparison.

If you build only one thing from this document, build the gate.

---

## What I would actually build

Start with A plus the gate, and add B only where it earns its place.

1. **A gate flow**, every 30 minutes, no AI. Calendar and To Do lookups, plus a
   check on a SharePoint `sent` list so nothing goes twice. Exits silently on
   most ticks.
2. **A briefing flow** it calls when something is worth considering: pull the
   attendees, look each up by name in the Notes list, add a Retrieval API call
   for the open-ended context if DLP allows it, assemble, `Run a prompt`, post
   to Teams as a DM from the Flow bot.
3. **Capture in** via the Teams *Save to Brain* message action you would already
   have built for the archive — DM yourself a note, right-click, save. Not
   conversational, but it is the same capture, and it costs nothing extra.
4. **Only then**, if the one-shot prompt proves too blunt or you want real
   conversation, replace step 2 with a Copilot Studio agent in a workflow.

The order matters. Step 4 is where the licensing conversation lives, and you
will make a much better case for it having run steps 1–3 for a month and being
able to say exactly what the one-shot version could not do.

---

## The honest summary

The machinery ports. What you would end up with runs more reliably than the
current one — it does not sleep, it can write to the task list, it cannot lose
messages to a competing poller, and it replies instantly if you go as far as an
agent.

What you would lose is the ability to have it propose changes to itself, and —
in the cheap architecture — a session that can decide mid-thought to go and look
something else up. The enrichment itself survives, via the Retrieval API, so
long as DLP lets a flow make an HTTP call.

And the same caveat from the original note applies unchanged: whether it is
*worth* it depends on what is in the calendar and the archive. A cloud-hosted
version of a thing that mostly surfaces overdue reminders is still a thing that
mostly surfaces overdue reminders.
