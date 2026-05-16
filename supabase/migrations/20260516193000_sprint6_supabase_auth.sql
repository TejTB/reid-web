-- Sprint 6 Agent 1 — Supabase Auth migration

-- 1. Add auth linkage + Stripe subscription columns on users
alter table public.users
  add column if not exists auth_id uuid unique references auth.users(id) on delete cascade,
  add column if not exists stripe_customer_id text unique,
  add column if not exists subscription_status text not null default 'free'
    check (subscription_status in ('free','pro','cancelled','past_due')),
  add column if not exists subscription_id text,
  add column if not exists subscribed_at timestamptz,
  add column if not exists subscription_period_end timestamptz;

create index if not exists users_auth_id_idx on public.users(auth_id);
create index if not exists users_stripe_customer_idx on public.users(stripe_customer_id);

-- 2. Helper: current authenticated user's public.users.id
create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select id from public.users where auth_id = auth.uid() limit 1;
$$;

-- 3. Auto-create users row when a Supabase Auth user signs up
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare existing_id uuid;
begin
  select id into existing_id from public.users where email = new.email limit 1;
  if existing_id is not null then
    update public.users set auth_id = new.id where id = existing_id;
  else
    insert into public.users (auth_id, email, onboarding_complete)
    values (new.id, new.email, false);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4. Lock down every table — drop anon-permissive, add auth_id-scoped

-- users
drop policy if exists "anon full access users" on public.users;
alter table public.users enable row level security;
create policy "users self read" on public.users
  for select to authenticated using (auth_id = auth.uid());
create policy "users self update" on public.users
  for update to authenticated using (auth_id = auth.uid()) with check (auth_id = auth.uid());

-- sessions
drop policy if exists "anon full access sessions" on public.sessions;
alter table public.sessions enable row level security;
create policy "sessions self all" on public.sessions
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- messages
drop policy if exists "anon full access messages" on public.messages;
alter table public.messages enable row level security;
create policy "messages self all" on public.messages
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- goals
drop policy if exists "anon full access goals" on public.goals;
alter table public.goals enable row level security;
create policy "goals self all" on public.goals
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- goal_events
drop policy if exists "anon full access goal_events" on public.goal_events;
alter table public.goal_events enable row level security;
create policy "goal_events self all" on public.goal_events
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- push_subscriptions
drop policy if exists "anon full access push_subscriptions" on public.push_subscriptions;
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions self all" on public.push_subscriptions
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- notifications (read-only for users; writes only via service role)
drop policy if exists "anon full access notifications" on public.notifications;
alter table public.notifications enable row level security;
create policy "notifications self read" on public.notifications
  for select to authenticated using (user_id = public.current_user_id());

-- conversations (legacy dual-write from /api/reid)
drop policy if exists "anon full access conversations" on public.conversations;
alter table public.conversations enable row level security;
create policy "conversations self all" on public.conversations
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- reid_waitlist — INTENTIONALLY UNCHANGED.
-- "Allow anon count" SELECT and "Allow anon insert" INSERT policies remain
-- so the public landing page waitlist signup still works.
