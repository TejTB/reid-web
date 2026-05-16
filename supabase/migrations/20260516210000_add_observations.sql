-- Sprint 6 Agent 5 — Observations
--
-- Reid emits an [OBSERVATION] sentinel when he notices a persistent pattern
-- about the founder (sharper on product / vaguer on sales, avoids pricing,
-- overestimates throughput, etc). Captured here so future sessions can
-- reference them — they land in FOUNDER CONTEXT next to ACTIVE GOALS.
--
-- One observation per session at most. Reid's discipline, enforced in the
-- system prompt rather than in SQL — duplicates land in different rows
-- but the context builder dedupes by text.

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  text text not null,
  confidence text not null default 'medium'
    check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now()
);

create index if not exists observations_user_created_idx
  on public.observations (user_id, created_at desc);

alter table public.observations enable row level security;

-- Self-only access. Inserts come from /api/reid which is the user's request
-- cookie, so the RLS check matches public.current_user_id().
drop policy if exists "observations self all" on public.observations;
create policy "observations self all" on public.observations
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
