-- The MTTC course as one source (Stewart, 2 Nov 2026).
--
-- The course had been filed under 20 sources: one per month's talk series, one
-- per intensive weekend's session summaries, and the Guidelines, Art of
-- Speaking, Preparation and the rest — 115 notes. On the Map that made 20 small
-- dots, only two of which were big enough to be named, and in Explore twenty
-- names for one course. Every title already says where in the course the note
-- belongs ("MTTC Month 4, Session 1 (recorded) — …", "MTTC Month 4, Resource
-- 1 — …"), so the source names carried nothing the titles do not.
--
-- Each note's old source name is kept in source_merge_log first, so the merge
-- can be undone note by note. Same posture as the similar-link log: written by
-- the service role only, no policy needed.
create table if not exists public.source_merge_log (
  thought_id  uuid not null,
  old_source  text not null,
  new_source  text not null,
  merged_at   timestamptz not null default now()
);
alter table public.source_merge_log enable row level security;

insert into public.source_merge_log (thought_id, old_source, new_source)
select id, metadata->>'source_name', 'MTTC — Mindfulness Teacher Training Course'
from public.thoughts
where btrim(metadata->>'source_name') ilike 'MTTC%'
  and btrim(metadata->>'source_name') <> 'MTTC — Mindfulness Teacher Training Course';

update public.thoughts
set metadata = jsonb_set(metadata, '{source_name}', to_jsonb('MTTC — Mindfulness Teacher Training Course'::text))
where btrim(metadata->>'source_name') ilike 'MTTC%'
  and btrim(metadata->>'source_name') <> 'MTTC — Mindfulness Teacher Training Course';
