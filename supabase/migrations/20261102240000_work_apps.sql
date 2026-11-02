-- The work apps under Work projects (Stewart, 2 Nov 2026): AI Desk, BA
-- Toolkit, One Side and Prep Deck join Tideline (under the COU project),
-- Reading Room and Testing Hub; Two Sides moves here from Personal projects.
-- Prep Deck is named as its page is titled, so "prep" on its own is never
-- taken for meeting preparation.
--
-- The CRM keeps its tag, "Wishing Stream bookings", under Personal projects:
-- the app is called Wishing Stream Owner, but the tag is only on the bookings
-- system's changelog entries, and the Monday System directory finds that
-- system's changelog by it.
insert into public.topic_headings (topic, heading, source) values
  ('Two Sides', 'Work projects', 'stewart'),
  ('AI Desk', 'Work projects', 'stewart'),
  ('BA Toolkit', 'Work projects', 'stewart'),
  ('One Side', 'Work projects', 'stewart'),
  ('Prep Deck', 'Work projects', 'stewart')
on conflict (topic) do update
  set heading = excluded.heading, source = excluded.source, updated_at = now();
