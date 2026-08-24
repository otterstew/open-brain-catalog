# Sponsor approach: the AI / Copilot owner

Cold approach, **demo-first**. Two pieces: an email that asks for permission
rather than resources, and a two-page note attached to it. Placeholders in
`[brackets]`.

The ask is deliberately not a pilot. It is permission to build the thing for
one person — me — in the tenant, and twenty minutes to show it working. The
pilot proposal in `organisational-case.md` becomes phase two, put forward only
once there is something to look at.

---

## Read this before you send it

The sponsor owns AI. That single fact should change how the argument is put,
because the version written for a neutral sponsor is actively risky here.

**"Copilot underdelivers" is a criticism of their programme.** Said cold, by
someone they have never met, it reads as a complaint at best and a threat at
worst — and the reply, if it comes, will be defensive. Everything below is
written to avoid that.

The reframe that makes it safe, and actually makes it strong:

- **They are already being asked why Copilot has not landed.** Almost certainly,
  and probably by someone more senior than either of you. You are not bringing
  them a problem; you are bringing them an answer to a question they are already
  fielding. That is a gift, and it should feel like one.
- **Give them the diagnosis as theirs, not yours.** "You will know this better
  than I do" is not false modesty here — it is true, and it converts a lecture
  into a contribution. Never explain AI to the person who owns AI.
- **The constraint is the corpus, not the model.** This is the whole argument in
  six words, and it is a flattering frame: it says the technology choice was
  fine and the remaining work is content, which is fixable and cheap.
- **Nothing you are asking for is theirs to lose.** No new platform, no new
  supplier, no procurement, no architecture review. The lower the perceived
  governance burden, the likelier the reply.
- **Ask whether it duplicates something in flight, and mean it.** They may
  already have a knowledge initiative, or have tried one that failed. Offering
  to drop it costs you nothing, disarms the most likely objection, and makes a
  reply easier to write than silence.
- **Lead with the fact you have already built it.** Cold approaches from people
  with a working thing get read. Cold approaches with an idea get filed.

### Why the ask is permission, not resources

The earlier version of this asked for three to five days of a Power Platform
person's time. That is the right number — the build does not scale with
headcount, because it is one list, a handful of flows and one agent whether it
serves one person or twelve — but it is the wrong *ask*.

Three to five days of a specialist is somebody's headcount, a scheduling
conversation, and a named owner, requested cold, by a stranger, for something
unproven. Every one of those is a reason to say not now.

Permission to build it for yourself costs the sponsor nothing. No budget line,
no resource to find, no one else's calendar. It converts the whole conversation
from *fund my idea* to *look at this thing that works* — and the second one is
a different kind of meeting entirely.

It also gets the governance right way round. Building automation in a corporate
tenant without asking is precisely what IT means by shadow IT, and being the
person who asked first is worth more than the fortnight it might cost you.

The cost lands on you instead, and it is real: several evenings, and the first
flow will take longer than all the rest together while you learn the idioms.
That is the trade, and it is a good one.

One thing to leave out entirely: the comparison between what Microsoft can do
and what a purpose-built stack can do. It is the most interesting part of the
work and it is the wrong conversation for a first contact — it invites a debate
about tooling when the ask is twenty minutes.

---

## 1. The email

Around 220 words. Keep it near that length; a long cold email from a stranger does
not get read.

> **Subject:** A cheap way to improve what Copilot has to work with
>
> Hi [name],
>
> We have not met — I am [role] in [team].
>
> You will know this better than I do, but the thing that most limits what
> Copilot can answer for us is not the model, it is what is in the tenant. We
> have plenty of documents and almost no record of the reasoning behind them:
> why we chose a supplier, what was actually wrong with the last approach, which
> of four reports was the one worth reading. None of that is written down
> anywhere retrievable, so Copilot cannot cite it.
>
> I have been running a system that fixes this for myself for the past few
> months, on my own kit. Capture takes about ten seconds, a model does the
> tagging, and search across it genuinely works. I have mapped what it would
> take to rebuild in SharePoint, Power Automate and Copilot, and I would like to
> build that version — for myself, in my own time, as one user.
>
> I am not asking for budget or anyone's time. I am asking whether you are
> content for me to build it, and for twenty minutes to show you the result
> once it works. If it is any good we can talk about what a proper pilot would
> look like; if it is not, it cost nothing.
>
> Short note attached. And if you already have something in flight covering
> this, I would rather know and drop it.
>
> [your name]

**Notes on the wording, if you want to adjust it**

- *"You will know this better than I do"* is doing real work. Keep it.
- *"for myself"* matters — it says this is a habit you already have, not a
  project you want funded.
- **"I am not asking for budget or anyone's time"** is the most persuasive
  sentence in it. Do not bury it, and do not soften it into "minimal resource".
- *"on my own kit"* forestalls the obvious worry that you have already been
  building unapproved things in the tenant.
- Deliberately no cost figures anywhere. The moment a number appears, someone
  starts working out who approves it. The point is that there is nothing to
  approve.
