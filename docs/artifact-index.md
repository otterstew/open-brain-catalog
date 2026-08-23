# The artefact set

Source of truth for the overview page. One entry per artefact: what it is, who
it is for, and when to reach for it. `tools/build-artifact-index.py` renders
this into the published overview.

**Editing rules.** Entries are ordered by the sequence you would actually use
them, not by date. The scheduled job appends new entries it finds and marks them
`review: yes`; it never rewrites an existing entry. Anything marked for review
needs a human sentence before it is worth reading.

---

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
id: sponsor-approach
title: Sponsor Approach Note
url: https://claude.ai/code/artifact/8647e7d8-564b-445a-8d1d-cdf9d7b53914
audience: One named sponsor who owns AI or Copilot
role: The opening move
summary: A cold email asking for permission rather than resources, plus the two-page note attached to it, written to avoid reading as criticism of their programme.
use: Start here. It is the only document meant to be sent. Everything else supports it or follows it.
holds: The email itself, the reasoning behind each line, why the ask is permission rather than budget, and what to have ready if they say yes.

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
