-- "Mindfulness teacher training" and the MTTC tag are the same thing, so the
-- heading only repeated the tag one level up (Stewart, 2 Nov 2026). MTTC and
-- its course tags now sit straight under Practice:
--   Traditions → Practice → MTTC, Communication, Public Speaking, Facilitation,
--   Six-Week Course (and Talks, unused since it came off the course talks).
-- The heading's row in heading_sides is left in place, unused: no tag points
-- at it, so nothing draws it, and removing it would only make this a deletion.
update public.topic_headings
set heading = 'Practice', source = 'stewart', updated_at = now()
where heading = 'Mindfulness teacher training';
