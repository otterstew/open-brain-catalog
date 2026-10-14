-- Headings: a shelf for tags. A tag sits under one heading; a note sits under
-- every heading its tags do. Headings are for browsing the catalog and never
-- appear on a note, so nothing here changes what any note is tagged with.
--
-- Stewart decides them on the Tag Review page. Until then, a tag carries
-- Claude's suggestion with source = 'suggested', so the catalog has something to
-- show while Stewart judges whether grouping helps; applying the review overwrites
-- the row with source = 'stewart'. A tag with no row shows as "No heading".
--
-- Kept apart from topic_vocabulary on purpose: the vocabulary is the short list
-- the capture prompt is told to reuse, while every tag in use needs a heading,
-- one-offs included.
create table if not exists public.topic_headings (
  topic      text primary key,
  heading    text not null check (btrim(heading) <> ''),
  source     text not null default 'stewart' check (source in ('stewart', 'suggested')),
  updated_at timestamptz not null default now()
);

-- Same posture as thoughts and the other tag tables: reached only through the
-- edge function's service-role client, which gates on the MCP access key.
alter table public.topic_headings enable row level security;
drop policy if exists "Service role full access" on public.topic_headings;
create policy "Service role full access" on public.topic_headings
  for all using (auth.role() = 'service_role');

insert into public.topic_headings (topic, heading, source) values
  ('Mindfulness', 'Practice', 'suggested'),
  ('MTTC', 'Practice', 'suggested'),
  ('AI tools', 'AI & tools', 'suggested'),
  ('Buddhism', 'Traditions', 'suggested'),
  ('Health', 'Mind & body', 'suggested'),
  ('Open Brain', 'Open Brain', 'suggested'),
  ('Work', 'Work & career', 'suggested'),
  ('COU Agentic Workflow Project', 'Work & career', 'suggested'),
  ('CDD', 'Work & career', 'suggested'),
  ('GUI', 'Open Brain', 'suggested'),
  ('MCP Database', 'Open Brain', 'suggested'),
  ('Projects', 'Open Brain', 'suggested'),
  ('Knowledge Management', 'Open Brain', 'suggested'),
  ('Author', 'People', 'suggested'),
  ('Communication', 'Work & career', 'suggested'),
  ('AI Solutions Manager', 'Work & career', 'suggested'),
  ('Technology', 'AI & tools', 'suggested'),
  ('Teacher', 'People', 'suggested'),
  ('Automation', 'AI & tools', 'suggested'),
  ('Meditation', 'Practice', 'suggested'),
  ('Career Development', 'Work & career', 'suggested'),
  ('Public Speaking', 'Work & career', 'suggested'),
  ('Nonduality', 'Traditions', 'suggested'),
  ('Workflow', 'Work & career', 'suggested'),
  ('Journal', 'Mind & body', 'suggested'),
  ('Spirituality', 'Traditions', 'suggested'),
  ('AI Agents', 'AI & tools', 'suggested'),
  ('Book', 'Reading', 'suggested'),
  ('Poetry', 'Reading', 'suggested'),
  ('Science', 'Reading', 'suggested'),
  ('Talks', 'Practice', 'suggested'),
  ('AI Skills', 'AI & tools', 'suggested'),
  ('Claude', 'AI & tools', 'suggested'),
  ('Literature', 'Reading', 'suggested'),
  ('Facilitation', 'Practice', 'suggested'),
  ('Task management', 'Work & career', 'suggested'),
  ('Zen', 'Traditions', 'suggested'),
  ('Team Collaboration', 'Work & career', 'suggested'),
  ('Theravada', 'Traditions', 'suggested'),
  ('Choice', 'Reading', 'suggested'),
  ('Client: Change Team', 'Work & career', 'suggested'),
  ('Ethics', 'Traditions', 'suggested'),
  ('Mental Health', 'Mind & body', 'suggested'),
  ('Psychology', 'Mind & body', 'suggested'),
  ('Anger', 'Mind & body', 'suggested'),
  ('Client: Business Services', 'Work & career', 'suggested'),
  ('Consciousness', 'Mind & body', 'suggested'),
  ('Ecology', 'Reading', 'suggested'),
  ('Emotions', 'Mind & body', 'suggested'),
  ('Essay', 'Reading', 'suggested'),
  ('Finance', 'Home & money', 'suggested'),
  ('Life Engine', 'Open Brain', 'suggested'),
  ('Memory Systems', 'AI & tools', 'suggested'),
  ('Neuroscience', 'Mind & body', 'suggested'),
  ('Psychedelics', 'Mind & body', 'suggested'),
  ('Testing', 'Work & career', 'suggested'),
  ('Tideline', 'Work & career', 'suggested'),
  ('chemical signalling', 'Reading', 'suggested'),
  ('plants', 'Reading', 'suggested'),
  ('prompts', 'AI & tools', 'suggested'),
  ('social connection', 'Mind & body', 'suggested'),
  ('AI image generation', 'AI & tools', 'suggested'),
  ('Alchemy', 'Reading', 'suggested'),
  ('Anxiety', 'Mind & body', 'suggested'),
  ('ChatGPT', 'AI & tools', 'suggested'),
  ('CoPilot', 'AI & tools', 'suggested'),
  ('Codex', 'AI & tools', 'suggested'),
  ('Compassion', 'Traditions', 'suggested'),
  ('Emptiness', 'Traditions', 'suggested'),
  ('Endocrine System', 'Mind & body', 'suggested'),
  ('Google Workspace', 'AI & tools', 'suggested'),
  ('Insight', 'Traditions', 'suggested'),
  ('Microsoft Architecture', 'AI & tools', 'suggested'),
  ('OpenClaw', 'AI & tools', 'suggested'),
  ('Personal Finance', 'Home & money', 'suggested'),
  ('Reading List', 'Reading', 'suggested'),
  ('Reality', 'Traditions', 'suggested'),
  ('Relationships', 'Mind & body', 'suggested'),
  ('Rosie', 'Home & money', 'suggested'),
  ('Security Improvements', 'Open Brain', 'suggested'),
  ('Stress', 'Mind & body', 'suggested'),
  ('Work Management', 'Work & career', 'suggested')
on conflict (topic) do nothing;
