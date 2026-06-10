# Sprint 13 — Voice-First Onboarding + Session History + Launch-Gap Closure

Branch `sprint13-voice-onboarding` off banked main (`459eef5`). Diagnostic Phase 0 complete
(consolidated report approved 2026-06-10). Builds sequential, human-gated:
plan → exact edit map → STOP → code → gates → STOP.

## Approved cut (Theo, 2026-06-10)

| Build | Status | Scope |
|---|---|---|
| 1 — Voice-first onboarding | **BUILT — gates passed, awaiting iPhone checkpoint** | Replace onboarding chat UI with the orb experience. Reuse `useVoiceLoop` + `ReidWebOrb` + Web Audio chain as-is; thin shell + copy only. Completion logic untouched server-side. **Handoff is `/home`** (supersedes the original prompt's `/chat` reference — `/home` is the "Reid remembered" proof moment). Approved at plan review: mic permission on the first RECORD tap (tap 2, in-gesture — supersedes the tap-1 locked decision); session-id threading activates the 14/22/26 ladder (was inert: no client sessionId → fresh row per turn). |
| 2 — Session history | APPROVED | Desktop sidebar "Sessions" section in `AppShell.tsx:170-172`; GET routes mirroring `session-recap/route.ts` with `getAuthedUser()`; read-only summary view (GlowCard, Playfair). NOT chat resume. **GlowCard drift fix rides with Build 2 as its OWN commit**: component to LAW — border `rgba(255,255,255,0.08)`, `blur(24px)`. **Gate addition:** chrome-devtools perf pass on `/home` + history view at 390px — if `blur(24px)` drops frames, STOP and report; do not ship jank. |
| 3 — Summary backfill | **SKIP** | Only 2 qualifying sessions; empty/sparse states in Build 2 cover it. |
| 4 — Gap closure | APPROVED, 6 items | See below. |

### Build 4 approved list
1. Voice transcribe JSON-parse safety (`useVoiceLoop.ts:260`) — S
2. Voice-toggle hydration mismatch (`chat/page.tsx:772`) — S
3. ~~Force-complete goals seed~~ — **DONE, pulled forward into Build 1's gate window**
   (`synthesizeOnboardingGoals` in reid-summary.ts, wired at the route's force path; own commit).
   Required by the approved force-complete gate.
4. `full-screen-card.tsx:130` eslint error — S
5. Empty-state voice unification (Goals vs Noticed) — S
6. **Today's Task rewire to `public.tasks`** (`home/page.tsx:135-145` still reads `user.onboarding_task`) — M.
   Load-bearing for the `/home` proof moment. **First cut if the sprint overruns.**

### Build 1 gate record (2026-06-10)
tsc ✓ · eslint ✓ (incl. react-hooks/set-state-in-effect) · 80/80 tests ✓ · audio-grep zero ✓ ·
secret-scan ✓ · impeccable detect: 0 hits ✓ · console-error sweep: 0 errors (signup/onboarding/home) ✓ ·
orb perf @390px: p50 8.3ms, p95 9.7ms, 0 frames >20ms, CLS 0.00 ✓ ·
Playwright text-mode E2E: signup → text onboarding → natural close → goals+task+summary seeded → /home renders ✓ ·
**Playwright force-complete-at-cap (gate addition): session bumped to message_count=24, next turn closed at 26
via the FORCE path (task:null signature) → goal seeded by synthesizeOnboardingGoals → summary non-null →
/home renders goal hero + graceful null-task state ✓.**
Two bugs found and fixed at gate time: (a) redirect timeout killed by effect re-runs (Fast Refresh) —
redirect effect made re-schedule-safe; (b) stale-`me` poisoning (shared-browser signup armed the previous
user's completion) — in-session completion now gated on openerStarted.

Deferred (handoff doc): voice rate-limit countdown, onboarding network-failure recovery UI,
20-cap banner, orb mobile padding, observation ordinals, mobile history entry,
migration reconcile, streaming TTS, webhook verify,
**prod abandoned-onboarding-row cleanup** (the pre-threading client minted a session row per turn —
~156+ orphan rows; DML cleanup, schedule post-merge),
sentinel-stripper edge: stray `]` can remain at the end of Reid's closing message (cosmetic, P2),
test users in prod DB: sprint13-e2e-{text,cap,perf}@reidtest.dev (created by gate runs; delete or keep as QA users).

## Ground rules in force
Theo runs all deploys · DDL-free · entitlement.ts frozen · `getUser()` always ·
no component recreation (rule 7) · audio-grep zero on changed files ·
gates per build: Impeccable → secret-scanner → `tsc --noEmit` → `npm test` →
audio-grep → git-commit-smart; Playwright smoke; chrome-devtools 60fps on orb surfaces.

## Phase 2 — bank & handoff
Full gate pass on tip → push (push ≠ deploy) → `SPRINT13-HANDOFF.md` → STOP.
Theo merges, deploys, device-smokes (voice onboarding E2E, history click-through, gap fixes).
