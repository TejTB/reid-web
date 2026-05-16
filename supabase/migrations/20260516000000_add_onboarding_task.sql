-- Adds the per-user "today's task" Reid hands out at the end of the
-- first conversation. The home screen's "TODAY'S TASK" card and the
-- /tasks tab both read this column for the seed task.
alter table public.users
  add column if not exists onboarding_task text;
