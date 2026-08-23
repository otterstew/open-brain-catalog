# The case for building this across the organisation

A companion to `microsoft-365-equivalent.md`. That document is *how*. This one
is *why anyone else should care*, and what to actually ask for.

Written for a sponsor — someone who can authorise a pilot and a few days of
Power Platform time. Section 7 is the annex for IT. If the real audience turns
out to be a platform team or a CIO, the argument holds but the emphasis moves.

---

## 1. The thesis

Most organisations now pay for Microsoft 365 Copilot and quietly find it
underwhelming. The usual explanation is that the model is not good enough. That
is rarely what is happening.

Copilot retrieves what is written down. A tenant is full of artefacts —
decks, reports, spreadsheets, meeting recordings — and almost entirely empty of
**reasoning**. Why we picked that vendor. What was actually wrong with the
Q2 approach. Which of the four reports on the subject was the one worth reading.
That layer lives in people's heads, in DMs, and in inboxes, and Copilot cannot
index a judgment nobody ever wrote down.

So the argument is not "let us build a knowledge base". It is:

> **A capture habit that costs ten seconds produces the one layer of content
> that Copilot is missing, and makes the licences we already pay for worth
> materially more.**

That framing matters because it attaches to a budget line that already exists
and is already under scrutiny, rather than asking for a new one.

---

## 2. Why this is not another wiki that dies

Every organisation has a graveyard of abandoned knowledge bases, and anyone
senior enough to approve this will have watched at least two of them die. The
argument fails unless it explains why this one is different. Wikis die of three
specific causes, and the design addresses each:

| Why wikis die | What happens here |
|---|---|
| **Capture costs too much.** Open a site, pick a space, write a title, choose a parent page. Five minutes and a decision about taxonomy. | Right-click a Teams message, or forward an email to a folder. Under ten seconds, no form, no filing decision. |
| **Filing is a chore nobody does.** Tags rot, categories drift, half the pages are uncategorised within a month. | A model writes the metadata on the way in — title, author, source, topics from a governed vocabulary. Nobody tags anything by hand. |
| **Retrieval means remembering it exists** and going somewhere to look. | Copilot answers over it in the flow of work, with citations. You never visit the site. |

That is the whole design argument in three rows. Every other feature is
secondary to keeping those three properties true.

---

## 3. What only works at organisational scale

A personal version of this is useful. Four things become possible only when
more than one person captures into it, and these are the actual case for
rolling it out rather than leaving it as one person's habit:

1. **Expertise location.** Once captures carry people and topics, "who here has
   already looked into X" becomes answerable. Today that question is asked by
   posting in a channel and hoping. This is the single highest-value query the
   system enables and it is impossible with one user.
2. **Decision provenance.** A decision recorded with its reasoning, its source
   material and its date, retrievable eighteen months later when someone asks
   why we did it that way. Currently this exists as a thread in someone's chat
   history, and it leaves when they do.
3. **Onboarding.** New starters currently get the artefacts and have to
   reconstruct the reasoning by asking around for six weeks. They would get the
   interpretive layer directly.
4. **Not re-doing research.** Two people reading the same report a month apart,
   both writing it up for nobody, is the normal case. Capture makes the second
   one a retrieval.

Point 1 is the one to lead with in a pitch. It is concrete, everyone recognises
the pain, and it is measurable.

---

## 4. What I would not claim

A business case is more credible for refusing to fake the parts that cannot be
evidenced, and a sponsor who has seen a few of these will be looking for the
overclaim.

- **No hours-saved ROI.** Anyone producing a productivity figure for a knowledge
  tool after eight weeks has invented it. The honest position is that the
  financial case only becomes arguable after roughly a year of accumulated
  content, and the pilot cannot prove it.
- **No claim that everyone will use it.** Capture habits are unevenly
  distributed. Realistically a minority capture heavily, a majority capture
  rarely, and everyone benefits from retrieval. That is a success, not a
  failure, and it should be said up front so that uneven adoption is not later
  read as the pilot failing.
- **No claim that it replaces anything.** It does not replace SharePoint, the
  intranet, OneNote or Viva. It is a different unit of content: a paragraph of
  judgment, not a file. If it is positioned as a replacement for a system
  someone owns, it acquires an enemy on day one for no benefit.

---

## 5. The risks, and what to do about them

### Candour, and the discoverability problem

The most valuable captures are the candid ones — this vendor was poor, that
approach failed, this report is thin. Put those in a tenant-indexed store that
Copilot surfaces to colleagues and two things happen: people either stop being
candid, or something embarrassing surfaces in front of the wrong person. It is
also all subject to eDiscovery.

This is the risk that quietly kills the pilot if it is not designed for, so
design for it explicitly. **Three visibility tiers, as three separate lists,
not item-level permissions:**

