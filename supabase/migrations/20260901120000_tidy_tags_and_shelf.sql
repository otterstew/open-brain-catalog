-- Two jobs the archive could not do for itself: fold the tag vocabulary back
-- together, and get the machine's own bookkeeping out of the reading list.
--
-- The tag problem, measured before this ran: 176 notes carrying 526 tag uses
-- across 150 distinct tags, of which 107 were used exactly once. A tag used
-- once files nothing. Worse, the singletons were not all noise — "AI Strategy",
-- "AI Management", "AI Products" and nine more were the extractor coining a
-- fresh variant of "AI" every time it met a new article.
--
-- The reading problem: 39 of the 176 notes are changelog entries and work
-- orders. They are written BY the machine, FOR the machine, and they are a
-- fifth of everything in the catalog. They drown the notes that were captured
-- to be read again.
--
-- Neither is fixed by deleting anything. Tags are folded toward a canonical
-- term through an alias table you can extend; machine notes are marked and
-- filtered, never removed, and the marking is derived from tags so retagging a
-- note re-decides it immediately.

-- ---------------------------------------------------------------------------
-- 1. The alias map
-- ---------------------------------------------------------------------------

-- Deliberately NOT a copy of the controlled vocabulary. That list already
-- exists twice — topics.txt at the project root and PREFERRED_TOPICS in the
-- edge function — and the header comment in index.ts is a warning about what a
-- third copy would cost. This table holds only alias -> canonical pairs. It
-- says "these two strings mean the same thing", which is a different claim
-- from "this is a topic worth having", and it can be true without either copy
-- of the vocabulary being consulted.
create table if not exists public.topic_aliases (
  -- Matched case-insensitively, so "AI tools" and "AI Tools" fold together
  -- without needing a row each.
  alias text primary key,
  canonical text not null check (length(btrim(canonical)) > 0),
  -- Why this fold was judged safe. The tidier is automatic and unattended;
  -- six months from now the reason a tag vanished should be readable here
  -- rather than reconstructed from a diff.
  note text,
  created_at timestamptz not null default now()
);

-- A fold must not point at another alias, or the result depends on which row
-- the tidier happens to read first. One hop, always.
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
  return new;
end;
$$;

drop trigger if exists topic_aliases_no_chains_trigger on public.topic_aliases;
create trigger topic_aliases_no_chains_trigger
  before insert or update on public.topic_aliases
  for each row execute function public.topic_aliases_no_chains();

