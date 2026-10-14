-- Now that the vocabulary has a home, the review queue can be defined properly.
--
-- untidy_topics was written a few hours earlier, when the controlled vocabulary
-- existed only in topics.txt and in a constant inside the edge function. With
-- nothing in the database to compare a tag against, the best available proxy
-- for "needs a decision" was "used only once" — which is a guess about the
-- symptom, not the thing itself. Plenty of tags used five or nine times have
-- never been ruled on either way.
--
-- With topic_vocabulary present the real question can be asked: which tags in
-- use are neither a term we have chosen to keep, nor already covered by a fold?
-- Those are exactly the ones with no decision recorded against them, and each
-- has three possible answers — add it to the vocabulary, alias it away, or
-- leave it alone as a deliberate one-off.
--
-- Still reported, never acted on. Nothing about having a vocabulary makes it
-- safe to delete a tag automatically.

drop function if exists public.untidy_topics(integer);

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
      -- Worth a decision soonest: enough notes carry it that it is already
      -- doing filing work, it just has no ruling.
      when count(*) >= 5 then 'established'
      when count(*) > 1  then 'recurring'
      else 'one-off'
    end as kind
  from public.thoughts t,
       lateral jsonb_array_elements_text(
         case when jsonb_typeof(t.metadata->'topics') = 'array'
              then t.metadata->'topics' else '[]'::jsonb end
       ) as tag
  where not exists (select 1 from public.topic_vocabulary v where lower(v.topic)     = lower(btrim(tag)))
    and not exists (select 1 from public.topic_aliases   a where lower(a.canonical)  = lower(btrim(tag)))
    and not exists (select 1 from public.topic_aliases   a where lower(a.alias)      = lower(btrim(tag)))
  group by tag
  order by count(*) desc, tag;
$$;
