-- Sub-headings, two renames, and Mindfulness meaning mindfulness again
-- (Stewart, 2 Nov 2026).
--
-- Until now every heading hung straight off its side. Stewart's reading of his
-- own archive has more shape than that: practice comes out of the traditions,
-- and the teacher training out of practice; the AI products are a part of AI;
-- the work projects a part of work. A heading can now name a parent heading on
-- the same side, and the catalog draws it beneath that parent:
--
--   Traditions → Practice → Mindfulness teacher training
--   AI → AI products
--   Work & career → Work projects
--
-- Renamed: "AI & tools" to "AI" (it held a tag called "AI tools", one letter
-- apart), and "Open Brain" to "Personal projects" (Open Brain, Life Engine,
-- Trips; it stays on the Work & AI side, by Stewart's choice). The Open Brain
-- tag keeps its name.
alter table public.heading_sides
  add column if not exists parent text
  references public.heading_sides (heading) on update cascade;

update public.heading_sides set heading = 'AI', updated_at = now() where heading = 'AI & tools';
update public.topic_headings set heading = 'AI', updated_at = now() where heading = 'AI & tools';
update public.heading_sides set heading = 'Personal projects', updated_at = now() where heading = 'Open Brain';
update public.topic_headings set heading = 'Personal projects', updated_at = now() where heading = 'Open Brain';
update public.tag_report_dismissals set subject = 'Personal projects'
  where finding = 'two umbrellas' and subject = 'Open Brain';

update public.heading_sides set parent = 'Traditions', updated_at = now() where heading = 'Practice';
update public.heading_sides set parent = 'Practice', updated_at = now() where heading = 'Mindfulness teacher training';
update public.heading_sides set parent = 'AI', updated_at = now() where heading = 'AI products';
update public.heading_sides set parent = 'Work & career', updated_at = now() where heading = 'Work projects';

-- Mindfulness was on 150 notes, 124 of them MTTC course material and most of
-- the rest guided meditations — repeating what MTTC and Meditation already
-- said. It comes off those, and keeps the notes about mindfulness itself.
-- A person note or a talk is not a guided meditation (Meditation's own rule),
-- so those keep Mindfulness. Every removal is logged so it can be undone.
update public.topic_vocabulary
set usage = 'mindfulness itself: its teachers, books, talks and research. Not MTTC course material, which takes MTTC, and not a guided meditation, which takes Meditation.'
where topic = 'Mindfulness';

create table if not exists public.tag_change_log (
  thought_id uuid not null,
  tag        text not null,
  change     text not null check (change in ('removed', 'added')),
  reason     text,
  changed_at timestamptz not null default now()
);
alter table public.tag_change_log enable row level security;

with target as (
  select id from public.thoughts
  where metadata->'topics' ? 'Mindfulness'
    and (metadata->'topics' ? 'MTTC'
         or (metadata->'topics' ? 'Meditation'
             and coalesce(metadata->>'type', '') <> 'person_note'
             and coalesce(metadata->>'source_name', '') <> 'Dharma talk (transcribed)'))
), logged as (
  insert into public.tag_change_log (thought_id, tag, change, reason)
  select id, 'Mindfulness', 'removed', 'repeated MTTC or Meditation (2 Nov 2026)' from target
  returning thought_id
)
update public.thoughts t
set metadata = jsonb_set(t.metadata, '{topics}',
  (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(t.metadata->'topics') x where x <> 'Mindfulness'))
where t.id in (select thought_id from logged);
