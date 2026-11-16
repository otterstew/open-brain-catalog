-- Lists (16 Nov 2026): named lists Stewart makes in the catalog's Lists tab
-- (shopping, packing, to read or watch, ideas, a ranking, a plain checklist).
-- Not tasks: no due dates, never on Today, never swept. A list taken away in
-- the catalog is archived, not deleted, so it can be brought back by hand.

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null default 'checklist'
    check (kind in ('checklist', 'shopping', 'packing', 'watch', 'ideas', 'ranked')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 300),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists list_items_list_idx on public.list_items (list_id, position);

-- Only the server (service role) reads or writes them, like every other table.
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
revoke all on public.lists from anon, authenticated;
revoke all on public.list_items from anon, authenticated;
