# The vector side, and what Microsoft is doing with the Graph

Two questions: what the vector machinery in the MCP actually does and whether it
is what makes this memory rather than storage; and whether Microsoft's Graph is
the same idea. The short answers are *partly* and *no, it is the other half*.

---

## 1. What is actually there

Measured from the live database rather than from the code's intentions.

| | |
|---|---|
| Column | `embedding vector(1536)` on `thoughts` |
| Model | `openai/text-embedding-3-small`, via OpenRouter |
| Index | HNSW, `vector_cosine_ops` |
| Distance | cosine — `1 - (embedding <=> query)` reported as similarity |
| Default threshold | 0.35 in the tools; 0.7 in the function signature |
| Rows | 114 thoughts, none missing an embedding |
| Also indexed | GIN on `metadata`, btree on `created_at DESC` |

Each note becomes a list of 1,536 numbers. A search query becomes another 1,536
numbers by the same model. `match_thoughts` measures the angle between them,
keeps anything above the threshold, and returns the closest first. HNSW is what
stops that being a scan of every row — it is a navigable graph of near
neighbours, so lookup stays fast as the archive grows.

Two details in there matter more than they look.

**Only the first 24,000 characters are embedded.** `text-embedding-3-small`
accepts 8,192 tokens and rejects the whole request if you exceed it, which used
to fail the entire save. So long captures are embedded on a leading slice, while
the note is stored in full. A conclusion buried on page nine of a long article
is *stored* but is not *findable by meaning* — only by keyword. Worth knowing
before trusting a search over long documents.

**The threshold is doing a lot of work.** 0.35 is generous. Set it higher and
you get fewer, better matches and miss things; lower and everything matches
weakly, which is worse than nothing because it looks like an answer. There is no
correct value, only a value tuned against a particular archive — which is
precisely the knob a managed index does not give you.

---

## 2. Is it what makes this memory?

Partly. It is necessary and it is not sufficient, and the code already contains
the proof.

What vectors genuinely buy you is **retrieval without shared vocabulary**. A
folder or a tag only finds a note if you guess the word you filed it under.
Embeddings let "how do I stop the archive going stale" find a note that never
uses any of those words. That is the thing filing systems cannot do at all, and
it is why the archive stays useful after you have forgotten what is in it.

But the codebase already records where that fails, in a comment above
`keywordMatches`:

> Vector search answers "what is this about"; it does not answer "which notes
> contain this word". A generic term like "building" is about nothing in
> particular, so it scores below any sensible threshold even when it appears in
> eleven titles.

That is a real empirical finding, and it is why `search` and `search_thoughts`
top up vector hits with a literal pass across title, content, topics, people,
author and source. **Neither half is sufficient. The hybrid is the feature.**
Anyone reproducing this who implements only the vector half will build something
that feels clever and fails on half of real queries.

And there are three other things doing at least as much work:

- **Enrichment at write time.** The extraction call that produces title, author,
  source, topics, people and type is what gives retrieval something to grip. It
  is also what makes results readable — a search that returns twenty untitled
  blobs is not memory, whatever the maths underneath.
- **Capture friction low enough that things actually get in.** An empty archive
  with excellent retrieval is worth nothing.
- **A model that can write back.** The MCP surface both reads *and* writes, and
  the Life Engine queries the archive unprompted before a meeting. Memory is
  something that gets consulted without being asked. A store you have to go and
  interrogate is a library.

So: the vectors make it *searchable by meaning*. The write path, the enrichment
and the unprompted reads are what make it *memory*.

---

## 3. Microsoft: the Graph and the semantic index are two different things

The instinct that Microsoft is chasing the same idea is right, but the naming
hides that they have two separate mechanisms — and only one is the same idea.

**The Microsoft Graph** is entities and relationships. People, files, messages,
meetings, and the edges between them: authored, attended, shared with, replied
to, works closely with. It is a genuine graph, and it is built automatically
from activity. Nobody types it in.

**The semantic index** is a per-tenant vector store built on top of the Graph.
Content is chunked, embedded and stored so queries can be answered by meaning
rather than exact match. It is the same machinery as `match_thoughts` —
different model, vastly bigger, someone else's threshold.

Copilot uses both together: the vectors decide *what is relevant*, the graph
decides *what is relevant **to you***. A document semantically near your question
ranks differently depending on whether you wrote it, your manager sent it, or it
belongs to a team you have never worked with.

### The comparison that actually matters

| | Open Brain | Microsoft |
|---|---|---|
| Vectors | 1,536-dim, model and threshold yours | Per-tenant semantic index, both chosen for you |
| Graph | `linked_thought_ids`, `people`, `topics`, `author` — hand-built, one at a time | Built automatically from activity, tenant-wide |
| Edge meaning | **Judgement** — you decided these were related | **Activity** — you and Sarah were in a meeting |
| Coverage | Only what you captured | Everything, whether or not anyone meant it |

Open Brain has a graph too. `link_thoughts` builds it by hand, and the `people`
and `topics` arrays are edges stored in a jsonb blob. It is small, deliberate
and meaningful. Microsoft's is vast, automatic and meaningless — in the precise
sense that an edge records that something *happened*, not that it *mattered*.

That is the same asymmetry as the sponsor argument, arrived at from the other
direction: the Graph knows you and Sarah were in a meeting on Tuesday. It cannot
know you came out of it thinking her team is blocked on procurement, because
nobody wrote that down. Automatic edges are cheap and abundant; judgement edges
are expensive and scarce, and only the second kind answers the questions worth
asking.

### GraphRAG

Worth knowing the name, because it is Microsoft's and it will come up. GraphRAG
is Microsoft Research's technique for using an LLM to build an entity graph out
of a document set, summarise its clusters, and answer questions plain vector
retrieval fails at — "what are the recurring themes here", which no single chunk
contains and which similarity search therefore cannot find.

The extraction step in `capture_thought` is a small hand-rolled version of the
same instinct: pull entities out at write time so there is structure to traverse
later, not just a cloud of nearby text. Same idea, one note at a time.

---

## 4. What this means practically

- The Retrieval API is the bridge. It queries the tenant semantic index from a
  flow and returns ranked chunks with sources, so retrieval by meaning is
  available inside automations, not just inside a chat window.
- You will not own the index. No embedding model choice, no threshold, no
  scores, no "notes near this note". For grounding an answer that is fine; for
  building retrieval you can reason about and tune, it is not.
- **Bring the keyword half yourself.** Whatever Microsoft's index does, the
  lesson from `keywordMatches` holds: literal lookups need literal matching.
  A `Topics` or `People` column filtered directly will beat semantic search for
  "what do I know about Sarah" every time, because that is a join, not a
  question.
- **The graph you would want at work has to be written, not derived.** Microsoft
  gives you the activity edges free. The judgement edges are exactly what the
  capture habit produces, and they are the reason any of this is worth building.
