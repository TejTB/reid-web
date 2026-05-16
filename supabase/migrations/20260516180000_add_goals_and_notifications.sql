-- Sprint 5 data foundation: Goals, Push Notifications, Cross-Session Memory.
--
-- Adds four new tables (goals, goal_events, push_subscriptions,
-- notifications) plus three new columns on public.users (email,
-- push_enabled, last_review_at). The existing onboarding_goals column
-- (freeform JSON captured during onboarding) is also ensured. All new
-- tables get anon-permissive RLS to match the prior pattern — this app
-- has no service role key.

-- ----- users column additions ---------------------------------------------
alter table public.users
  add column if not exists email text,
  add column if not exists push_enabled boolean not null default false,
  add column if not exists last_review_at timestamptz,
  add column if not exists onboarding_goals jsonb;

-- ----- goals --------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  target_value numeric not null,
  current_value numeric not null default 0,
  unit text not null,
  unit_prefix text,
  deadline date,
  is_primary boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.goals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='goals' and policyname='anon full access goals') then
    create policy "anon full access goals" on public.goals for all to anon using (true) with check (true);
  end if;
end $$;

create index if not exists goals_user_primary_idx on public.goals(user_id, is_primary desc, created_at);

-- ----- goal_events --------------------------------------------------------
create table if not exists public.goal_events (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  delta numeric not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.goal_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='goal_events' and policyname='anon full access goal_events') then
    create policy "anon full access goal_events" on public.goal_events for all to anon using (true) with check (true);
  end if;
end $$;

create index if not exists goal_events_user_created_idx on public.goal_events(user_id, created_at desc);
create index if not exists goal_events_goal_created_idx on public.goal_events(goal_id, created_at desc);

-- ----- push_subscriptions -------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='push_subscriptions' and policyname='anon full access push_subscriptions') then
    create policy "anon full access push_subscriptions" on public.push_subscriptions for all to anon using (true) with check (true);
  end if;
end $$;

create unique index if not exists push_subscriptions_endpoint_idx on public.push_subscriptions(endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- ----- notifications ------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('nudge','review','goal_milestone','task_reminder')),
  channel text not null check (channel in ('push','in_app')),
  title text not null,
  body text,
  payload jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='anon full access notifications') then
    create policy "anon full access notifications" on public.notifications for all to anon using (true) with check (true);
  end if;
end $$;

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_scheduled_idx on public.notifications(user_id, scheduled_for) where sent_at is null;

-- ----- updated_at trigger on goals ----------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='goals_updated_at') then
    create trigger goals_updated_at
      before update on public.goals
      for each row execute function public.set_updated_at();
  end if;
end $$;
