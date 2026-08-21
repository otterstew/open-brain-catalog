-- Tasks get their own table rather than living in thoughts.metadata.
--
-- A thought is queried by meaning: what did I read about X. A task is queried
-- by state and date, on every single load — what is due, what is deferred,
-- what is still open. That wants columns and indexes, not a jsonb blob, and it
-- wants constraints so a typo in one client cannot quietly invent a sixth
-- status that every other client then fails to render.
--
-- The link back to thoughts is the point of keeping tasks here instead of in a
-- shop-bought app: a task can name the note it came out of.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),

  -- The one line you would say out loud. Everything else is optional.
  title text not null check (length(btrim(title)) > 0),
  notes text,

  -- inbox    captured, not yet thought about
  -- next     decided on, actionable now
  -- waiting  blocked on someone else
  -- done     finished
  -- dropped  deliberately not doing it — kept, because deciding not to do
  --          something is information, and deleting it invites the thought back
  status text not null default 'inbox'
    check (status in ('inbox', 'next', 'waiting', 'done', 'dropped')),

  -- A flat string, not a projects table. Projects here are a label you group
  -- by; they have no fields of their own until they earn some.
  project text,

  due_date date,

  -- The field homegrown task managers skip and rebuild six months later.
  -- Without it every task you have ever had is in your face forever, and you
  -- stop opening the app.
  defer_until date,

  -- Deliberately a free-text phrase ('every 2 weeks', 'first monday'), not an
  -- RRULE. Recurrence is resolved when a task is completed, not by a calendar
  -- engine, so this only has to be readable by whatever does the resolving.
  recur text,
  -- Whether the next instance counts from the old due date (bins go out every
  -- Tuesday whether or not I did it) or from when it was actually completed
  -- (water the plants 5 days after I last watered them).
  recur_from text not null default 'completion'
    check (recur_from in ('due', 'completion')),

  -- Subtasks. Cascading is right: a subtask has no meaning without its parent.
  parent_id uuid references public.tasks(id) on delete cascade,

  -- The note this came out of, if any. Set null rather than cascade — losing
  -- the source note is no reason to lose the task.
  thought_id uuid references public.thoughts(id) on delete set null,

  -- Where it was captured, for working out later which surfaces actually get
  -- used and which were built for nobody.
  source text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- The two queries every load runs: what is open and due, what is open and
-- hidden until later. Partial on the open statuses, because done and dropped
-- rows accumulate forever and are never in either answer.
create index if not exists tasks_open_due_idx
  on public.tasks (due_date, created_at)
  where status in ('inbox', 'next', 'waiting');

create index if not exists tasks_open_defer_idx
  on public.tasks (defer_until)
  where status in ('inbox', 'next', 'waiting');

create index if not exists tasks_project_idx
  on public.tasks (project) where project is not null;

create index if not exists tasks_parent_idx
  on public.tasks (parent_id) where parent_id is not null;

create index if not exists tasks_thought_idx
  on public.tasks (thought_id) where thought_id is not null;

-- updated_at and completed_at are maintained here rather than by callers, so
-- that a client which forgets cannot leave the row lying about its own state.
-- completed_at tracks the transition, not the value: re-saving a done task
-- does not move its completion date, and reopening one clears it.
create or replace function public.tasks_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  -- On insert there is no previous status to compare against, so a task
  -- created already finished (a backfill, or ticking something off you had
  -- never written down) is stamped as completed now unless the caller supplied
  -- a real date it happened.
  if tg_op = 'INSERT' then
    if new.status = 'done' and new.completed_at is null then
      new.completed_at := now();
    elsif new.status <> 'done' then
      new.completed_at := null;
    end if;
  elsif new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_touch_trigger on public.tasks;
create trigger tasks_touch_trigger
  before insert or update on public.tasks
  for each row execute function public.tasks_touch();

-- Same posture as thoughts: nothing reaches this table except through the
-- edge function's service-role client, which gates on the MCP access key.
alter table public.tasks enable row level security;

drop policy if exists "Service role full access" on public.tasks;
create policy "Service role full access" on public.tasks
  for all using (auth.role() = 'service_role');
