-- Tests for the nightly sweep (see migration 20260823000000).
--
-- Not run by CI: the deploy workflow holds a token for deploying edge
-- functions and no database credentials, so there is nothing in GitHub Actions
-- that can reach Postgres. Run it by hand after touching the sweep — paste it
-- into the Supabase SQL editor, or psql -f — and it either prints one success
-- line or raises.
--
-- Everything happens inside a transaction that is rolled back, so it is safe to
-- run against the live database and leaves no test rows behind.

begin;

do $test$
declare
  t_future  uuid := '00000000-0000-4000-8000-00000000f001';
  t_nodate  uuid := '00000000-0000-4000-8000-00000000f002';
  t_pastdue uuid := '00000000-0000-4000-8000-00000000f003';
  t_titled  uuid := '00000000-0000-4000-8000-00000000f004';
  t_taken   uuid := '00000000-0000-4000-8000-00000000f005';
  t_notask  uuid := '00000000-0000-4000-8000-00000000f006';
  r         record;
  n         integer;
  v_task    uuid;
begin
  -- A note whose dates straddle today: the future one is the defer date, the
  -- past one is the note talking about history and must be ignored.
  insert into public.thoughts (id, content, metadata) values (
    t_future, 'Reminder: ring the plumber in a few weeks.',
    '{"type":"task","title":"Ring The Plumber",
      "action_items":["Ring the plumber"],
      "dates_mentioned":["2099-10-01","2001-01-01"]}'::jsonb);

  -- No dates at all: files with no defer date, and no due date either.
  insert into public.thoughts (id, content, metadata) values (
    t_nodate, 'Reminder: sort out the shed.',
    '{"type":"task","title":"Sort The Shed","action_items":["Sort out the shed"],
      "dates_mentioned":[]}'::jsonb);

  -- Every date already past: nothing to defer to, so it is actionable now.
  insert into public.thoughts (id, content, metadata) values (
    t_pastdue, 'Reminder: chase the invoice.',
    '{"type":"task","title":"Chase The Invoice","action_items":["Chase the invoice"],
      "dates_mentioned":["2001-01-01","2002-02-02"]}'::jsonb);

  -- No action_items, so the title is the fallback for the task name.
  insert into public.thoughts (id, content, metadata) values (
    t_titled, 'Some note the extractor typed as a task but drew no actions from.',
    '{"type":"task","title":"Fallback To The Title","action_items":[]}'::jsonb);

  -- Already has a task filed by hand: must be ledgered, not duplicated.
  insert into public.thoughts (id, content, metadata) values (
    t_taken, 'Reminder: already dealt with by a person.',
    '{"type":"task","title":"Already Filed","action_items":["Do the thing"]}'::jsonb);
  insert into public.tasks (title, thought_id, source)
    values ('Filed by hand', t_taken, 'test');

  -- Not typed as a task, so the sweep must never touch it.
  insert into public.thoughts (id, content, metadata) values (
    t_notask, 'An article I read about plumbing.',
    '{"type":"reference","title":"An Article","action_items":["Read it again"]}'::jsonb);

  ------------------------------------------------------------------
  -- A dry run proposes but writes nothing.
  ------------------------------------------------------------------
  select count(*) into n from public.sweep_unfiled_tasks(p_dry_run => true);
  if n < 5 then
    raise exception 'dry run considered % notes, expected at least 5', n;
  end if;

  select count(*) into n from public.task_sweeps
   where thought_id in (t_future, t_nodate, t_pastdue, t_titled, t_taken);
  if n <> 0 then
    raise exception 'dry run wrote % ledger rows, expected 0', n;
  end if;

  -- Scoped to the fixtures on purpose: the live archive already holds tasks
  -- the real sweep filed, and counting those would fail here for no reason.
  select count(*) into n from public.tasks
   where thought_id in (t_future, t_nodate, t_pastdue, t_titled);
  if n <> 0 then
    raise exception 'dry run created % tasks, expected 0', n;
  end if;

  ------------------------------------------------------------------
  -- The real run.
  ------------------------------------------------------------------
  perform public.sweep_unfiled_tasks();

  -- Future date becomes the defer date; the past date is ignored.
  select * into r from public.tasks where thought_id = t_future;
  if r.title <> 'Ring the plumber' then
    raise exception 'expected the action item as the title, got "%"', r.title;
  end if;
  if r.defer_until <> date '2099-10-01' then
    raise exception 'expected defer 2099-10-01, got %', r.defer_until;
  end if;
  if r.due_date is not null then
    raise exception 'the sweep must never set a due date, got %', r.due_date;
  end if;
  if r.status <> 'inbox' or r.source <> 'sweep' then
    raise exception 'expected inbox/sweep, got %/%', r.status, r.source;
  end if;

  select * into r from public.tasks where thought_id = t_nodate;
  if r.defer_until is not null then
    raise exception 'no dates mentioned should mean no defer date, got %', r.defer_until;
  end if;

  select * into r from public.tasks where thought_id = t_pastdue;
  if r.defer_until is not null then
    raise exception 'only-past dates should mean no defer date, got %', r.defer_until;
  end if;

  -- Falls back to the note title when there are no action items.
  select * into r from public.tasks where thought_id = t_titled;
  if r.title <> 'Fallback To The Title' then
    raise exception 'expected the note title as fallback, got "%"', r.title;
  end if;

  -- The hand-filed one is recorded as seen, and not duplicated.
  select count(*) into n from public.tasks where thought_id = t_taken;
  if n <> 1 then
    raise exception 'expected the hand-filed note to keep 1 task, got %', n;
  end if;
  select outcome into r from public.task_sweeps where thought_id = t_taken;
  if r.outcome <> 'already_filed' then
    raise exception 'expected already_filed, got %', r.outcome;
  end if;

  -- A note that is not typed as a task is invisible to the sweep.
  select count(*) into n from public.task_sweeps where thought_id = t_notask;
  if n <> 0 then
    raise exception 'the sweep ledgered a non-task note';
  end if;
  select count(*) into n from public.tasks where thought_id = t_notask;
  if n <> 0 then
    raise exception 'the sweep filed a non-task note';
  end if;

  ------------------------------------------------------------------
  -- Running twice does nothing the second time.
  ------------------------------------------------------------------
  select count(*) into n from public.sweep_unfiled_tasks();
  if n <> 0 then
    raise exception 'second sweep considered % notes, expected 0', n;
  end if;

  ------------------------------------------------------------------
  -- Deleting a task the sweep filed is a decision that sticks.
  ------------------------------------------------------------------
  select id into v_task from public.tasks where thought_id = t_future;
  delete from public.tasks where id = v_task;

  select * into r from public.task_sweeps where thought_id = t_future;
  if r.outcome <> 'filed' or r.task_id is not null then
    raise exception 'ledger row should survive the delete with task_id nulled, got outcome=% task_id=%',
      r.outcome, r.task_id;
  end if;

  select count(*) into n from public.sweep_unfiled_tasks();
  if n <> 0 then
    raise exception 'the sweep resurrected a deliberately deleted task';
  end if;

  ------------------------------------------------------------------
  -- Deleting the note takes its ledger row with it.
  ------------------------------------------------------------------
  delete from public.thoughts where id = t_nodate;
  select count(*) into n from public.task_sweeps where thought_id = t_nodate;
  if n <> 0 then
    raise exception 'ledger row outlived its thought';
  end if;

  raise notice 'sweep_unfiled_tasks: all assertions passed';
end;
$test$;

rollback;
