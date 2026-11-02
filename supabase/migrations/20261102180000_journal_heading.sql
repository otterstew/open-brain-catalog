-- Answers to the tag report's first run (Stewart, 2 Nov 2026).
--
-- Journal gets a heading of its own, on the personal side. Under Mind & body
-- the daily journal entries (25) and the Health notes (42) shared not a single
-- note: two kinds of thing on one shelf. The catalog's Journal view finds
-- entries by the tag, not the heading, so it is unaffected.
--
-- Open Brain and Knowledge Management sharing the Open Brain heading is fine:
-- 20 of Knowledge Management's 23 notes are Open Brain notes. Dismissed, so the
-- report stops asking.
--
-- The third finding, Six-Week Course and Talks on the same 7 notes, was a tag
-- fix rather than a schema one: Talks was taken off those notes the same day.
insert into public.heading_sides (heading, side) values ('Journal', 'personal')
on conflict (heading) do update set side = excluded.side, updated_at = now();

insert into public.topic_headings (topic, heading, source) values ('Journal', 'Journal', 'stewart')
on conflict (topic) do update
  set heading = excluded.heading, source = excluded.source, updated_at = now();

insert into public.tag_report_dismissals (finding, subject, reason) values
  ('two umbrellas', 'Open Brain', 'Knowledge Management is mostly Open Brain notes (20 of 23): a part of it, fine (2 Nov 2026)')
on conflict (finding, subject) do nothing;
