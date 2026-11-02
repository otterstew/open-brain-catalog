-- Projects, sorted (Stewart, 2 Nov 2026).
--
-- "Projects" was on 30 notes, every one of them also tagged Open Brain — CVs
-- and the Microsoft port pages included — so it told nothing apart. Each note
-- now carries the project it belongs to, and "Projects" comes off all of them:
--   Open Brain stays on the notes about Open Brain itself;
--   Life Engine joins "Life Engine: what it does…";
--   Two Sides (new) replaces Open Brain on the flashcards-app note;
--   Reading Room (new, a work project) replaces Open Brain on the eight
--     Microsoft-port pages;
--   the three CV notes keep their career tags and lose Open Brain.
-- "ISRA testing" is renamed "Testing Hub", the work project's own name, and two
-- live notes about that testing that carried no tag get it.
--
-- The project headings:
--   Personal projects: Open Brain, Two Sides, Trips, Life Engine, The Wishing
--     Stream (moved from Home & money)
--   Work projects: COU Agentic Workflow Project, Reading Room, Testing Hub
-- Knowledge Management, a subject rather than a project, moves to AI.
--
-- And a tag can now sit under another tag (topic_headings.parent_topic), the way
-- CDD is a part of the COU project:
--   COU Agentic Workflow Project → CDD, Tideline
--   Open Brain → GUI, MCP Database, Security Improvements
--   MTTC → Communication, Public Speaking, Facilitation, Six-Week Course, Talks
--   Wishing Stream bookings → Website, Search Console
--
-- Every tag added or removed is logged in tag_change_log. Notes are named by
-- title, not id, so this reads as what it does.
alter table public.topic_headings add column if not exists parent_topic text;

with retag (title, add_tag, drop_tag) as (
  values
  ('Life Engine: what it does and how it works with Open Brain', 'Life Engine', null),
  ('Two Sides — the flashcards app', 'Two Sides', 'Open Brain'),
  ('Index of the Microsoft Port Work Artefact Set', 'Reading Room', 'Open Brain'),
  ('Effective Cold Email Strategy for AI Project Sponsorship', 'Reading Room', 'Open Brain'),
  ('Build Manual for The Reading Room', 'Reading Room', 'Open Brain'),
  ('Technical Mapping of Microsoft 365 Personal Stack', 'Reading Room', 'Open Brain'),
  ('The Missing Layer in Knowledge Management', 'Reading Room', 'Open Brain'),
  ('Life Engine on Microsoft: A Feature Review', 'Reading Room', 'Open Brain'),
  ('Reconciling Build Guide with Reference Architecture', 'Reading Room', 'Open Brain'),
  ('Understanding Vectors and Graph in Retrieval Systems', 'Reading Room', 'Open Brain'),
  ('CV — Internal application, AI Solutions Manager (final)', null, 'Open Brain'),
  ('AI Solutions Manager Competency Map Overview', null, 'Open Brain'),
  ('Critical Review of AI Solutions Manager CV', null, 'Open Brain'),
  ('Testing Results for Scoring and Criteria Management', 'Testing Hub', null),
  ('Risk assessment: early testing feedback', 'Testing Hub', null)
),
-- Projects off every note; ISRA testing becomes Testing Hub wherever it is.
by_tag as (
  select t.id, null::text as add_tag, 'Projects'::text as drop_tag from public.thoughts t where t.metadata->'topics' ? 'Projects'
  union all
  select t.id, 'Testing Hub', 'ISRA testing' from public.thoughts t where t.metadata->'topics' ? 'ISRA testing'
),
wanted as (
  select t.id, r.add_tag, r.drop_tag from public.thoughts t join retag r on r.title = t.metadata->>'title'
  union all
  select id, add_tag, drop_tag from by_tag
),
changed as (
  select w.id as thought_id, w.drop_tag as tag, 'removed' as change
  from wanted w join public.thoughts t on t.id = w.id
  where w.drop_tag is not null and t.metadata->'topics' ? w.drop_tag
  union
  select w.id, w.add_tag, 'added'
  from wanted w join public.thoughts t on t.id = w.id
  where w.add_tag is not null and not t.metadata->'topics' ? w.add_tag
),
logged as (
  insert into public.tag_change_log (thought_id, tag, change, reason)
  select thought_id, tag, change, 'projects sorted (2 Nov 2026)' from changed
  returning thought_id
)
update public.thoughts t
set metadata = jsonb_set(t.metadata, '{topics}',
  (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(t.metadata->'topics') x
    where x not in (select c.tag from changed c where c.thought_id = t.id and c.change = 'removed'))
  || coalesce((select jsonb_agg(c.tag) from changed c where c.thought_id = t.id and c.change = 'added'), '[]'::jsonb))
where t.id in (select thought_id from logged);

-- Headings for the project tags.
insert into public.topic_headings (topic, heading, source) values
  ('Two Sides', 'Personal projects', 'stewart'),
  ('Wishing Stream bookings', 'Personal projects', 'stewart'),
  ('Website', 'Personal projects', 'stewart'),
  ('Search Console', 'Personal projects', 'stewart'),
  ('Reading Room', 'Work projects', 'stewart'),
  ('Testing Hub', 'Work projects', 'stewart'),
  ('Knowledge Management', 'AI', 'stewart')
on conflict (topic) do update
  set heading = excluded.heading, source = excluded.source, updated_at = now();

-- Tags under tags.
update public.topic_headings set parent_topic = 'COU Agentic Workflow Project', updated_at = now()
  where topic in ('CDD', 'Tideline');
update public.topic_headings set parent_topic = 'Open Brain', updated_at = now()
  where topic in ('GUI', 'MCP Database', 'Security Improvements');
update public.topic_headings set parent_topic = 'MTTC', updated_at = now()
  where topic in ('Communication', 'Public Speaking', 'Facilitation', 'Six-Week Course', 'Talks');
update public.topic_headings set parent_topic = 'Wishing Stream bookings', updated_at = now()
  where topic in ('Website', 'Search Console');

-- The project names the capture step should reuse, each for a note about it.
insert into public.topic_vocabulary (topic, kind, position, note, usage) values
  ('Two Sides',    'preferred', 254, 'new 2 Nov 2026; the flashcards app', 'a note about this project: building, changing or using it.'),
  ('Trips',        'preferred', 256, 'in use before it was named; the offline trip wallet', 'a note about this project: building, changing or using it.'),
  ('Reading Room', 'preferred', 257, 'new 2 Nov 2026; the Microsoft port, a work project', 'a note about this project: building, changing or using it.'),
  ('Testing Hub',  'preferred', 258, 'renamed from ISRA testing, 2 Nov 2026; a work project', 'a note about this project: building, changing or using it.')
on conflict (topic) do nothing;
