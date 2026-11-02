-- The AI products the archive keeps writing about, named in the vocabulary so
-- the capture step tags them. Under AI tools alone, Claude came up in 35 of
-- its 61 notes, Copilot in 30 and ChatGPT in 24, yet only 2, 1 and 1 carried
-- the tag (2 Nov 2026). ChatGPT and Codex were already listed; Claude,
-- CoPilot, Gemini and OpenClaw join them, between them at 240-252.
--
-- Each gets the same scope rule, because the danger runs the other way too:
-- most notes here were made with Claude's help and many link to claude.ai, and
-- a tag on every one of them would say nothing. A product tag is for a note
-- about the product.
insert into public.topic_vocabulary (topic, kind, position, note) values
  ('Claude',   'preferred', 242, 'in use on 2 notes before it was named; Anthropic''s assistant, Claude Code included'),
  ('CoPilot',  'preferred', 244, 'in use on 1 note before it was named; Microsoft 365 or GitHub Copilot'),
  ('Gemini',   'preferred', 246, 'new 2 Nov 2026; Google''s assistant'),
  ('OpenClaw', 'preferred', 252, 'in use on 1 note before it was named; the open-source agent')
on conflict (topic) do nothing;

update public.topic_vocabulary
set usage = 'only a note about this product itself: using it, setting it up, its features, or news about it. Not a note that mentions it in passing, lists it among other tools, links to it, or was written with its help.'
where topic in ('Claude', 'ChatGPT', 'Codex', 'CoPilot', 'Gemini', 'OpenClaw');

-- Gemini sits with the other products.
insert into public.topic_headings (topic, heading, source) values ('Gemini', 'AI products', 'stewart')
on conflict (topic) do update set heading = excluded.heading, source = excluded.source, updated_at = now();
