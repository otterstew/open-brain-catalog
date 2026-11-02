-- The Wishing Stream and Wishing Stream bookings are two projects (Stewart,
-- 2 Nov 2026): "The Wishing Stream" is the business's website, and "Wishing
-- Stream bookings" is the CRM app behind it. The website's tags (Website,
-- Search Console) had been put under the bookings app; they move under the new
-- website tag, and so does the weekly search-figures log, the one note in the
-- reading list about the site. The bookings system's changelog entries keep
-- their tag: they are system notes, and the System directory finds that
-- system's changelog by it.
insert into public.topic_headings (topic, heading, source) values ('The Wishing Stream', 'Personal projects', 'stewart')
on conflict (topic) do update set heading = excluded.heading, source = excluded.source, updated_at = now();

update public.topic_headings set parent_topic = 'The Wishing Stream', updated_at = now()
  where topic in ('Website', 'Search Console');

insert into public.topic_vocabulary (topic, kind, position, note, usage) values
  ('The Wishing Stream', 'preferred', 259, 'new 2 Nov 2026; the business website',
   'the business and its website, thewishingstream.com: its pages, search figures and listings. The booking and guest app is Wishing Stream bookings.')
on conflict (topic) do nothing;

with target as (
  select id from public.thoughts
  where metadata->>'title' = 'Website search figures — weekly log'
    and metadata->'topics' ? 'Wishing Stream bookings'
), logged as (
  insert into public.tag_change_log (thought_id, tag, change, reason)
  select id, 'Wishing Stream bookings', 'removed', 'the website, not the bookings app (2 Nov 2026)' from target
  union all
  select id, 'The Wishing Stream', 'added', 'the website, not the bookings app (2 Nov 2026)' from target
  returning thought_id
)
update public.thoughts t
set metadata = jsonb_set(t.metadata, '{topics}',
  (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(t.metadata->'topics') x where x <> 'Wishing Stream bookings')
  || '["The Wishing Stream"]'::jsonb)
where t.id in (select thought_id from logged);
