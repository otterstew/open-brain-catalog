-- Search by meaning across the whole of a long note, not just its opening.
--
-- The note-level embedding covers only the first 24,000 characters (the model
-- rejects longer input), and on 23 Aug 2026 that left about a quarter of the
-- archive's text with no embedding behind it — almost all of it in captured
-- articles and prompt kits, which are exactly the notes searched by meaning.
-- It failed silently: an idea discussed on page nine was simply not found.
-- Design and measurements: "The Unembedded Quarter" (485beb5f).
--
-- The fix is additive. Each note gets one row per ~6,000-character piece, each
-- with its own embedding, and match_thought_chunks ranks a note by its BEST
-- piece. Max, not average: one strongly relevant passage should rank a note
-- highly, and averaging over fifteen pieces would bury it. The existing
-- thoughts.embedding column stays as it is — it still serves "notes like this
-- note" cheaply — and match_thoughts is untouched, so switching search over is
-- one line in the function and switching back is the same line.
--
-- content_hash is the SHA-256 of the note text the pieces were cut from. A
-- note whose text has changed since (an edit that skipped re-chunking, or a
-- script writing straight to the table) is found by comparing hashes, and the
-- backfill re-cuts it. Without it a stale piece would keep matching text the
-- note no longer contains.

create table if not exists public.thought_chunks (
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  chunk_index int not null check (chunk_index >= 0),
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  primary key (thought_id, chunk_index)
);

-- HNSW, cosine: the same distance match_thoughts orders by.
create index if not exists thought_chunks_embedding_idx
  on public.thought_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.thought_chunks enable row level security;
drop policy if exists "Service role full access" on public.thought_chunks;
create policy "Service role full access" on public.thought_chunks
  for all using (auth.role() = 'service_role');

-- Same signature and result shape as match_thoughts, so the function can call
-- either. The nearest pieces are found through the index first (a generous
-- multiple of match_count, because one long note can own several of them),
-- then each note keeps its best piece.
create or replace function public.match_thought_chunks(
  query_embedding extensions.vector,
  match_threshold double precision default 0.7,
  match_count integer default 10,
  filter jsonb default '{}'::jsonb
)
returns table(id uuid, content text, metadata jsonb, similarity double precision, created_at timestamptz)
language sql
stable
set search_path to 'public', 'extensions'
as $$
  with near as (
    select c.thought_id, 1 - (c.embedding <=> query_embedding) as sim
    from public.thought_chunks c
    order by c.embedding <=> query_embedding
    limit greatest(match_count * 8, 80)
  ), best as (
    select thought_id, max(sim) as sim from near group by thought_id
  )
  select t.id, t.content, t.metadata, b.sim, t.created_at
  from best b
  join public.thoughts t on t.id = b.thought_id
  where b.sim > match_threshold
    and (filter = '{}'::jsonb or t.metadata @> filter)
  order by b.sim desc
  limit match_count;
$$;

-- Notes whose pieces are missing or were cut from older text: the backfill's
-- work list, shortest first so the cheap ones clear quickly.
create or replace function public.thoughts_needing_chunks(max_rows integer default 20)
returns table(id uuid, content text, content_hash text, embedding extensions.vector)
language sql
stable
set search_path to 'public', 'extensions'
as $$
  select t.id, t.content, encode(sha256(convert_to(t.content, 'UTF8')), 'hex'), t.embedding
  from public.thoughts t
  where not exists (
    select 1 from public.thought_chunks c
    where c.thought_id = t.id
      and c.content_hash = encode(sha256(convert_to(t.content, 'UTF8')), 'hex')
  )
  order by length(t.content)
  limit max_rows;
$$;
