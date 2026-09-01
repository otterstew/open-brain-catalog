-- Ten terms the archive was already filing by, now said out loud.
--
-- These came off untidy_topics: tags in real use — GUI and MCP Database on nine
-- notes each, OpenBrain Mobile App on seven — with no decision recorded about
-- them anywhere. The extractor kept reaching for them without ever being told
-- they were wanted, which is the same coining behaviour that produced twelve
-- variants of "AI", except that here it kept arriving at the same word. That is
-- the signal a term belongs in the vocabulary rather than in the fold map.
--
-- Existing positions are multiplied by ten first. The order is curated so that
-- related terms sit next to each other in the prompt, and there was no room
-- between consecutive integers to put anything; spacing them out preserves the
-- existing sequence exactly while leaving somewhere for these to go. Future
-- additions have room too.

update public.topic_vocabulary set position = position * 10;

insert into public.topic_vocabulary (topic, kind, position, note) values
  -- The clients work gets done for, beside the career cluster rather than
  -- inside it: who the work is for is a different axis from what the role is.
  ('Client: Business Services', 'preferred', 222, 'in use on 2 notes before it was named'),
  ('Client: Change Team',       'preferred', 224, 'in use on 3 notes before it was named'),

  -- The system's own parts, following "Open Brain" at 260. These are the tags
  -- that separate a note about the catalog's interface from one about its
  -- database, which is a distinction worth keeping sharp.
  ('GUI',                       'preferred', 262, 'in use on 9 notes before it was named'),
  ('MCP Database',              'preferred', 264, 'in use on 9 notes before it was named'),
  ('OpenBrain Mobile App',      'preferred', 266, 'in use on 7 notes before it was named'),
  ('Life Engine',               'preferred', 268, 'in use on 2 notes; the scheduler half of the system'),

  -- The life outside the build, after the science cluster ends at 290. An
  -- archive that can only describe its owner's work describes half of him.
  ('Health',                    'preferred', 300, 'in use on 3 notes before it was named'),
  ('Meditation',                'preferred', 310, 'in use on 4 notes before it was named'),
  ('Buddhism',                  'preferred', 320, 'in use on 3 notes before it was named'),
  ('Finance',                   'preferred', 330, 'in use on 2 notes before it was named')
on conflict (topic) do nothing;