- **Personal** — only me. The default. Most captures live here.
- **Team** — my team's list, my team's agent.
- **Organisation** — deliberately published, and understood by the author to be
  published.

Item-level permissions in SharePoint are a performance and administration trap
at any real volume; separate lists are the correct topology. Promotion between
tiers should be a deliberate act, never automatic, and the interface should
make the current tier impossible to misread.

### Ownership

A personal flow that quietly becomes organisational infrastructure is the
classic shadow-IT failure. Everything goes in a Power Platform **solution**,
with a named owner and a service account, from the pilot onwards — not
retrofitted later when the original builder changes role.

### Adoption

Addressed by measurement rather than optimism. See section 6.

### Scale topology

Two hard ceilings shape the design and should be in the proposal so nobody
discovers them at month four: a list used as agent knowledge is capped at
**20,000 items and must be a single list**, and list views break above **5,000
items** when the query touches an unindexed column. So: per-team lists rather
than one organisational list, an agent per list, and indexed columns from day
one. The term store becomes genuinely essential at this scale — a shared
vocabulary is what makes captures from different teams retrievable together —
and it needs a named owner too.

---

## 6. The ask: a pilot, with a kill criterion

The credible ask is not a rollout. It is:

**One team of 8–12 people, eight weeks, with defined success metrics and a
stated kill criterion.**

Success is behavioural, not financial:

| Metric | Target |
|---|---|
| Participants still capturing in week 6, unprompted | ≥ 60% |
| Retrievals from the agent, per person per week | ≥ 1 |
| Logged instances of "I found something I would otherwise have re-derived or re-asked" | ≥ 5 across the pilot |

**Kill criterion, stated up front: if week-6 capture volume is below 30% of
week-2, stop and do not proceed to phase two.** Naming the condition under
which you will shut it down yourself is the single thing that most distinguishes
a proposal that gets taken seriously from one that reads as enthusiasm.

The third metric is the one that produces the anecdotes that sell phase two.
Collect it deliberately — a channel where people post when it happens — rather
than hoping to reconstruct it at the end.

---

## 7. Cost, with the arithmetic shown

The AI cost is genuinely small, and showing the working matters more than the
total, because the first question will be whether the model call on every
capture is expensive.

An AI Builder GPT prompt consumes **16 credits per 1,000 tokens**. A capture —
note body, the extraction prompt with its vocabulary, and the JSON returned —
runs around 3,000 tokens, so roughly **48 credits per capture**. The capacity
add-on is about **$500/month for 1,000,000 credits**, so a capture costs on the
order of **2.5 cents**.

| Scenario | Captures | Credits | Cost |
|---|---|---|---|
| Pilot: 10 people × 5/week × 8 weeks | 400 | ~19,200 | **under $20 total** |
| 100 people × 5/week | ~2,170/month | ~104,000/month | ~$50/month |
| 500 people × 5/week | ~10,800/month | ~520,000/month | one $500/month unit, with headroom |

**One capacity unit covers roughly 500 people capturing five notes a week.**

Two things to flag rather than bury:

- **Seeded AI Builder credits are removed on 1 November 2026**, with new
  capacity coming through Copilot Credits, which are consumed at a different
  and model-dependent rate. A pilot starting now runs across that transition.
  Run the pilot on existing capacity, and budget phase two on Copilot Credits —
  and re-check the rates then, because the figures above are AI Builder-era.
- **The real cost is not credits.** It is roughly three to five days of a
  Power Platform-capable person to build the pilot, and something like a tenth
  of an FTE to own it afterwards. That is the number that should be in the ask,
  because it is the one that is actually scarce.

---

## 8. What to ask for, in one paragraph

Eight weeks, one team, one SharePoint site, three to five days of Power
Platform build time, a named owner, and existing AI Builder capacity. In return:
a measured answer to whether a ten-second capture habit produces content that
makes Copilot materially more useful, and a kill criterion agreed in advance so
that the answer can be no.

---

## 9. Annex for IT

The build detail is in `microsoft-365-equivalent.md`. The points that are
specifically IT's decision:

- Three SharePoint lists per tier, not item-level permissions.
- Everything in a Power Platform solution, service-account owned.
- Which connectors DLP policy permits — the design avoids premium connectors
  where it can, but managed metadata writes may need a raw SharePoint HTTP call.
- Term store ownership and who may add terms.
- Retention policy on the lists, and whether an exemption is appropriate for
  content intended to be long-lived.
- Whether declarative agents can be published without review, and whether
  agents grounded on tenant data fall under existing Copilot licences or
  pay-as-you-go Copilot Credits for this population.
- eDiscovery posture, and whether participants should be told explicitly — they
  should.
