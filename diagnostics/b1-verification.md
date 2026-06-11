# B1 Verification Report — Supply-Chain & Defect Fixes
**Branch `sprint13-brain` · 8 commits (`8f85936`…`b4c8045`) · 2026-06-11 · NOT merged, NOT deployed (both remain Theo's)**

## Gate evidence

| Gate | Result |
|---|---|
| Impeccable | No visual deltas in the diff (logic-only; no styles/markup added — recap-close reuses the existing opener flow). Recap overlay captured in smoke (`diagnostics/b1-recap-overlay.jpeg`) and renders per existing design. Full 23-command audit deliberately not run on a zero-visual-delta diff — flagged for your judgment. |
| tsc --noEmit | Clean, after every task |
| eslint | 0 errors; changed files: 0 findings (repo-wide 137 pre-existing warnings, count unchanged) |
| tests | **98/98** (baseline 80; +18 new: session-policy closure/thresholds, sentinel opt-out/strip, placeholder names, quote-strip) |
| secret-scanner | Clean — only false positives (`max_tokens`, the `"test-key"` test stub) |
| git-commit-smart | 8 conventional commits, one per task |
| Playwright smoke | 7/8 PASS, 1 explained (below) |

## Fix → evidence table

| # | Fix | Commit | Evidence |
|---|---|---|---|
| B1.1 | Derived closure (summary ∨ cap ∨ idle>60min) + refuse resuming closed sessions + recap-close clears client + 20-cap revived | `8f85936` | Smoke: idle-closed session NOT resumed (fresh opener); recap close cleared transcript + localStorage and streamed a new opener referencing the just-closed session's commitment ("The churned user is still waiting. Did you reply?") — the memory loop visibly working end-to-end for the first time |
| B1.2 | Duplicate-POST verdict + opening in-flight guard | `96176bb` | **Verdict: dev-only, NOT a prod cost issue.** Prod SQL: zero duplicate message pairs (only genuine user repeats 3–15 min apart, e.g. "you"×3 in `0930e723`). Next dev = StrictMode; its mount cycle explains every Phase B double (the `[]`-deps keepalive cleanup fires once at mount). `handleSend` is event-driven + `isStreaming`-guarded. Guard added anyway. |
| B1.3 | All 3 summary writers emit commitments/key_points; keepalive Sonnet→Haiku; 10-min recent-activity refusal | `5471477` | Smoke DB row `12b5e6d1`: `has_summary=true`, 2 commitments, 3 key_points — **the key flip: P2's NULL-commitments defect is gone** |
| B1.4 | Onboarding ladder on ACCUMULATED total; force-complete from DB history; onboarding session id persisted | `0344415` | Before-count recorded: **13/23 users stuck** (read-only, 2026-06-11). Conversion is organic post-deploy (FINAL directive fires on first message back at total ≥22; synthesis at ≥26). After-count: measure at your checkpoint. No prod write performed. |
| B1.5 | reid-take + task-complete ack: sentinel spec omitted + defensive strip | `ea2f94f` | Unit tests: `buildSystemPrompt("",{sentinels:false})` contains no sentinel tags; `stripSentinelTags` covers all 6 `SENTINEL_PREFIXES` |
| B1.6 | Placeholder pseudo-names rejected; ensureUserRow insert-race fixed | `8030f01` | Root cause was two bugs: model emits `[NAME_CAPTURED] name="Unknown"` (passed plausibility — prod rows held literal "Unknown") AND the unchecked insert lost signup names to the `on_auth_user_created` trigger race. Tests: placeholders rejected, real names pass. Damaged phaseb rows NOT repaired (they're deleted after the persona re-run per your directive). |
| B1.7 | Opener quote-strip (route buffers ≤80-token line; first-message persistence strip in /api/reid) | `2e1e407` | Smoke: both openers unquoted. 204/client handling verified: `streamOpeningLine` reads a single-chunk body identically; 204/empty → existing failed-fallback path (code-verified + smoke). |
| B1.8 | Web chat voice loop + onboarding send `voice:true` | `b4c8045` | Type + both call sites; server side (`voice_used` flag write) pre-existing and unchanged. Behavioural verification needs a voice turn — deferred to the persona re-run / your device check. |

## Smoke results (full: `diagnostics/b1-smoke-results.md`)
- fresh-opener-no-resume **PASS** · recap-close-clears+new-opener **PASS** · localStorage-cleared **PASS** · summary+commitments+key_points **PASS** · stale-id-refused **PASS** (caveat below) · no-sentinel-leaks **PASS** · opener-unquoted, name="Maya" **PASS** · console **1 finding** (below)
- **Stale-id caveat:** restoring a closed session id and sending a message left the closed session untouched (message_count unchanged) and fell into the new-session path — which hit the free-tier 402 wall (account at 2/2 sessions), itself proof the refusal worked. "New row receives the turn" couldn't be observed on a walled free account; re-verify on your Pro account at checkpoint. UI note: a stale id still *renders* the old session's history client-side before the first send — cosmetic, B2 candidate (history restore could check closure).
- **Console finding (explained, non-blocking):** 3× 401 on `/api/sessions/summarise` — the best-effort unmount keepalive firing without auth (one was post-logout, one from the smoke's deliberately-stale state). Pre-existing behaviour, not a B1 regression; the new 10-min refusal makes the call pointless noise in most cases → small B2/B3 cleanup candidate (skip keepalive when signed out).
- **Opener latency observation:** buffered opener took ~8–11s in dev (includes dev-compile noise; streaming previously showed first words sooner). If it feels slow in prod at your checkpoint, the fallback design is stream + client-side strip (OnboardingClient already has that pattern). Watch it.

## Expected persona-rerun flips (B2 gate baseline)
- P2 `commitments`/`key_points` NOT NULL → **already flipped** (smoke-proven)
- Natural-return no longer resumes an ended session → **flipped** (smoke-proven)
- Opener no longer asserts failure pre-deadline → NOT expected yet (needs B2's status-aware commitment injection; B1 only fixed the resume side)
- T1/T2 (distance recall, contradiction) → expected still FAIL (RC3, B3/B4 scope)
- Founder's stuck 4-message session from 2026-06-10 → summarises on your first post-deploy visit (idle-closed → summarise-at-next-start)

## Residue & state
- phaseb-p3 gained 2 session rows via the smoke (normal app usage, test account). All `phaseb-*` accounts remain as persona-rerun baselines; delete after the re-run per your cleanup directive.
- Dev server stopped. Working tree clean except `diagnostics/` (uncommitted by design) and the plan doc.
- Git committer identity on this machine auto-derived (`theod@Mac-mini.local`) — commits warn about it; set `git config --global user.email` if you want them attributed to your usual identity before pushing.
