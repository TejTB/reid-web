alter table public.push_subscriptions
  add column if not exists platform text default 'web';
