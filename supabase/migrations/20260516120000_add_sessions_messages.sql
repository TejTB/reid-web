alter table public.users
  add column if not exists last_session_at timestamptz,
  add column if not exists session_count integer not null default 0,
  add column if not exists streak_days integer not null default 0;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  summary text,
  task_set text,
  message_count integer not null default 0
);
alter table public.sessions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sessions' and policyname='anon full access sessions') then
    create policy "anon full access sessions" on public.sessions for all to anon using (true) with check (true);
  end if;
end $$;

create index if not exists sessions_user_started_idx on public.sessions(user_id, started_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='anon full access messages') then
    create policy "anon full access messages" on public.messages for all to anon using (true) with check (true);
  end if;
end $$;

create index if not exists messages_session_created_idx on public.messages(session_id, created_at);
