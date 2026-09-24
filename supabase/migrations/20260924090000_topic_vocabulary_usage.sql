-- A tag can be narrower than its name. "Meditation" reads as the whole subject,
-- but here it means guided meditations only; every talk, teacher, book and
-- course note about practice belongs under Mindfulness or Buddhism. The
-- extractor sees only the tag list, so it had put Meditation on 81 notes, 16 of
-- which were guided meditations (retagged 24 Sep 2026).
--
-- `usage` is the scope rule the capture prompt shows beside the tag. It is kept
-- apart from `note`, which records why a tag was added and would only be noise
-- in the prompt. Leave it null for a tag that means what it says.
alter table public.topic_vocabulary add column if not exists usage text;

update public.topic_vocabulary
set usage = 'guided meditations only: a meditation script, practice instructions to follow, or a record of doing a guided meditation. Talks, teachers, books, course material and research about meditation take Mindfulness or Buddhism instead.',
    note  = 'in use on 4 notes before it was named; narrowed to guided meditations on 24/09/2026 (65 notes stripped, 16 kept)'
where topic = 'Meditation';
