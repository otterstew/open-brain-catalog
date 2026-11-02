-- How the tags hang together, as a weekly report for the Monday tag review.
--
-- untidy_topics asks whether each tag has been ruled on. It could not have
-- caught any of what the 2 Nov tidy found: about thirty family-history notes
-- whose tags had no heading; MTTC and its course tags crowding Practice, where
-- they buried the notes about Stewart's own practice; GUI and MCP Database
-- stamped on the same 29 notes, CVs included, so neither told anything apart.
-- This asks the structural questions instead, over the notes the catalog shows
-- (not shelved, not tasks). Reported, never acted on.
--
--   needs a heading     a tag on 2+ notes with no heading; it shows as "Not
--                       grouped yet" in the catalog.
--   crowded heading     more than 12 tags in real use (2+ notes) under one
--                       heading; split it into sibling headings on the same
--                       side, never a level beneath.
--   two umbrellas       a heading whose second-biggest tag has 20+ notes and is
--                       at least 40% the size of the biggest. One umbrella tag
--                       per heading is the design (Family, Buddhism, MTTC); two
--                       usually means two kinds of thing sharing a shelf.
--   tags always together  two tags on 5+ notes each that share 90%+ of them:
--                       one is not telling anything apart.
--   heading without a side  no row in heading_sides, so it shows on both sides
--                       of the Personal / Work & AI switch.
--
-- Collection tags (topic_vocabulary kind 'collection': Reading, Work, Projects,
-- AI Dashboard) are left out of the last three: they are applied from where a
-- note came from, and overlap by design. Thresholds were set against the
-- archive straight after the 2 Nov tidy, so a clean archive reports little.
create or replace function public.tag_structure_report()
returns table (finding text, subject text, notes bigint, detail text)
language sql
stable
set search_path to ''
as $$
  with live as (
    select distinct t.id, btrim(x) as tag, lower(btrim(x)) as norm
    from public.thoughts t,
         lateral jsonb_array_elements_text(
           case when jsonb_typeof(t.metadata->'topics') = 'array'
                then t.metadata->'topics' else '[]'::jsonb end
         ) as x
    where coalesce(t.shelved, false) = false
      and coalesce(t.metadata->>'type', '') <> 'task'
      and btrim(x) <> ''
  ),
  tags as (
    select norm, min(tag) as label, count(distinct id) as n,
           exists (select 1 from public.topic_vocabulary v
                   where lower(v.topic) = norm and v.kind = 'collection') as collection
    from live group by norm
  ),
  placed as (
    select tags.*, h.heading
    from tags left join public.topic_headings h on lower(btrim(h.topic)) = tags.norm
  ),
  ranked as (
    select heading, label, n,
           row_number() over (partition by heading order by n desc, label) as rk
    from placed
    where heading is not null and not collection
  ),
  pairs as (
    select a.norm as a_norm, b.norm as b_norm, count(*) as both_n
    from (select distinct id, norm from live) a
    join (select distinct id, norm from live) b on a.id = b.id and a.norm < b.norm
    group by 1, 2
  )
  select * from (
    select 'needs a heading'::text as finding, label as subject, n as notes,
           'on ' || n || ' notes with no heading; shows as "Not grouped yet"' as detail
    from placed where heading is null and n >= 2

    union all
    select 'crowded heading', heading, count(*),
           count(*) || ' tags on 2+ notes each: ' || string_agg(label, ', ' order by n desc)
    from placed where heading is not null and not collection and n >= 2
    group by heading having count(*) > 12

    union all
    select 'two umbrellas', r1.heading, r2.n,
           r1.label || ' (' || r1.n || ') and ' || r2.label || ' (' || r2.n || ') share the heading; are they the same kind of thing?'
    from ranked r1 join ranked r2 on r2.heading = r1.heading and r1.rk = 1 and r2.rk = 2
    where r2.n >= 20 and r2.n >= 0.4 * r1.n

    union all
    select 'tags always together', ta.label || ' + ' || tb.label, p.both_n,
           'share ' || p.both_n || ' of ' || (ta.n + tb.n - p.both_n) || ' notes; one may be telling nothing apart'
    from pairs p
    join tags ta on ta.norm = p.a_norm
    join tags tb on tb.norm = p.b_norm
    where ta.n >= 5 and tb.n >= 5 and not ta.collection and not tb.collection
      and p.both_n >= 0.9 * (ta.n + tb.n - p.both_n)

    union all
    select 'heading without a side', h.heading, count(*),
           'no row in heading_sides, so it shows on both sides'
    from public.topic_headings h
    where not exists (select 1 from public.heading_sides s where s.heading = h.heading)
    group by h.heading
  ) r
  order by case finding when 'needs a heading' then 1 when 'tags always together' then 2
                        when 'two umbrellas' then 3 when 'crowded heading' then 4 else 5 end,
           notes desc, subject;
$$;
