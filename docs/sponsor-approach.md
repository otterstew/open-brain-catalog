# Sponsor approach: the AI / Copilot owner

Cold approach. Two pieces: an email that does the persuading and asks for twenty
minutes, and a two-page note attached to it. Placeholders in `[brackets]`.

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
> months. Capture takes about ten seconds, a model does the tagging, and search
> across it genuinely works. I have since mapped what it would take to rebuild
> in SharePoint, Power Automate and Copilot: three to five days of build, and
> under $20 of AI processing for an eight-week pilot with one team.
>
> No new platform and no new supplier — it is a way to improve the input to
> something you already own.
>
> Could I have twenty minutes? Two-page note attached. And if you already have
> something in flight covering this, I would rather know and drop it.
>
> [your name]

**Notes on the wording, if you want to adjust it**

- *"You will know this better than I do"* is doing real work. Keep it.
- *"for myself"* matters — it says this is a habit you already have, not a
  project you want funded.
- *"under $20"* is the most persuasive number in the email. It should stay in
  the first half.
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

#### What a pilot would be

One team of 8–12 people, eight weeks. Success measured behaviourally rather than
as hours saved, because no knowledge tool can evidence a productivity figure in
eight weeks:

- At least 60% of participants still capturing in week 6, unprompted
- At least one retrieval per person per week
- At least five logged instances of someone finding something they would
  otherwise have re-derived or re-asked

And a stopping condition agreed before we start: **if week-6 capture volume is
below 30% of week-2, we stop.**

#### Cost and effort

| | |
|---|---|
| Build | 3–5 days of Power Platform time |
| Ongoing | ~0.1 FTE to own it |
| AI processing, whole pilot | under $20 at list price |
| New platforms, suppliers or licences | none |

At scale the arithmetic stays small: roughly 2.5 cents per capture, so a single
capacity unit covers around 500 people capturing five notes a week. Worth
noting that seeded AI Builder credits are withdrawn on 1 November 2026 and new
capacity comes through Copilot Credits — a pilot starting now runs across that
change, which is an argument for starting on existing capacity.

#### Two risks worth naming now

**Candour.** The most useful captures are the frank ones, and people will not
write those if everything is visible to everyone. Handled by design rather than
policy: three separate visibility levels — personal, team, and deliberately
published — with promotion between them always an explicit act, and participants
told plainly what is visible to whom and that content is discoverable.

**Ownership.** It sits in a Power Platform solution with a named owner and a
service account from the start, rather than becoming one person's personal
automation that breaks when they change role.

#### The ask

Eight weeks, one team, three to five days of build time, a named owner, and
existing capacity. In return, a measured answer to whether a ten-second capture
habit produces content that makes Copilot materially more useful — and a
stopping condition agreed in advance, so the answer is allowed to be no.

---

## 3. If they say yes

Worth having ready, because the first question after "interesting" is usually
"what do you need from me this week":

- A named Power Platform person for three to five days
- One team of 8–12 who will actually participate, chosen with their lead
- A SharePoint site, and term store contributor rights
- Confirmation of which side of the licensing line the agent falls on for this
  population — existing Copilot licences, or pay-as-you-go credits

The build detail sits in `microsoft-365-equivalent.md`; the fuller argument,
including the organisation-wide case, in `organisational-case.md`. Neither
should go in the first email.
