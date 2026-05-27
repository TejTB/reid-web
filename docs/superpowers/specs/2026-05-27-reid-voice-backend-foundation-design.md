# Reid Voice — Sub-project 1: Backend Foundation (Design Spec)

- **Date:** 2026-05-27
- **Repo:** `reid-app` (Next.js) + Supabase project `wzmoeutpxndeqgfsnfci`
- **Status:** Approved for planning
- **Part of:** Sprint 3 — Voice Pivot + Web Sync. This is sub-project 1 of 4. It unblocks
  sub-project 2 (native voice experience), 3 (web sync), and 4 (Zapier + quality gates).

## Context & rationale

The original sprint brief assumed the Reid backend was a Supabase edge function
(`supabase/functions/reid-chat`) and instructed adding `/transcribe` and `/speak` routes to it,
plus deploying `REID_VOICE` into both apps. Pressure-testing against the actual code disproved that:

- The native app (`reid-native`) is a thin client. `lib/api.ts` points `EXPO_PUBLIC_API_URL` at
  `https://reid-app.vercel.app` and calls Next.js routes `/api/reid` (chat, SSE stream) and
  `/api/tts` (ElevenLabs voice). Nothing in either repo references the deployed `reid-chat` edge
  function — it is orphaned/legacy.
- The LLM call lives server-side in `reid-app/src/lib/anthropic.ts`. A native `lib/prompts.ts`
  would be dead code.
- TTS already exists (`/api/tts`, ElevenLabs voice `gXoaQmnIbECYarWwg7B2`). Session
  summarisation already exists (`/api/session-recap` generates title/summary/commitments/reid_note;
  `/api/sessions/summarise` writes an abandoned-session summary).
- The `sessions` table already has `commitments jsonb`; `users` already has `subscription_status`,
  `session_count`, `sessions_used_this_month`, `onboarding_complete`.

**Decisions taken (by Theo):**
1. New voice endpoints live as Next.js routes in `reid-app` (single backend). The `reid-chat` edge
   function is ignored.
2. `REID_VOICE` is updated only server-side in `reid-app`. No native prompt file.
3. Reuse + extend existing infra. Gate voice on existing `users.subscription_status` +
   `sessions.voice_used`. No new `voice_usage` table.
4. Add a `voice` flag to `/api/reid` so spoken replies are short.

## Scope of this sub-project

In scope (all in `reid-app` + Supabase):
1. Additive DB migration on `sessions`.
2. `REID_VOICE` V2 personality + conditional `VOICE_MODE_RULES` in `anthropic.ts`.
3. `voice` flag on `/api/reid` (+ mark `sessions.voice_used`).
4. New `/api/transcribe` route (OpenAI Whisper).
5. Extend `/api/session-recap` to generate `avoiding` + `mood` and persist `commitments`.

Explicitly **out of scope** (later sub-projects): native orb, recording, voice-gating UX, web
history/`noticed` pages, Zapier notifier, quality gates. The `reid-chat` edge function is untouched.

## Detailed design

### 1. DB migration (additive, non-destructive)

Apply via Supabase MCP `apply_migration`. Confirm with `list_tables` after.

```sql
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS avoiding   text,
  ADD COLUMN IF NOT EXISTS mood       text,
  ADD COLUMN IF NOT EXISTS voice_used boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sessions_user_started_idx
  ON public.sessions (user_id, started_at DESC);
```

- `commitments jsonb` already exists — do not re-add.
- RLS is already enabled on `sessions` — verify the existing "own rows" policies still cover the
  new columns (column adds inherit table RLS; no policy change expected). Do not weaken RLS.
- No `voice_usage` table.

### 2. `REID_VOICE` V2 + conditional voice rules — `src/lib/anthropic.ts`

Current structure (preserve the composition pattern):
- `REID_VOICE` (constant, personality text)
- `REID_SENTINEL_INSTRUCTIONS` (constant, the `[GOAL_UPDATE]/[SESSION_COMPLETE]/`
  `[ONBOARDING_COMPLETE]/[EMAIL_CAPTURED]/[NAME_CAPTURED]/[OBSERVATION]` contract)
- `buildSystemPrompt(context)` composes `FOUNDER_CONTEXT? + REID_VOICE + REID_SENTINEL_INSTRUCTIONS`
- `REID_MODEL = "claude-sonnet-4-6"`

Changes:
- **Replace the body of `REID_VOICE`** with the brief's V2 personality (co-founder framing; the 8
  modes: INTERROGATOR/MENTOR/CO-FOUNDER/INVESTOR/MOTIVATOR/CONGRATULATOR/CHALLENGER/CRISIS; MEMORY;
  WHAT YOU ARE NOT), with two deliberate omissions:
  - **Omit the "VOICE MODE RULES" section** from `REID_VOICE` (it becomes conditional — see below).
    Including it unconditionally would truncate text-chat replies to 2 sentences.
  - **Omit the brief's `[REID_CONTEXT]` format block.** Real context is the richer `FOUNDER CONTEXT`
    string already injected by `getReidContext()` (`src/lib/reid-context.ts`); documenting a second,
    conflicting context format would confuse the model. Keep the prose instruction "reference memory
    naturally, do not announce it."
- **Do not touch `REID_SENTINEL_INSTRUCTIONS`.** The V2 line "Strip REID_ACTIONS tags from spoken
  output" refers to display-side stripping (handled by clients), not to removing sentinel emission.
  Reid must keep emitting `[OBSERVATION]`, `[GOAL_UPDATE]`, `[SESSION_COMPLETE]`, etc.
