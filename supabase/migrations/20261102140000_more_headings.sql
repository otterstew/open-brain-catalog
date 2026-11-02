-- Three headings split out of crowded ones, and one-off tags given a home
-- (Stewart, 2 Nov 2026). Same pattern as AI products: siblings, not a third
-- level, and no note's tags change.
--
-- Family history: thirty-odd notes on the ancestors (Family History,
-- Cammaerts, Lennard, Koekoek, the wars, DNA) had no heading at all and showed
-- as "Not grouped yet". Morpurgo family moves in from Family & life: its notes
-- are the family tree and the forebears' bios, 11 of 16 already tagged Family
-- History.
--
-- Mindfulness teacher training: all 124 MTTC notes also carry Mindfulness, and
-- every Communication, Public Speaking, Facilitation and Talks note is course
-- material (The Art of Speaking, the six-week course talks). Under Practice
-- they buried the notes about Stewart's own practice; Practice keeps
-- Mindfulness and Meditation.
--
-- Work projects: all 33 CDD notes are the COU Agentic Workflow Project's
-- Jersey toolkit, and Tideline is that project's prototype. Work & career
-- keeps the career, client, team and ways-of-working tags, Testing among them
-- (one of its three notes is not COU).
insert into public.heading_sides (heading, side) values
  ('Family history', 'personal'),
  ('Mindfulness teacher training', 'personal'),
  ('Work projects', 'work')
on conflict (heading) do update set side = excluded.side, updated_at = now();

insert into public.topic_headings (topic, heading, source) values
  ('Family History', 'Family history', 'stewart'),
  ('Morpurgo family', 'Family history', 'stewart'),
  ('Cammaerts family', 'Family history', 'stewart'),
  ('Lennard family', 'Family history', 'stewart'),
  ('Koekoek family', 'Family history', 'stewart'),
  ('World War I', 'Family history', 'stewart'),
  ('World War II', 'Family history', 'stewart'),
  ('DNA', 'Family history', 'stewart'),
  ('MTTC', 'Mindfulness teacher training', 'stewart'),
  ('Communication', 'Mindfulness teacher training', 'stewart'),
  ('Public Speaking', 'Mindfulness teacher training', 'stewart'),
  ('Facilitation', 'Mindfulness teacher training', 'stewart'),
  ('Talks', 'Mindfulness teacher training', 'stewart'),
  ('Six-Week Course', 'Mindfulness teacher training', 'stewart'),
  ('COU Agentic Workflow Project', 'Work projects', 'stewart'),
  ('CDD', 'Work projects', 'stewart'),
  ('Tideline', 'Work projects', 'stewart'),
  -- One-off science tags that had no heading.
  ('Astrophysics', 'Science and Nature', 'stewart'),
  ('Light', 'Science and Nature', 'stewart'),
  ('Wave-Particle Duality', 'Science and Nature', 'stewart'),
  ('Electromagnetic Spectrum', 'Science and Nature', 'stewart'),
  ('History of Science', 'Science and Nature', 'stewart')
on conflict (topic) do update
  set heading = excluded.heading, source = excluded.source, updated_at = now();
