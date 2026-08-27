# A quarter of the archive is not searchable by meaning

Measured 23 August 2026 against the live database. This is a scoped proposal,
**not applied** — nothing here has touched the deployed function or the schema.

---

## The finding

`capture_thought` embeds only the first 24,000 characters of a note. The comment
explaining why is correct: `text-embedding-3-small` accepts 8,192 tokens and
rejects the entire request above that, which used to fail the whole save. Taking
a leading slice was the right fix for the bug it was fixing.

What it costs was never measured. It costs this:

| | |
|---|---|
| Notes in the archive | 127 |
| Notes longer than 24,000 characters | **49 (39%)** |
| Of those, `reference` type | 42 |
| Mean note length | 19,012 characters |
| Longest note | 88,686 characters |
| **Share of all text with no embedding** | **25.2%** |

A quarter of the archive is stored, displayed and keyword-searchable, but
invisible to `match_thoughts`. The longest note has 73% of its body unembedded.

The distribution is the part that matters. **42 of the 49 are `reference`
notes** — the captured articles and prompt kits. Those are precisely the notes
you search semantically rather than navigate to by name, so the loss falls
almost entirely on the retrieval path where vectors are the only mechanism that
works. Short observations, which keyword search finds anyway, are unaffected.

### How it fails

Silently, which is the archive's characteristic failure mode. A search for an
idea discussed on page nine of a long article returns nothing, and nothing
distinguishes that from the idea not being in the archive at all. There is no
error, no partial result, no signal.

The keyword pass in `search_thoughts` catches some of it — a literal phrase
still matches anywhere in `content` — which is why this has not been obviously
broken. Vector recall on long notes is degraded; it is not absent.

---

## The fix: chunk, embed per chunk, match to parent

One embedding per note is the wrong shape for notes of this length. The standard
answer is to embed overlapping windows and treat a hit on any window as a hit on
the note.

### Schema

```sql
create table if not exists public.thought_chunks (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (thought_id, chunk_index)
);

create index if not exists thought_chunks_embedding_idx
  on public.thought_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists thought_chunks_thought_idx
  on public.thought_chunks (thought_id);
```

Cascade is right: a chunk has no meaning without its note.

### Matching

```sql
create or replace function public.match_thought_chunks(
  query_embedding vector,
  match_threshold double precision default 0.35,
  match_count int default 10
)
returns table (id uuid, content text, metadata jsonb,
               similarity double precision, created_at timestamptz)
language sql
as $$
  select t.id, t.content, t.metadata, s.similarity, t.created_at
  from (
    select c.thought_id,
           max(1 - (c.embedding <=> query_embedding)) as similarity
    from public.thought_chunks c
    where 1 - (c.embedding <=> query_embedding) > match_threshold
    group by c.thought_id
  ) s
  join public.thoughts t on t.id = s.thought_id
  order by s.similarity desc
  limit match_count;
$$;
```

**Best chunk wins, and the note is returned once.** `max` rather than `avg`
matters: a single strongly relevant passage in a long article should rank the
note highly, and averaging over forty chunks would bury it.

### Chunking parameters

- **6,000 characters per chunk**, comfortably inside the token limit with room
  for dense markdown.
- **600 characters of overlap**, so an idea spanning a boundary is whole in one
  window.
- Split on paragraph breaks where one falls within 10% of the target, otherwise
  hard-split. Sentences cut in half embed badly.

At those settings the current archive produces roughly 450 chunks from 127
notes, and the longest note about 16.

### Cost of the backfill

127 notes, ~2.4M characters, ~600k tokens against `text-embedding-3-small`.
At current rates that is **a few pence, once**. Ongoing cost rises by the same
proportion — a long capture embeds four or five times rather than once — which
is negligible at this volume.

---

## What this touches, and why it is not applied

This changes the core retrieval path of a system in daily use, so it should be
a deliberate piece of work rather than a side effect of a documentation session.

1. `capture_thought` — write chunks alongside the note.
2. `update_thought` — re-chunk when `content` changes. Currently it re-embeds;
   it would delete and rewrite chunks instead.
3. `search` and `search_thoughts` — call `match_thought_chunks`. The keyword
   top-up stays exactly as it is; it is orthogonal and still necessary.
4. A one-off backfill for the 127 existing notes.
5. The `embedding` column on `thoughts` — keep it. It still serves
   "notes near this note" cheaply at the whole-note level, and removing it is a
   second change that does not need to ride along with this one.

The migration is additive: a new table, a new function, no change to `thoughts`.
Search can be switched over and switched back by changing which RPC the function
calls, which makes it reversible in one line.

### Order to do it in

Backfill first, with the new table populated and nothing reading it. Compare
`match_thoughts` and `match_thought_chunks` on the same queries and see whether
the recall difference is real before switching anything over. If it is not
worth it on your actual queries, you have spent an evening and a few pence to
find that out, and the table can be dropped.

That is the same discipline the archive's own maintenance scripts use: measure
before proposing, dry run then apply.
