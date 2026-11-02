-- AI products: the named things you use (Claude, ChatGPT, Codex, CoPilot,
-- OpenClaw) get a heading of their own, beside AI & tools on the Work & AI
-- side. Under AI & tools they hung alongside subjects like Automation and
-- Technology, which are what a note is about rather than what it was done
-- with (Stewart, 2 Nov 2026). A sibling heading rather than a level beneath
-- AI & tools: a third level would be one more tap on a phone for six tags.
--
-- Not "Models": these are products; the models are GPT-5, Claude Opus and
-- the like, and OpenClaw is an agent that runs on top of one.
insert into public.heading_sides (heading, side) values ('AI products', 'work')
on conflict (heading) do update set side = excluded.side, updated_at = now();

insert into public.topic_headings (topic, heading, source) values
  ('Claude', 'AI products', 'stewart'),
  ('ChatGPT', 'AI products', 'stewart'),
  ('Codex', 'AI products', 'stewart'),
  ('CoPilot', 'AI products', 'stewart'),
  ('OpenClaw', 'AI products', 'stewart')
on conflict (topic) do update
  set heading = excluded.heading, source = excluded.source, updated_at = now();
