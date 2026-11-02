-- NOT YET APPLIED (2 Nov 2026): the apply was waiting on a confirmation that
-- timed out. Delete this line once it is applied to the database.
--
-- tag_structure_report, second version. A finding Stewart has looked at and
-- ruled fine goes in tag_report_dismissals and stops appearing; a report that
-- repeats a settled answer every Monday trains the eye to skip it. Work
-- projects is dismissed from the start: CDD is the COU project's Jersey
-- toolkit, a part inside the whole by design. And "two umbrellas" now says how
-- many notes carry both tags, so a part inside a whole reads as one.
create table if not exists public.tag_report_dismissals (
  finding      text not null,
  subject      text not null,
  reason       text,
  dismissed_at timestamptz not null default now(),
  primary key (finding, subject)
);
alter table public.tag_report_dismissals enable row level security;
drop policy if exists "Service role full access" on public.tag_report_dismissals;
create policy "Service role full access" on public.tag_report_dismissals
  for all using (auth.role() = 'service_role');

insert into public.tag_report_dismissals (finding, subject, reason) values
  ('two umbrellas', 'Work projects', 'CDD is the COU project''s Jersey toolkit: a part inside the whole, by design (2 Nov 2026)')
on conflict (finding, subject) do nothing;

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
    select heading, norm, label, n,
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
           r1.label || ' (' || r1.n || ') and ' || r2.label || ' (' || r2.n || ') share the heading, ' ||
           coalesce(p.both_n, 0) || ' notes carrying both; ' ||
           case when coalesce(p.both_n, 0) >= 0.8 * r2.n
                then 'the smaller sits almost wholly inside the bigger: a part of it, or swamping the heading?'
                else 'mostly different notes: two kinds of thing on one shelf?' end
    from ranked r1
    join ranked r2 on r2.heading = r1.heading and r1.rk = 1 and r2.rk = 2
    left join pairs p on p.a_norm = least(r1.norm, r2.norm) and p.b_norm = greatest(r1.norm, r2.norm)
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
  where not exists (select 1 from public.tag_report_dismissals d
                    where d.finding = r.finding and d.subject = r.subject)
  order by case finding when 'needs a heading' then 1 when 'tags always together' then 2
                        when 'two umbrellas' then 3 when 'crowded heading' then 4 else 5 end,
           notes desc, subject;
$$;
