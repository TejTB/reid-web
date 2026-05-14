-- Adds the per-user onboarding summary column. Reid writes this once at the
-- end of the onboarding conversation (everything before the
-- [ONBOARDING_COMPLETE] sentinel) and the home screen renders it as
-- "Your current focus".
alter table public.users
  add column if not exists onboarding_summary text;
