-- A shelved tag has already been ruled on.
--
-- The queue written minutes ago asked "which tags are in neither the vocabulary
-- nor the fold map", and so listed Changelog (35 uses) and Work order (5) at
-- the very top as the most urgent decisions outstanding. They are nothing of
-- the kind: both are named in shelved_topics, which is a deliberate ruling
-- about them — keep the tag, and keep the notes carrying it out of the reading
-- list. Leaving them at the head of the queue would train the eye to skip it.
--
-- There are three places a decision about a tag can be recorded: keep it
-- (topic_vocabulary), fold it away (topic_aliases), or keep it and shelve what
-- it marks (shelved_topics). The queue is what appears in none of them.

create or replace function public.untidy_topics()
returns table (topic text, uses bigint, kind text)
language sql
stable
set search_path to ''
as $$
  select
    tag,
    count(*) as uses,
    case
      when count(*) >= 5 then 'established'
      when count(*) > 1  then 'recurring'
      else 'one-off'
    end as kind
  from public.thoughts t,
       lateral jsonb_array_elements_text(
         case when jsonb_typeof(t.metadata->'topics') = 'array'
              then t.metadata->'topics' else '[]'::jsonb end
       ) as tag
  where not exists (select 1 from public.topic_vocabulary v where lower(v.topic)    = lower(btrim(tag)))
    and not exists (select 1 from public.topic_aliases   a where lower(a.canonical) = lower(btrim(tag)))
    and not exists (select 1 from public.topic_aliases   a where lower(a.alias)     = lower(btrim(tag)))
    and not exists (select 1 from public.shelved_topics  s where lower(s.topic)     = lower(btrim(tag)))
  group by tag
  order by count(*) desc, tag;
$$;
