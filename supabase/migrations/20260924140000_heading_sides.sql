-- Which side of the catalog each heading belongs to: Stewart's own reading and
-- life ('personal') or work, AI and the machinery of Open Brain ('work'). The
-- catalog's Everything / Personal / Work & AI switch filters on it; a note
-- shows on a side if any of its tags sits under a heading on that side, so a
-- note that spans both shows on both. A heading with no row shows on both.
create table if not exists public.heading_sides (
  heading    text primary key,
  side       text not null check (side in ('personal', 'work')),
  updated_at timestamptz not null default now()
);

alter table public.heading_sides enable row level security;
drop policy if exists "Service role full access" on public.heading_sides;
create policy "Service role full access" on public.heading_sides
  for all using (auth.role() = 'service_role');

insert into public.heading_sides (heading, side) values
  ('Practice', 'personal'), ('Traditions', 'personal'), ('Themes', 'personal'),
  ('People', 'personal'), ('Mind & body', 'personal'), ('Books & Writing', 'personal'),
  ('Science and Nature', 'personal'), ('Home & money', 'personal'),
  ('Work & career', 'work'), ('AI & tools', 'work'), ('Open Brain', 'work')
on conflict (heading) do nothing;
