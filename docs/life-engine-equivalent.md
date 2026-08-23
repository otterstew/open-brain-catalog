# Could the Life Engine be built with Microsoft functionality?

Mostly yes — and in several respects it would be better. One part does not port,
and one property of the current design quietly becomes expensive.

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
| Search Open Brain for context | Nothing callable from a flow | **The gap** |
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

This works, and it needs nothing you do not already have. Its limit is that the
model gets **one shot**: you assemble the context up front, ask once, and take
what comes back. It cannot decide halfway through that it should go and look
something up. The Life Engine's session can.

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

## The one thing that does not port

**There is no way to call Copilot's semantic index from a flow.** Copilot is a
chat surface, not a retrieval API. So in architecture A, step 4 — the *so what* —
has no direct equivalent. That step is what makes the Life Engine more than a
calendar alert, so this matters.

The mitigation is better than it first looks. Meeting prep is mostly a **lookup
by name**, not a semantic question: who is in this meeting, what do I know about
them. If the archive has a `People` column, a flow can filter the Notes list on
that name and get exactly the right notes back, deterministically. Structured
lookup beats fuzzy search for this particular job.

What you lose is the open-ended half — "what is relevant to this meeting" as
opposed to "what do I know about Sarah". Architecture B recovers most of it,
because a Copilot Studio agent can be given the Notes list as a knowledge source
and asked the fuzzy question directly.

The other genuine loss is the weekly self-modification. A flow cannot safely
rewrite its own prompt, and an agent cannot edit itself. The honest degradation
is a monthly message that reviews which briefings got a response and proposes
one change for you to make by hand — which is arguably what should have been
happening anyway.

---

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
   attendees, look up each by name in the Notes list, assemble, `Run a prompt`,
   post to Teams as a DM from the Flow bot.
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

What you would lose is the open-ended enrichment, unless you pay for Copilot
Studio, and the ability to have it propose changes to itself.

And the same caveat from the original note applies unchanged: whether it is
*worth* it depends on what is in the calendar and the archive. A cloud-hosted
version of a thing that mostly surfaces overdue reminders is still a thing that
mostly surfaces overdue reminders.