- The last line is the one most likely to get a reply. People answer a question
  they can answer easily.
- If you have any connection at all — a shared project, someone in common, a
  talk of theirs you saw — put it in the second line and cut something else.

---

## 2. The note

Two pages. Written to be read without you in the room.

### Improving what Copilot has to retrieve

**A note for [name], [date]**

#### The observation

When Copilot disappoints, the reflex is to look at the model. Usually the
constraint is upstream of it: Copilot can only retrieve what has been written
down, and what has been written down here is artefacts — decks, reports,
spreadsheets, recordings — rather than reasoning.

Why we chose that supplier. What was actually wrong with the last approach.
Which of the four reports on a subject was worth reading. That layer exists, but
it exists in people's heads, in chat threads and in inboxes, so it is not
indexed and cannot be cited.

This is a corpus problem rather than a model problem, which is the good news: it
does not need a different platform, and it is unusually cheap to test.

#### The idea

A SharePoint list, a handful of Power Automate flows, and a Copilot agent
grounded on the list.

Capture takes under ten seconds — right-click a Teams message and choose Save,
or forward an email to a dedicated folder. There is no form and no decision
about where to file it. A model then writes the metadata itself: title, author,
source, date, and topics drawn from a shared vocabulary in the term store.
Nobody tags anything by hand. Retrieval is through Copilot, with citations,
inside Teams.

The idea is a habit. The AI is what makes the habit cheap enough to keep — it
removes the filing burden going in and the search burden coming out.

#### Why this one does not die

Every organisation has abandoned knowledge bases, so the fair question is what
is different. They die of three specific causes:

| Why they die | What happens here |
|---|---|
| Capture costs too much — a site, a space, a title, a parent page | A right-click. Under ten seconds, no form |
| Filing is a chore nobody sustains | The model writes the metadata on the way in |
| Retrieval means remembering it exists and going to look | Copilot surfaces it in the flow of work |

Two of those three only became solvable once there was a model in the tenant.

#### This is a port, not a concept

I have run the equivalent system personally for several months on a different
stack — automatic metadata extraction on capture, semantic search across the
collection, the lot. The capture habit, the tagging quality and the retrieval
behaviour are proven in daily use, including the parts that did not work and
were removed.

The Microsoft build has been mapped component by component against it. The
remaining unknown is not whether it can be built; it is whether the habit
spreads beyond one person, which is what a pilot answers.

#### What I am asking for

To build it for myself, as one user, in my own time — and twenty minutes to show
you the result. I already have the access this needs; what I do not have is
anyone senior knowing I am doing it, which is the part worth fixing before
rather than after.

| | |
|---|---|
| Your budget | none |
| Anyone else's time | none |
| New platforms, suppliers or licences | none |
| What I need | your knowing consent, and nothing else |

The build is a handful of Power Automate flows and one SharePoint list. It costs
me several evenings, which is my problem, not a line in anyone's plan.

#### What would come after, if it is any good

Only worth discussing once you have seen it, but so you know where this goes: a
pilot with one team of 8–12 for eight weeks, measured behaviourally rather than
as hours saved — are people still capturing unprompted in week 6 — with a
stopping condition agreed in advance, so the answer is allowed to be no. The
build does not grow with the headcount; the same list and flows serve twelve
people as easily as one. At full scale the arithmetic stays small: roughly 2.5
cents per capture, so a single capacity unit covers around 500 people capturing
five notes a week.

Worth flagging that seeded AI Builder credits are withdrawn on 1 November 2026,
with new capacity coming through Copilot Credits. Building now runs across that
change, which is an argument for starting on existing capacity rather than
against starting.

#### Two risks worth naming now

**Candour.** The most useful captures are the frank ones, and people will not
write those if everything is visible to everyone. Handled by design rather than
policy: three separate visibility levels — personal, team, and deliberately
published — with promotion between them always an explicit act, and participants
told plainly what is visible to whom and that content is discoverable.

**Ownership.** It sits in a Power Platform solution with a named owner and a
service account from the start, rather than becoming one person's personal
automation that breaks when they change role.

#### The ask, again, plainly

Your agreement that I may build it, and twenty minutes when it works. Nothing
else — no budget, no access request, no one else's time. If the demo is
unconvincing that is the end of it, and it will have cost the organisation
nothing at all.

---

## 3. If they say yes

Have this ready, because the first question after "go on then" is "what do you
actually need":

- A SharePoint site you own, with term store contributor rights
- Confirmation that AI Builder prompts are available to you, and roughly what
  capacity you may use
- Whether the HTTP connector is permitted by DLP — this decides whether the
  Retrieval API is available to you or you fall back to structured lookup
- A steer on whether anything you capture at work needs to stay off the tenant

Then build it, use it for a month, and come back with the demo and a month of
your own capture data. That conversation is the pilot proposal, and it will
almost write itself.

The build detail sits in `microsoft-365-equivalent.md`; the fuller argument,
including the organisation-wide case, in `organisational-case.md`. Neither
should go in the first email.
