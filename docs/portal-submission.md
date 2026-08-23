# AI ideas portal — submission pack

Field-ready copy for submitting the knowledge-capture idea through the new internal
AI ideas portal. The full argument lives in `organisational-case.md`; this is that
argument recut for a panel that is reading a queue of AI proposals and has no context
on this one.

Character counts are given for every block, including spaces, so you can pick the
version that fits the box.

---

## Framing, for an AI panel specifically

This matters more than any individual paragraph below. Get the frame right and the
copy almost does not matter; get it wrong and no amount of polish rescues it.

**Almost every other submission will propose adding an AI thing.** A chatbot, a
summariser, an assistant for some process. Yours proposes making the AI already bought
actually work. That is a rarer submission, it is cheaper than all of them, and it is
very likely a question the panel is already being asked from above. Lead with it.

**Name the diagnosis explicitly: the bottleneck is the corpus, not the model.** An AI
panel will recognise that framing immediately, and it reframes disappointing Copilot
results as a fixable content problem rather than a failed purchase — which is a much
more comfortable thing for the panel to be seen backing.

**Be clear about where the AI sits.** The idea is a habit; the AI is what makes the
habit cheap enough to keep, by removing the tagging burden going in and the search
burden coming out. Saying so protects you from the reasonable challenge that this is
just a SharePoint list with extra steps.

**The working prototype is your strongest asset — put it early.** An AI-literate panel
knows how many proposals in the queue have never been tested. Months of daily personal
use, with the failure modes already found and removed, is unusual and they will know it.

**Keep the stopping condition. Drop the rest of the hedging.** In the sponsor document a
whole section on what you would not claim reads as rigour. Here, next to submissions
promising transformation, too much self-limitation reads as a weak idea. Keep the week-6
stopping condition — it is genuinely differentiating — and compress the rest into the one
line about measuring behaviour rather than hours saved.

**Volunteer the failure mode nobody else will.** Metadata extraction sometimes gets
things wrong. Saying so, with the reason it is tolerable, buys more credibility with an
AI panel than any benefits paragraph, because they have heard the benefits already.

**A new portal is an advantage.** Early submissions set the standard for what a good one
looks like. A costed pilot with defined metrics and a stated kill criterion will stand
out in a queue of one-paragraph ideas, and may well be useful to the panel as an example.

---

## Title

**Option A — leads with the diagnosis, recommended** — 82 characters

```
Fixing the reason Copilot underdelivers: capture the reasoning, not just the files
```

**Option B — leads with the mechanism** — 72 characters

```
A ten-second capture habit that gives Copilot something worth retrieving
```

**Option C — if the portal rewards a hook** — 68 characters

```
The missing layer: why our AI can't answer the questions that matter
```

---

## One-line summary

**Short** — 134 characters

```
Copilot underdelivers because our tenant holds artefacts and no reasoning. A ten-second capture habit fixes the corpus, not the model.
```

**Longer, if the field allows** — 297 characters

```
Our Copilot results are limited by what is in the tenant, not by the model. A ten-second capture habit — a right-click in Teams, an email forwarded to a folder — turns what people read, decide and conclude into grounded, citable content, built entirely from SharePoint, Power Automate and Copilot.
```

---

## The problem

**Short** — 245 characters

```
Copilot retrieves what is written down. Our tenant is full of artefacts and nearly empty of reasoning, so it can answer what a document says but not why we decided anything. That is a corpus problem, not a model problem, and no upgrade fixes it.
```

**Fuller** — 988 characters

```
When Copilot underdelivers, the instinct is to assume the model is not good enough. That is rarely what is happening. Copilot can only retrieve what has been written down, and our tenant is full of artefacts — decks, reports, spreadsheets, meeting recordings — while being almost empty of reasoning.

Why we chose that supplier. What was actually wrong with the last approach. Which of the four reports on a subject was the one worth reading. That layer only ever exists in someone's head, a chat thread or an inbox, so it is not indexed and cannot be cited.

This is a corpus problem, not a model problem. No model upgrade and no better prompting fixes it, because the content does not exist. Meanwhile the cost is constant and invisible: colleagues are asked questions already answered, two people assess the same report a month apart without either writing it up, new starters spend weeks reconstructing context, and the reasoning behind a decision leaves when its author changes role.
```

---

## The idea

**Short** — 359 characters

```
A SharePoint list, a few Power Automate flows and a Copilot agent. Capture is a right-click on a Teams message or an email forwarded to a folder — under ten seconds, no form, no filing decision. A model fills in the title, source and topics automatically, so nobody tags anything by hand. Copilot then answers over the collection with citations, inside Teams.
```

**Fuller — includes the where-the-AI-sits paragraph** — 1035 characters

```
A SharePoint list, a handful of Power Automate flows, and a Copilot agent grounded on the list.

Capture takes under ten seconds: right-click a Teams message and choose Save, or forward an email to a dedicated folder. No form, and no decision about where it should be filed.

A model then reads what was captured and writes the metadata itself — title, author, source, date, and topics drawn from a shared vocabulary in the SharePoint term store. Nobody tags anything by hand, which is the step every previous knowledge base has died on.

Retrieval is through Copilot, grounded on that collection, answering with citations inside Teams where people already work. Nobody has to remember the site exists.

Note where the AI sits in this. It is not the feature — it is the thing that removes the filing burden on the way in and the search burden on the way out. The idea is a habit; AI is what makes the habit cheap enough to keep.

Built entirely from tools already licensed. No new platform, no new supplier, no data leaving the tenant.
```

