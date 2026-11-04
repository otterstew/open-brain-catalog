-- Photos inside notes (4 Nov 2026). A private bucket: no public reads, no
-- policies for anon or authenticated users. Only the open-brain-mcp function,
-- with the service role, uploads and signs short-lived links (see photos.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-photos', 'note-photos', false, 6000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
