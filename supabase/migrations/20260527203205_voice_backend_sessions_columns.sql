-- Sprint 3 (voice pivot): additive columns on sessions for voice-session
-- metering and richer recaps. Applied to the remote project as migration
-- 20260527203205 (voice_backend_sessions_columns); checked in here so the
-- schema is reproducible from the repo.
--
-- `commitments jsonb` already exists (20260524163442_add_session_key_points_and_commitments).
alter table public.sessions
  add column if not exists avoiding text,
  add column if not exists mood text,
  add column if not exists voice_used boolean not null default false;

-- The index already exists from 20260516120000_add_sessions_messages.sql;
-- repeated idempotently to mirror the migration that was applied.
create index if not exists sessions_user_started_idx
  on public.sessions(user_id, started_at desc);
