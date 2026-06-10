# SPRINT 13 — HANDOFF

**Branch:** `sprint13-voice-onboarding` · **Theo runs merge → `npx vercel --prod`. Push ≠ deploy.**

## Commits to merge (in order, oldest first)

| Hash | What |
|---|---|
| `74a2abe` | **Build 1** — voice-first orb onboarding shell (OnboardingClient rewrite, `lib/onboarding-voice.ts` + tests, OnboardingIntro/OnboardingComplete deleted) |
| `f6d3225` | **Build 4 #3 (pulled forward)** — force-complete seeds a minimal goal (`synthesizeOnboardingGoals`) |
| `cc3b19e` | Sprint doc: approved cut, /home handoff, Build 1 gate record |
| `1207a31` | Sprint doc: iPhone smoke checklist additions |
| `a7a5842` | **GlowCard LAW fix** — border `rgba(255,255,255,0.08)`, blur 24px (own commit per approval) |
| `876b0dd` | **Build 2** — session history: `/api/sessions/list` + `/api/sessions/[id]`, SessionsSidebar (desktop), `/sessions/[id]` read-only summary view |
| `db144c3` | **Build 4** — useMounted hydration gates (/chat ×3, full-screen-card), Noticed/Goals empty-state parity, Today's Task on `public.tasks` |
| (tip) | This handoff + final sprint-doc status |

Build 3 (backfill): **SKIPPED** per approval (2 qualifying sessions; empty states cover it).

## Gate evidence (all builds)
- tsc clean · eslint **0 errors** (137 pre-existing warnings repo-wide) · **80/80 tests** · audio-grep zero on all changed files · secret scans clean · impeccable detector clean on new surfaces.
- **Build 1**: text-mode E2E (signup → onboarding → close → goals+task+summary → /home) ✓; force-complete-at-cap E2E on the genuine FORCE path (session bumped to 24, closed at 26, goal seeded, summary non-null, /home renders both) ✓; orb perf @390px p95 9.7ms, 0 frames >20ms ✓; **iPhone smoke PASSED (Theo, 2026-06-10)** — Build 1 banked.
- **Build 2**: list renders (title + date-fallback) ✓; click → summary view (Playfair title, commitments, key points, reid_note) ✓; foreign/random/malformed session ids → 404, own → 200 with no `user_id` echo ✓; empty state ✓; **blur(24px) perf @390×844@3: /home p95 17.4ms 0>20ms (≥ blur-5px baseline), history view p95 9.0ms 0>20ms — no jank, LAW blur ships** ✓.
- **Build 4**: item 1 VERIFIED-no-change (res.json() already guarded — Phase 0 finding stale); items 2/4/5 lint-verified (the `set-state-in-effect` error at full-screen-card:130 is gone); item 6 browser-verified — `public.tasks` row renders as Today's Task and toggles through `/api/tasks/item/[id]/complete` (DB stamp confirmed), legacy `onboarding_task` fallback retained for fresh founders.
- All E2E fixture users/rows (`*@reidtest.dev`) fully deleted from prod (0 residue across auth + 9 owned tables); test6 untouched, still Pro.

## Theo's device-smoke checklist (post-merge, prod)
1. Voice onboarding end-to-end on iPhone (already passed on preview — one prod confirm).
2. Desktop: Sessions section lists summarised sessions → click → summary view renders → another account's session URL 404s.
3. /home Today's Task shows the latest session-assigned task and toggles; a fresh founder still sees their onboarding task.
4. /chat at 390px: no hydration flash on the voice toggle/mic/PRO badge.
5. GlowCard surfaces (/home cards, session summary) look right with the heavier blur — scroll for jank by eye.

## Deferred (carried debt, in rough priority order)
1. **Prod abandoned-onboarding-row cleanup** — pre-threading clients minted a session row per turn (~156+ orphans). DML sweep, post-merge.
2. Mobile entry for session history (fast-follow).
3. Sentinel-stripper edge: stray `]` can trail Reid's closing message (cosmetic).
4. Voice rate-limit countdown (M) · onboarding network-failure recovery UI (M) · 20-cap banner · orb mobile padding · observation ordinals.
5. Migration reconcile (`supabase db pull`) · streaming TTS · Stripe webhook re-verify · marketing site.
6. Impeccable detector flag: side-tab `borderLeft: 3px` accent at `home/page.tsx:409` (pre-existing; report-not-fix).
7. Repo-wide eslint warning debt (137 warnings, 0 errors).
8. Signup `name` field never persists to `users.name` (greeting shows email-stem/"Unknown" until extracted from chat) — noticed during gates, pre-existing.

## Notes
- **Local dev env gap:** `/api/tts` 503s on `npm run dev` — Upstash Redis env vars absent from `.env.local` ("Redis client was initialized without url or token"). Prod env is fine; add the vars locally if testing voice against dev.
- Session-id threading (Build 1) makes the 14/22/26 onboarding ladder LIVE in prod for the first time once merged.