- **Add a new exported constant `VOICE_MODE_RULES`** containing the voice-only rules: maximum 2
  sentences unless asked for more; no lists/bullets; natural speech; no em-dashes; never open with
  "So" or "Well"; end thoughts cleanly so ElevenLabs can breathe.
- **Change `buildSystemPrompt` signature** to
  `buildSystemPrompt(context: string, opts?: { voice?: boolean }): string`. When `opts.voice` is
  true, append `\n\n${VOICE_MODE_RULES}` after `REID_SENTINEL_INSTRUCTIONS`. Default behaviour
  (no opts) is byte-for-byte unchanged from today for text chat.

### 3. `voice` flag on `/api/reid` — `src/app/api/reid/route.ts` + `src/lib/validation.ts`

- `reidRequestSchema` (validation.ts): add `voice: z.boolean().optional()`.
- In the route handler, thread `voice` into the `buildSystemPrompt(reidContext, { voice })` call.
- When `voice === true`: after the session is resolved/created, set `sessions.voice_used = true`
  for that session id (single `update`). Idempotent; safe to set on every voice turn.
- Everything else unchanged: SSE streaming, `SentinelStripper`, `parseSentinels`, session quota
  enforcement, `X-Reid-Session-Id` header, auth via `getAuthedUser(req)`.

### 4. New route `/api/transcribe` — `src/app/api/transcribe/route.ts`

- Method: `POST`, `Content-Type: multipart/form-data`, field `file` (audio: m4a/mp3/wav).
- Auth: `getAuthedUser(req)` (Bearer token, same helper the sibling routes use). 401
  `{ error: "unauthorized" }` if absent.
- Read the `File` from `await req.formData()`. Validate presence and a sane size cap (e.g. reject
  > ~25 MB, matching Whisper's limit). 400 `{ error: "invalid_audio" }` otherwise.
- Forward to OpenAI Whisper: `POST https://api.openai.com/v1/audio/transcriptions`, multipart body
  with `file` + `model=whisper-1`, header `Authorization: Bearer ${process.env.OPENAI_API_KEY}`.
- On success return `{ transcript: string }` (the `text` field from Whisper). On upstream failure
  return 502 `{ error: "transcription_failed" }`. If `OPENAI_API_KEY` is missing, 503
  `{ error: "transcribe_unavailable" }`.
- Match the existing routes' conventions for logging and error shape (see `/api/tts`).

### 5. Extend `/api/session-recap` — `src/app/api/session-recap/route.ts`

- Extend the Anthropic recap prompt to also produce `avoiding` (string, what the user seems to be
  avoiding; may be empty) and `mood` (short string).
- Extend `clampRecap()` to clamp/trim `avoiding` (≤ 200 chars) and `mood` (≤ 40 chars).
- Persist on the `sessions` update: add `commitments` (currently generated but not saved),
  `avoiding`, `mood` — alongside existing `title`, `reid_note`, `summary`, `ended_at` logic.
  Keep the existing idempotency/cache behaviour (`cached: true` when title/summary/reid_note exist),
  but include the new fields in the generated path.
- Response JSON gains `avoiding` and `mood`. Existing consumers ignore unknown fields safely.

## Environment variables

- `OPENAI_API_KEY` — **must be added to Vercel (reid-app) env and reid-app local `.env`.** The brief
  set it as a Supabase secret, which does not reach Vercel routes. Required by `/api/transcribe`.
- `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, ElevenLabs voice id — already present and working
  (`/api/reid`, `/api/tts`). No change.

## Interfaces exposed to downstream sub-projects

- `POST /api/transcribe` (multipart `file`) → `{ transcript: string }` (auth: Bearer).
- `POST /api/reid` with body `{ mode, sessionId?, messages, voice?: true }` → SSE text stream,
  `X-Reid-Session-Id` header; marks `sessions.voice_used` when `voice` is true.
- `POST /api/tts` `{ text, preview? }` → `audio/mpeg` bytes (already live).
- `POST /api/session-recap` `{ session_id }` → now also returns/persists `commitments`,
  `avoiding`, `mood`.

## Testing & acceptance criteria

- **Migration:** `list_tables`/`execute_sql` confirms `sessions` has `avoiding`, `mood`,
  `voice_used` (default false) and the new index; `commitments` untouched; RLS still enabled.
- **Prompt:** `buildSystemPrompt(ctx)` output is unchanged for text chat (snapshot/string compare
  of the non-voice path). `buildSystemPrompt(ctx, { voice: true })` includes `VOICE_MODE_RULES`.
  `REID_SENTINEL_INSTRUCTIONS` still present in both.
- **`/api/reid`:** existing chat behaviour unchanged when `voice` omitted. With `voice: true`, the
  session row's `voice_used` becomes true; response still streams and strips sentinels.
- **`/api/transcribe`:** 401 without auth; 400 with no/oversized file; with a valid small audio
  fixture + a stubbed/real `OPENAI_API_KEY`, returns `{ transcript }`. 503 when key missing.
- **`/api/session-recap`:** generates and persists `commitments`, `avoiding`, `mood`; idempotent
  cache path still works; old sessions can be recapped without error.
- `cd reid-app && npx tsc --noEmit` passes (zero errors).

## Risks & notes

- Whisper accepts `m4a` (expo-audio HIGH_QUALITY default on iOS) and `mp3`/`wav`. Native (sub-project
  2) must send a Whisper-supported container; verify the recorded file extension/mimetype.
- Voice gating logic (free user limit) is implemented native-side in sub-project 2 reading
  `users.subscription_status` + counting `sessions.voice_used = true`; this sub-project only
  provides the `voice_used` marker and entitlement data.
- `apply_migration` writes directly to the remote project (no local Supabase stack). Run the
  additive ALTER carefully and verify immediately.
