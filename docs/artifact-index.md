# The artefact set

Source of truth for the overview page. One entry per artefact: what it is, who
it is for, and when to reach for it. `tools/build-artifact-index.py` renders
this into the published overview.

**Editing rules.** Entries are ordered by the sequence you would actually use
them, not by date — the opening move first, then what you do next. The scheduled job appends new entries it finds and marks them
`review: yes`; it never rewrites an existing entry. Anything marked for review
needs a human sentence before it is worth reading.

---

## entry
id: sponsor-approach
title: Sponsor Approach Note
url: https://claude.ai/code/artifact/8647e7d8-564b-445a-8d1d-cdf9d7b53914
audience: One named sponsor who owns AI or Copilot
role: The opening move
summary: A cold email asking for permission rather than resources, plus the two-page note attached to it, written to avoid reading as criticism of their programme.
use: Start here. It is the only document meant to be sent. Everything else supports it or follows it.
holds: The email itself, the reasoning behind each line, why the ask is permission rather than budget, and what to have ready if they say yes.

## entry
id: build-guide
title: Building It Yourself
url: https://claude.ai/code/artifact/7e210cc9-b8fd-41f8-97c6-109cb00aa57b
audience: You, on the evenings you actually build it
role: The manual
summary: Step by step for the single-user demo — pre-flight checks, the apps and permissions to ask for, the list schema, the capture flows, and the traps that cost time.
use: Open it when you start building, not before. Part 0 is fifteen minutes of pre-flight that tells you whether the plan survives your tenant, and two of those checks can stop the build dead — do them first.
holds: The licensing table, the exact permissions to ask for in one go, the internal-column-name trap, the extraction prompt's JSON shape, the Outlook and Teams flows step by step, and a collected traps list.

## entry
id: build-portfolio
title: The Build Portfolio
url: https://claude.ai/code/artifact/3d0a0c83-a91d-45ec-a569-152495d1a9c2
audience: Anyone asking what you have actually built
role: How it works
summary: How the archive, the agent, the task layer and the skills fit together — the layered spine, the three rules underneath it, and how mature each piece is.
use: The answer to "show me what you have built". Also the right thing to read yourself before extending anything, because it names the gap to close next rather than pretending there isn't one.
holds: The spine diagram, the three rules, the maturity table, the two-notions-of-task problem, and the bar a piece has to clear before it is listed at all.

## entry
id: firm-scale
title: Open Brain at Firm Scale
url: https://claude.ai/code/artifact/3b875b8f-7f4c-41e3-acf8-59fbbf1b3d23
audience: A sponsor or partner asking whether this belongs in the firm
role: The honest bridge
summary: What the system does, where the same pattern fits inside a professional services firm, and the six structural things that would have to change first.
review: no
use: The bridge between the personal system and the firm, in your own words. The blockers section is what makes the rest credible — never send this with that section cut.
holds: The eight things it does, four places the pattern fits in a legal firm, six structural blockers from authentication to data residency, and what is safely usable today.

## entry
id: build-plan
title: Open Brain on Microsoft 365
url: https://claude.ai/code/artifact/d9ce050c-686e-48af-9bf9-91df2bb476fa
audience: You, and whoever ends up building it
role: The technical map
summary: Every part of the personal stack mapped onto SharePoint, Power Automate and Copilot, with the build order, the real ceilings, and where a tenant does it better.
use: Reach for this when you are actually building, or when someone technical asks how it would work. Not for a first conversation — it reads as over-engineering to anyone deciding whether they care.
holds: The column schema, the four capture routes, the AI Builder prompt approach, the 20,000-item and 5,000-item ceilings, and the questions for IT.

## entry
id: org-case
title: The Missing Layer
url: https://claude.ai/code/artifact/240f72a9-9753-48da-9662-f0d9f7e383e7
audience: A sponsor deciding whether this is worth an organisation's attention
role: The argument
summary: Why a ten-second capture habit is what closes the gap between what Copilot can retrieve and what people actually know, costed, with a stated kill criterion.
use: This is phase two. Do not lead with it. It becomes the right document once a demo has landed and the conversation turns to "what would it take to do this properly".
holds: The three reasons knowledge bases die, the four things that only work at scale, the candour and visibility-tier problem, the cost arithmetic, and the pilot metrics.

## entry
id: life-engine
title: Life Engine on Microsoft
url: https://claude.ai/code/artifact/816531aa-e8a7-4441-8992-8b0a091d49c2
audience: You, mostly — and a sponsor who asks "what else could this do"
role: The second build
summary: Whether the half-hourly agent that reads the calendar and decides whether to speak could be rebuilt from Power Automate and Copilot. Mostly yes, and in several respects better.
use: Not part of the sponsor pitch. Keep it back — it is the thing to show once the archive has proved itself, because it is much harder to explain cold and much more impressive after.
holds: The six-part mapping, the Retrieval API and its three conditions, the billing trap where silent ticks stop being free, and the deterministic gate that fixes it.

## entry
id: vectors
title: Vectors and the Graph
url: https://claude.ai/code/artifact/f4c1cb6e-65c4-4489-85c5-dfcab340c7e0
audience: Anyone technical who asks how the retrieval actually works
role: The mechanism
summary: What the embedding layer does, why the hybrid with keyword search is the real feature, and how Microsoft's Graph is the other half rather than the same idea.
use: Answer material rather than pitch material. Also the one to re-read before making any claim about what Copilot can and cannot retrieve, because that is where the earlier mistake was.
holds: The live configuration, the 24,000-character embedding limit, why keyword search exists, the meaning-versus-entity distinction, and GraphRAG.
