-- Sprint 7 Agent 3 — observe + reengage support
--
-- Three additions, all idempotent:
--
-- 1. observations.category — diagnostic label emitted by /api/observe:
--    'avoidance' | 'pattern' | 'contradiction' | 'strength'. Nullable so the
--    existing rows (which only have confidence) keep validating. New rows
--    written by /api/observe always set this; legacy [OBSERVATION] sentinel
--    rows from /api/reid keep using confidence only.
--
-- 2. observations.confidence — relax the NOT NULL so /api/observe (which
--    doesn't emit confidence) can insert rows with category only. Existing
--    rows are untouched. The CHECK stays so any value present must be one of
--    low/medium/high.
--
-- 3. users.last_reengage_email_at — debounce column for the daily re-engage
--    cron. NULL means we've never sent a re-engage email to this user.
--
-- 4. users.onboarding_task_completed_at — when the founder ticks off the
--    onboarding task in /tasks. Used by /tasks to render the done state
--    cross-device, and by /api/cron/reengage to avoid emailing someone who
--    finished the task we'd otherwise nag them about.

-- 1 + 2. Extend observations.
alter table public.observations
  add column if not exists category text;

do $$
begin
  if exists (
    select 1
      from information_schema.check_constraints
     where constraint_schema = 'public'
       and constraint_name = 'observations_category_check'
  ) then
    alter table public.observations drop constraint observations_category_check;
  end if;
end $$;

alter table public.observations
  add constraint observations_category_check
  check (
    category is null or category in (
      'avoidance', 'pattern', 'contradiction', 'strength'
    )
  );

alter table public.observations
  alter column confidence drop not null;

create index if not exists observations_user_category_idx
  on public.observations (user_id, category);

-- 3. Re-engage debounce column.
alter table public.users
  add column if not exists last_reengage_email_at timestamptz;

-- 4. Task-completed timestamp.
alter table public.users
  add column if not exists onboarding_task_completed_at timestamptz;
