-- Who a task is for: Stewart, or Claude.
--
-- Jobs for Claude ("check there is a scheduled task to keep tags tidy") were
-- sitting in the same list as picking up medication, with nothing but the
-- wording to tell them apart. The catalog's To do list now shows only 'me';
-- Claude's queue has its own chip, and a Claude session can ask for it by
-- owner rather than guessing from titles.
--
-- A column with a default, not a project label: a task can only have one
-- project, and "review the unembedded quarter" is both Claude's job and an
-- Open Brain task. Every existing row becomes 'me', which is what they were.

alter table public.tasks
  add column if not exists owner text not null default 'me'
    check (owner in ('me', 'claude'));

create index if not exists tasks_open_owner_idx
  on public.tasks (owner)
  where status in ('inbox', 'next', 'waiting');
