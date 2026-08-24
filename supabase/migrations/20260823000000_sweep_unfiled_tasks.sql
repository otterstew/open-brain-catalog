-- The bridge between a captured note and a task you will actually be shown.
--
-- capture_thought and create_task are deliberately separate: capture runs an
-- AI extraction and an embedding, create_task is one insert, and merging them
-- would put a model on the hot path of every task you jot down. The cost of
-- that separation is that a note the extractor typed as a task lands in
-- thoughts and stops there. It is findable by meaning and by nothing else,
-- which is not a reminder — a note asking to be nudged in September only
-- surfaces if you search for it in September, by which time you did not need
-- reminding.
--
-- Until now the gap was closed by hand: a person reading thoughts and calling
-- create_task. That works right up until the note arrives twenty minutes after
-- the person stopped looking, which is exactly how "remind me to catch up with
-- Sach" was captured perfectly and then never surfaced again.
--
-- So: a nightly sweep. It files anything the extractor already called a task,
-- and it does the filing in SQL rather than through the edge function, because
-- a sweep that depends on the MCP access key breaks silently the next time
-- that key is rotated.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- The ledger of what the sweep has already thought about.
--
-- The obvious test — "has this thought got a task?" — is wrong, because it
-- un-answers itself. Delete a task the sweep filed and it comes straight back
-- tomorrow, and there is no way to tell the sweep no. Recording the decision
-- rather than re-deriving it means a thought is considered exactly once, and
-- deleting the task it produced is a decision that sticks.
--
-- It is kept here rather than as a flag in thoughts.metadata so the sweep
-- never writes to thoughts at all: metadata is the note's own record, and
-- housekeeping has no business leaving marks in it or bumping its updated_at.
create table if not exists public.task_sweeps (
  thought_id uuid primary key references public.thoughts(id) on delete cascade,

  -- Null when the sweep decided not to file, and null again if the task it
  -- filed is later deleted. Either way the row survives, which is the point:
  -- the ledger records that a decision was made, not what became of it.
  task_id uuid references public.tasks(id) on delete set null,

  -- filed          the sweep created the task
  -- already_filed  a task already pointed at this note, so the sweep left it
  --                alone and recorded that it had looked
  outcome text not null check (outcome in ('filed', 'already_filed')),

  swept_at timestamptz not null default now()
);

create index if not exists task_sweeps_swept_at_idx
  on public.task_sweeps (swept_at desc);

alter table public.task_sweeps enable row level security;

drop policy if exists "Service role full access" on public.task_sweeps;
create policy "Service role full access" on public.task_sweeps
  for all using (auth.role() = 'service_role');

-- File every thought the extractor typed as a task and the sweep has not seen.
--
-- Returns one row per thought considered, so a dry run reads as a proposal and
-- a real run reads as a receipt. Deliberately does nothing clever: no model, no
-- second guess at whether something is "really" a task. The judgement already
-- happened at capture, when a model with the full text in front of it wrote
-- type = 'task'. Re-litigating that here would only add a way to be wrong.
create or replace function public.sweep_unfiled_tasks(
  p_dry_run boolean default false,
  p_limit   integer default 25
)
returns table (
  thought_id  uuid,
  outcome     text,
  task_id     uuid,
  title       text,
  defer_until date
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r         record;
  v_title   text;
  v_notes   text;
  v_defer   date;
  v_task_id uuid;
  v_outcome text;
begin
  for r in
    select t.id, t.content, t.created_at, t.metadata
    from public.thoughts t
    where t.metadata->>'type' = 'task'
      and not exists (
        select 1 from public.task_sweeps s where s.thought_id = t.id
      )
    order by t.created_at
    limit greatest(coalesce(p_limit, 25), 0)
  loop
    v_task_id := null;
    v_title   := null;
    v_defer   := null;

    select k.id into v_task_id
    from public.tasks k
    where k.thought_id = r.id
    order by k.created_at
    limit 1;

    if v_task_id is not null then
      -- Filed by hand before the sweep existed, or by a person since. Ledger
      -- it so it is never looked at again, and change nothing.
      v_outcome := 'already_filed';
    else
      -- The extractor writes action_items as imperatives ("Give Geoff a
      -- shout"), which is already the sentence you would say out loud. The
      -- note's title is a headline rather than an instruction, so it is only
      -- the fallback, and the content itself the fallback of last resort.
      v_title := nullif(btrim(coalesce(
        r.metadata->'action_items'->>0,
        r.metadata->>'title',
        left(regexp_replace(r.content, '\s+', ' ', 'g'), 80)
      )), '');

      -- Nothing usable to call it. Left out of the ledger on purpose: if the
      -- note is ever given a title it becomes filable, and until then it
      -- reappears in every dry run instead of disappearing quietly.
      continue when v_title is null;

      -- The earliest future date the note mentions is when it can first be
      -- acted on, so it becomes a defer date and the task stays out of the way
      -- until then. Dates already past are the note talking about history.
      --
      -- No due date, ever. "Remind me in a couple of weeks" is not a deadline,
      -- and a sweep that invents deadlines teaches you to ignore them.
      if jsonb_typeof(r.metadata->'dates_mentioned') = 'array' then
        select min(d.val) into v_defer
        from (
          select e.raw::date as val
          from jsonb_array_elements_text(r.metadata->'dates_mentioned') as e(raw)
          where e.raw ~ '^\d{4}-\d{2}-\d{2}$'
        ) d
        where d.val > current_date;
      end if;

      v_notes := 'Filed by the nightly sweep from the note "'
        || coalesce(r.metadata->>'title', '(untitled)')
        || '" captured ' || to_char(r.created_at, 'YYYY-MM-DD')
        || '. The sweep files notes the extractor typed as tasks; it does not '
        || 'read them. The note itself has the context.';

      v_outcome := 'filed';

      if not p_dry_run then
        insert into public.tasks (title, notes, status, defer_until, thought_id, source)
        values (v_title, v_notes, 'inbox', v_defer, r.id, 'sweep')
        returning id into v_task_id;
      end if;
    end if;

    if not p_dry_run then
      insert into public.task_sweeps (thought_id, task_id, outcome)
      values (r.id, v_task_id, v_outcome);
    end if;

    thought_id  := r.id;
    outcome     := v_outcome;
    task_id     := v_task_id;
    title       := v_title;
    defer_until := v_defer;
    return next;
  end loop;
end;
$fn$;

-- security definer is what lets pg_cron run this as a job owner that is not
-- service_role, so the grant has to be closed back down by hand — the default
-- execute-for-all on a definer function in a PostgREST-exposed schema is a way
-- in for anon.
revoke all on function public.sweep_unfiled_tasks(boolean, integer) from public;
revoke all on function public.sweep_unfiled_tasks(boolean, integer) from anon;
revoke all on function public.sweep_unfiled_tasks(boolean, integer) from authenticated;
grant execute on function public.sweep_unfiled_tasks(boolean, integer) to service_role;
grant execute on function public.sweep_unfiled_tasks(boolean, integer) to postgres;

-- 05:30 UTC daily: after anything captured last thing at night, before any
-- morning brief goes looking for the task list. Unscheduled first so that
-- re-running this migration moves the job rather than duplicating it.
select cron.unschedule('sweep-unfiled-tasks')
where exists (select 1 from cron.job where jobname = 'sweep-unfiled-tasks');

select cron.schedule(
  'sweep-unfiled-tasks',
  '30 5 * * *',
  $job$select public.sweep_unfiled_tasks();$job$
);

notify pgrst, 'reload schema';