-- The seed is conservative on purpose. Every row here is a variant whose
-- meaning is wholly contained by its canonical form; anything requiring a
-- judgement call about what Stewart meant is left alone and reported instead
-- (see tidy_thought_tags's second return set). Folding aggressively would
-- quietly destroy the only specific handle some notes have — "Adrenal
-- Insufficiency" and "Mortgage" are each used once and neither is noise.
insert into public.topic_aliases (alias, canonical, note) values
  ('AGI',                        'AI',                   'facet of AI, not a separate subject in this archive'),
  ('AI Development',             'AI',                   'extractor variant'),
  ('AI Management',              'AI',                   'extractor variant'),
  ('AI Products',                'AI',                   'extractor variant'),
  ('AI Solutions',               'AI',                   'extractor variant; distinct from the AI Solutions Manager role tag'),
  ('AI Strategy',                'AI',                   'extractor variant'),
  ('AI Investment',              'AI',                   'extractor variant'),
  ('AI visibility',              'AI',                   'extractor variant'),
  ('AI in software development', 'AI',                   'extractor variant'),
  ('Consumer AI',                'AI',                   'extractor variant'),
  ('Enterprise AI',              'AI',                   'extractor variant'),
  ('Proactive AI',               'AI',                   'extractor variant'),
  ('AI Claude',                  'Claude',               'awkward coinage for the tool already tagged Claude'),
  ('Document Management',        'Knowledge Management', 'same subject, narrower wording'),
  ('data management',            'Knowledge Management', 'same subject, narrower wording'),
  ('Catalog Management',         'Knowledge Management', 'the catalog is the knowledge management system'),
  ('Project Management',         'Work Management',      'Work Management is the vocabulary term'),
  ('machine work management',    'Work Management',      'extractor variant'),
  ('work briefs',                'Work Management',      'extractor variant'),
  ('Coordination',               'Team Collaboration',   'same subject, vaguer wording'),
  ('scripts',                    'Automation',           'a script here is always automation'),
  ('Coding',                     'Technology',           'too broad to file by on its own'),
  ('software releases',          'Technology',           'too broad to file by on its own'),
  ('system architecture',        'Technology',           'generic; Microsoft Architecture is kept, being specific'),
  ('Physics',                    'Science',              'single use, wholly inside Science')
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The shelf
-- ---------------------------------------------------------------------------

-- Which tags mean "the machine wrote this to keep track of itself".
create table if not exists public.shelved_topics (
  topic text primary key,
  reason text,
  created_at timestamptz not null default now()
);

insert into public.shelved_topics (topic, reason) values
  ('Changelog',  'entries the assistant writes about its own changes; 35 of 176 notes'),
  ('Work order', 'instructions written to the machine, not notes written to be read again')
on conflict (topic) do nothing;

-- Stored rather than computed at read time so it can be indexed and put in a
-- WHERE clause. list_thoughts asks the database for N rows; filtering after
-- the fact would let shelved notes eat the limit and return three results
-- where ten were asked for.
alter table public.thoughts
  add column if not exists shelved boolean not null default false;

-- The rule, in one place. A per-note override in metadata.shelf wins over the
-- tags, so a single note can be pushed out of sight or dragged back into it
-- without inventing a tag for the purpose:
--   metadata.shelf = 'hide'  always shelved
--   metadata.shelf = 'show'  never shelved
-- STABLE, not IMMUTABLE, because it reads shelved_topics — which is exactly
-- why this is a trigger and not a generated column.
create or replace function public.thought_is_shelved(p_metadata jsonb)
returns boolean
language sql
stable
set search_path to ''
as $$
  select case p_metadata->>'shelf'
    when 'hide' then true
    when 'show' then false
    else exists (
      select 1
      from public.shelved_topics s
      where jsonb_typeof(p_metadata->'topics') = 'array'
        and exists (
          select 1
          from jsonb_array_elements_text(p_metadata->'topics') as tag
          where lower(btrim(tag)) = lower(s.topic)
        )
    )
  end;
$$;

create or replace function public.thoughts_sync_shelved()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.shelved := coalesce(public.thought_is_shelved(new.metadata), false);
  return new;
end;
$$;

-- Fires on metadata changes only. The nightly resync writes the shelved column
-- directly, and that write deliberately does not re-enter this trigger.
drop trigger if exists thoughts_sync_shelved_trigger on public.thoughts;
create trigger thoughts_sync_shelved_trigger
  before insert or update of metadata on public.thoughts
  for each row execute function public.thoughts_sync_shelved();

-- Partial: the interesting query is "the unshelved ones, newest first", which
-- is every catalog load and every list_thoughts call.
create index if not exists thoughts_unshelved_recent_idx
  on public.thoughts (created_at desc)
  where not shelved;

-- ---------------------------------------------------------------------------
-- 3. Let housekeeping stay invisible
-- ---------------------------------------------------------------------------

-- The tidier rewrites metadata on notes nobody has revised. Left as it was,
-- the updated_at trigger would stamp all of them with tonight's date and the
-- archive would report a burst of editing that never happened — the same
-- reasoning that already keeps housekeeping scripts off metadata.updated_date.
--
-- A flag rather than a supplied value: passing updated_at back in unchanged is
-- indistinguishable, inside the trigger, from not mentioning it at all, so the
-- timestamp would bump anyway. The tidier sets open_brain.housekeeping for the
-- length of its transaction and nothing else does, so every existing writer
-- behaves exactly as before.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('open_brain.housekeeping', true), 'off') = 'on' then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The tidier
-- ---------------------------------------------------------------------------

-- Every change it makes, kept. task_sweeps earns its keep the same way: an
-- unattended job that edits your archive nightly is only trustworthy if you
-- can read back exactly what it did and put it back.
create table if not exists public.topic_tidy_log (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.thoughts(id) on delete cascade,
  topics_before jsonb not null,
  topics_after jsonb not null,
  ran_at timestamptz not null default now()
);

create index if not exists topic_tidy_log_ran_idx on public.topic_tidy_log (ran_at desc);
create index if not exists topic_tidy_log_thought_idx on public.topic_tidy_log (thought_id);

-- Folds aliases, trims whitespace, drops empty tags and de-duplicates, leaving
-- tag order otherwise untouched. Idempotent: a second run over a tidy archive
-- changes nothing and logs nothing.
--
-- p_dry_run returns exactly what it would do without writing a row, and is how
-- this should be read before it is ever scheduled.
create or replace function public.tidy_thought_tags(p_dry_run boolean default false)
returns table (thought_id uuid, title text, topics_before jsonb, topics_after jsonb)
language plpgsql
security definer
set search_path to ''
as $$
declare
  r          record;
  v_raw      text;
  v_tag      text;
  v_kept     text[];
  v_seen     text[];
  v_after    jsonb;
