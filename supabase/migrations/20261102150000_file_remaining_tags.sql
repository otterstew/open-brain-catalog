-- The last eleven tags with no heading, all on one or two notes (2 Nov 2026).
-- People get Family & life, beside the Family tag their bios also carry;
-- Jersey's two notes are both Lennard family history; the rentals website's
-- search log sits with the money; Trips and Project notes are on the plan for
-- the Trips app, a piece of the system.
insert into public.topic_headings (topic, heading, source) values
  ('Mum', 'Family & life', 'stewart'),
  ('Geoff', 'Family & life', 'stewart'),
  ('Tricia', 'Family & life', 'stewart'),
  ('Kea', 'Family & life', 'stewart'),
  ('Jersey', 'Family history', 'stewart'),
  ('Language', 'Ideas & society', 'stewart'),
  ('Wishing Stream bookings', 'Home & money', 'stewart'),
  ('Website', 'Home & money', 'stewart'),
  ('Search Console', 'Home & money', 'stewart'),
  ('Trips', 'Open Brain', 'stewart'),
  ('Project notes', 'Open Brain', 'stewart')
on conflict (topic) do update
  set heading = excluded.heading, source = excluded.source, updated_at = now();
