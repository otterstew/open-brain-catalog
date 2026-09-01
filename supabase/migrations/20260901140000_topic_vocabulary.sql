-- The controlled vocabulary gets one home.
--
-- It had two: topics.txt at the archive project's root, which tidy-archive.py
-- reads to fold aliases, and PREFERRED_TOPICS hardcoded in the edge function,
-- which is what the capture prompt actually shows the extractor. The comment
-- above that constant has been a standing warning about the arrangement: the
-- two copies drift, and the drift is invisible, because tidying keeps folding
-- aliases from the file while the prompt that decides what gets coined in the
-- first place is the stale one. The remedy on offer was to remember to run
-- `tidy-archive.py --check-vocab` after every change and paste the block back.
--
-- Nobody remembers that. So the list moves into the database, the edge function
-- reads it at runtime, and topics.txt becomes a cache of this table rather than
-- a second original. Adding a topic is now one INSERT and takes effect on the
-- next capture — no redeploy, nothing to paste, nothing to keep in step.
--
-- The collection tags live here too. They were a hardcoded sentence in the same
-- prompt ("Never use Reading, Work or Projects"), which is the same fact about
-- the same vocabulary — that these tags exist but are applied later, from the
-- source, and must never be guessed by the extractor.

create table if not exists public.topic_vocabulary (
  topic text primary key,

  -- preferred   offered to the extractor as a tag to reuse
  -- collection  applied later from the source; the extractor must never guess
  --             one, so these are named to it as an exclusion
  kind text not null default 'preferred'
    check (kind in ('preferred', 'collection')),

  -- The prompt shows the list in a curated order — related terms adjacent, the
  -- archive's real subjects first — which reads better to the model than
  -- alphabetical and is worth preserving across edits.
  position integer not null default 1000,

  note text,
  created_at timestamptz not null default now()
);

-- Seeded from PREFERRED_TOPICS as it stood, in its existing order, so the
-- prompt the extractor sees does not change on the day this lands.
insert into public.topic_vocabulary (topic, kind, position) values
  ('AI',                    'preferred',  1),
  ('AI Agents',             'preferred',  2),
  ('AI Skills',             'preferred',  3),
  ('AI tools',              'preferred',  4),
  ('AI integration',        'preferred',  5),
  ('Automation',            'preferred',  6),
  ('Knowledge Management',  'preferred',  7),
  ('Knowledge Work',        'preferred',  8),
  ('Memory Systems',        'preferred',  9),
  ('Productivity',          'preferred', 10),
  ('Prompt Engineering',    'preferred', 11),
  ('Technology',            'preferred', 12),
  ('Token Management',      'preferred', 13),
  ('Workflow',              'preferred', 14),
  ('prompts',               'preferred', 15),
  ('communication',         'preferred', 16),
  ('Task management',       'preferred', 17),
  ('Team Collaboration',    'preferred', 18),
  ('Work Management',       'preferred', 19),
  ('AI Solutions Manager',  'preferred', 20),
  ('Career Development',    'preferred', 21),
  ('job market',            'preferred', 22),
  ('Intent Engineering',    'preferred', 23),
  ('ChatGPT',               'preferred', 24),
  ('Codex',                 'preferred', 25),
  ('Open Brain',            'preferred', 26),
  ('Science',               'preferred', 27),
  ('plants',                'preferred', 28),
  ('chemical signalling',   'preferred', 29),
  ('Reading',               'collection', 1),
  ('Work',                  'collection', 2),
  ('Projects',              'collection', 3)
on conflict (topic) do nothing;

-- A term cannot be both preferred and folded away. Declaring "prompts" a
-- preferred topic and simultaneously aliasing it to "Prompt Engineering" would
-- have the extractor offered a tag every night's tidy then deletes — so
-- retiring a term is now an explicit two steps: drop it from the vocabulary,
-- then add the fold.
create or replace function public.topic_aliases_no_chains()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if exists (select 1 from public.topic_aliases a where lower(a.alias) = lower(btrim(new.canonical))) then
    raise exception 'canonical % is itself an alias; point this row at the end of the chain instead', new.canonical;
  end if;
  if exists (select 1 from public.topic_aliases a where lower(a.canonical) = lower(btrim(new.alias))) then
    raise exception 'alias % is already the canonical form of another row', new.alias;
  end if;
  if exists (select 1 from public.topic_vocabulary v where lower(v.topic) = lower(btrim(new.alias))) then
    raise exception 'alias % is in the controlled vocabulary; remove it from topic_vocabulary first if you mean to retire it', new.alias;
  end if;
  return new;
end;
$$;

-- Same posture as the rest: reachable only through the edge function's
-- service-role client, which gates on the MCP access key.
alter table public.topic_vocabulary enable row level security;

drop policy if exists "Service role full access" on public.topic_vocabulary;
create policy "Service role full access" on public.topic_vocabulary
  for all using (auth.role() = 'service_role');