begin
  -- Transaction-local; see update_updated_at. Set before the first write so
  -- nothing this function touches looks freshly revised.
  perform set_config('open_brain.housekeeping', 'on', true);

  for r in
    select t.id, t.metadata, t.updated_at
    from public.thoughts t
    where jsonb_typeof(t.metadata->'topics') = 'array'
    order by t.created_at
  loop
    v_kept := '{}';
    v_seen := '{}';

    for v_raw in select jsonb_array_elements_text(r.metadata->'topics')
    loop
      v_tag := btrim(v_raw);
      continue when v_tag = '';

      -- max() rather than a bare select, so a miss yields the tag unchanged
      -- instead of null. The no-chains trigger guarantees one hop is enough.
      select coalesce(max(a.canonical), v_tag) into v_tag
      from public.topic_aliases a
      where lower(a.alias) = lower(v_tag);

      -- Case-insensitive de-dupe: folding two variants onto one canonical
      -- term is the common way a note ends up with the same tag twice.
      if not (lower(v_tag) = any(v_seen)) then
        v_kept := v_kept || v_tag;
        v_seen := v_seen || lower(v_tag);
      end if;
    end loop;

    v_after := to_jsonb(v_kept);
    continue when v_after = r.metadata->'topics';

    if not p_dry_run then
      update public.thoughts
         set metadata = jsonb_set(metadata, '{topics}', v_after)
       where id = r.id;

      insert into public.topic_tidy_log (thought_id, topics_before, topics_after)
      values (r.id, r.metadata->'topics', v_after);
    end if;

    thought_id    := r.id;
    title         := r.metadata->>'title';
    topics_before := r.metadata->'topics';
    topics_after  := v_after;
    return next;
  end loop;

  -- Catch up any note whose shelved flag no longer matches the rule. Normally
  -- a no-op, since the trigger keeps it true on every write; it earns its
  -- place the night after a row is added to shelved_topics, when hundreds of
  -- existing notes need re-deciding and nothing has rewritten their metadata.
  if not p_dry_run then
    update public.thoughts t
       set shelved = public.thought_is_shelved(t.metadata)
     where t.shelved is distinct from public.thought_is_shelved(t.metadata);
  end if;
end;
$$;

-- The review queue: tags too rare to be filing anything, that no alias rule
-- already covers. Reported, never acted on — a tag used once is sometimes the
-- only specific handle on a note, and no rule can tell those from the
-- extractor's throwaway coinages. Raise p_max_uses to widen the net.
--
-- Deliberately defined by rarity rather than by absence from the controlled
-- vocabulary: that list lives in topics.txt and in PREFERRED_TOPICS, and a
-- third copy here would be the drift the edge function's header warns about.
create or replace function public.untidy_topics(p_max_uses integer default 1)
returns table (topic text, uses bigint)
language sql
stable
set search_path to ''
as $$
  select tag, count(*) as uses
  from public.thoughts t,
       lateral jsonb_array_elements_text(
         case when jsonb_typeof(t.metadata->'topics') = 'array'
              then t.metadata->'topics' else '[]'::jsonb end
       ) as tag
  where not exists (select 1 from public.topic_aliases a where lower(a.canonical) = lower(btrim(tag)))
    and not exists (select 1 from public.topic_aliases a where lower(a.alias)     = lower(btrim(tag)))
  group by tag
  having count(*) <= greatest(coalesce(p_max_uses, 1), 1)
  order by count(*) desc, tag;
$$;

-- ---------------------------------------------------------------------------
-- 5. Backfill and access
-- ---------------------------------------------------------------------------

select set_config('open_brain.housekeeping', 'on', true);

update public.thoughts t
   set shelved = public.thought_is_shelved(t.metadata)
 where t.shelved is distinct from public.thought_is_shelved(t.metadata);

select set_config('open_brain.housekeeping', 'off', true);

-- Same posture as thoughts and tasks: nothing reaches these except through the
-- edge function's service-role client, which gates on the MCP access key.
alter table public.topic_aliases enable row level security;
alter table public.shelved_topics enable row level security;
alter table public.topic_tidy_log enable row level security;

drop policy if exists "Service role full access" on public.topic_aliases;
create policy "Service role full access" on public.topic_aliases
  for all using (auth.role() = 'service_role');

drop policy if exists "Service role full access" on public.shelved_topics;
create policy "Service role full access" on public.shelved_topics
  for all using (auth.role() = 'service_role');

drop policy if exists "Service role full access" on public.topic_tidy_log;
create policy "Service role full access" on public.topic_tidy_log
  for all using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. The schedule
-- ---------------------------------------------------------------------------

-- 05:45 UTC, a quarter of an hour behind sweep-unfiled-tasks, so the two
-- nightly jobs never contend for the same rows. cron.schedule upserts on the
-- job name, so re-running this migration re-points the job rather than adding
-- a second one.
--
-- Nothing here notifies anyone. The tidier is silent by design: it logs every
-- change to topic_tidy_log, and a nightly message saying "changed nothing"
-- 364 times a year is how a person learns to ignore a channel.
select cron.schedule('tidy-thought-tags', '45 5 * * *', $cron$select public.tidy_thought_tags();$cron$);