---

## Why it will not die like previous knowledge bases

**For a 'why is this different' or 'what have we tried' field** — 638 characters

```
Every organisation has a graveyard of abandoned knowledge bases, so the fair question is why this one survives. They die of three specific causes, and this design removes each:

- Capture costs too much — a site, a space, a title, a parent page. Here it is a right-click, under ten seconds.
- Filing is a chore nobody sustains. Here a model writes the metadata automatically on the way in.
- Retrieval means remembering the thing exists and going to look. Here Copilot surfaces it in the flow of work.

Two of those three were only solvable once we had a model in the tenant. This idea is possible now in a way it was not three years ago.
```

---

## Prior art / has this been tried

*808 characters*

```
This is a port, not a concept. I have run the equivalent system personally for months on a different stack — automatic metadata extraction on capture, semantic search over the collection, the lot. The capture habit, the tagging quality and the retrieval behaviour are all proven in daily use, including the parts that did not work and were removed.

The Microsoft 365 build has already been mapped component by component against that working system, including an honest account of where the Microsoft version will be weaker: there is no tunable semantic search of our own, and retrieval quality will depend on Copilot's index rather than one we control.

The remaining unknown is not whether it can be built. It is whether the capture habit spreads beyond one person — which is precisely what a pilot is for.
```

---

## Benefits

*750 characters*

```
- "Who here has already looked into this?" becomes answerable. Today it is asked by posting in a channel and hoping.
- Decisions keep their reasoning attached, retrievable a year later when someone asks why we did it that way.
- New starters get the interpretive layer directly rather than reconstructing it by asking around.
- The same report stops being assessed twice by different people who never knew about each other.
- Every Copilot licence we already pay for gets more useful, because the constraint on Copilot's usefulness is what is in the corpus and this is the one kind of content the corpus lacks.

The last point is the one that generalises: any future AI initiative grounded on our own data inherits the same problem, and the same fix.
```

---

## What is needed

*250 characters*

```
Eight weeks, one team of 8 to 12 people, one SharePoint site, three to five days of Power Platform build time, and a named owner. AI processing for the entire pilot costs under $20 at list price.

The scarce resource is the build time, not the money.
```

---

## How we would know it worked

*547 characters*

```
Success is measured behaviourally rather than as hours saved, because no knowledge tool can evidence a productivity figure in eight weeks and a submission claiming one should not be believed:

- At least 60% of participants still capturing in week 6, unprompted.
- At least one retrieval per person per week.
- At least five logged instances of someone finding something they would otherwise have re-derived or re-asked.

And a stopping condition agreed before we start: if week 6 capture volume is below 30% of week 2, we stop and do not proceed.
```

---

## Risks

**Includes the AI-specific one, which is worth volunteering** — 1004 characters

```
The main risk is candour. The most useful captures are the frank ones, and people will not write those if everything is visible to everyone. It is handled by design rather than policy: three separate visibility levels — personal, team, and deliberately published — with promotion between them always an explicit act, and participants told plainly at the outset what is visible to whom and that content is discoverable.

Two smaller ones with known answers. Ownership sits in a Power Platform solution with a named owner and a service account from day one, rather than being one person's personal automation. And the platform's item ceilings are handled by giving each team its own list rather than building one large shared one.

The AI-specific risk worth naming: metadata extraction will occasionally mislabel something. It is checkable and correctable in the interface, and a wrong tag costs a retrieval, not a decision — but the pilot should track how often it happens rather than assume it does not.
```

---

## If the portal has only one free-text box

*1889 characters — the whole submission in one block.*

```
When Copilot underdelivers, the instinct is to blame the model. That is rarely what is happening. Copilot retrieves what has been written down, and our tenant is full of artefacts — decks, reports, recordings — and almost empty of reasoning. Why we chose that supplier, what was wrong with the last approach, which of four reports was worth reading: that layer lives in someone's head, a chat thread or an inbox, so it is never indexed and never cited. It is a corpus problem, not a model problem, and no upgrade fixes it.

The idea is a ten-second capture habit. Right-click a Teams message and choose Save, or forward an email to a folder — no form, no decision about where to file it. A model then writes the metadata itself, so nobody tags anything by hand; that is the step every previous knowledge base has died on. Copilot answers over the collection with citations, inside Teams. Built from SharePoint, Power Automate and Copilot: no new platform, no new supplier, no data leaving the tenant. AI is not the feature here — it is what removes the filing burden going in and the search burden coming out, which is what makes the habit cheap enough to keep.

The payoff: "who has already looked into this?" becomes answerable, decisions keep their reasoning, new starters get context rather than files, and the Copilot licences we already pay for get more useful.

This is a port, not a concept. I have run the equivalent system personally for months on another stack, so the design is proven in daily use and the Microsoft build is already mapped component by component.

The ask is eight weeks, one team of 8 to 12, three to five days of Power Platform build time and a named owner. AI processing for the whole pilot costs under $20. Success is whether people are still capturing unprompted at week 6, with a stopping condition agreed in advance: below 30% of week 2 volume, we stop.
```

---

## Attachments and categories

If attachments are allowed, attach the sponsor document (`organisational-case.md`),
not the build plan. The build detail is the wrong altitude for triage and reads as
over-engineering; the sponsor document is the right thing for whoever picks the idea
up once it passes.

For a category or tag field, the honest fits are knowledge management, productivity,
and getting more from existing Copilot licensing. Pick the last one if the portal
allows only one — it attaches the idea to a budget already under scrutiny, which is
the fastest route to someone caring.
