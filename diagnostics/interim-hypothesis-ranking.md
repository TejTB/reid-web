# Interim Hypothesis Ranking — Phase A Gate (pre-Phase B)

Lead synthesis after reading agent-1..4 reports. One page. Verdicts here are INTERIM; Phase C finalises after live testing.

## ⚠️ Prompt-vs-reality conflict (ground-rule flag)
The audit brief describes "8 personality modes (Interrogator, Mentor, Co-founder, Investor, Motivator, Congratulator, Challenger, Crisis)". **They do not exist anywhere in the repo.** Only `mode: z.enum(["onboarding","chat"])` exists (`src/lib/validation.ts:14`); one static persona `REID_VOICE` (`src/lib/anthropic.ts:19-225`); the code states "The model body is the same regardless of mode" (`anthropic.ts:13`). The founder pitches "multiple personalities" inside his own test sessions (msg `0e57ae07`). The flagship differentiator is unimplemented, not cosmetic. Thread halted per ground rules; carried as a headline finding.

## Interim verdicts (H1–H9)
| H | Interim | One-line evidence |
|---|---|---|
| H1 buried context | **REJECTED** | FOUNDER CONTEXT is the FIRST system-prompt block, structured w/ headers + usage directive (anthropic.ts:304-313). Problem is thinness, not burial. |
| H2 tone not behaviour | **PARTIAL** | Core REID_VOICE has real mechanics (scripted lines, banned phrases, 3-sentence cap); satellite prompts (opener/push/observe/recap) are adjective-driven; disagreement rule itself is an adjective ("come back harder"). |
| H3 model ceiling | **PARTIAL** | `claude-sonnet-4-6` is current-gen but two tiers below frontier; zero sampling params set; zero prompt caching; volatile-first prompt order blocks caching. Drop-in Opus 4.8 swap is API-compatible, ~1.7× cost, +0.5–1.5s EST. |
| H4 chatbot-shaped | **PARTIAL** | Prompt caps at 3 sentences (anthropic.ts:77) so output is short, BUT voice turns get byte-identical prompts — model never told it's speaking; max_tokens 2048 permits essays; no voice shaping anywhere. |
| H5 never drives | **PARTIAL** | Drive rate 32.6%; 4/4 fair callback tests passed. BUT stored `commitments` reach ZERO model prompts (written, only UI reads them), and the opener prompt receives no summaries/commitments/goals — only 4 thin facts. |
| H6 modes cosmetic | **CONFIRMED (strongest form)** | Modes are not cosmetic — they are absent. See conflict flag above. |
| H7 summary mush | **PARTIAL** | Goals inject as sharp structured facts; session memory collapses to ONE prose sentence per session; the sharp layer (commitments[], key_points[]) is never read back; 2 of 3 summary writers don't even produce it. |
| H8 safety-flattened | **PARTIAL** | Real anti-sycophancy structure exists (banned phrases, excuse-handling). But zero rules/examples for disagreeing with the founder's *judgment/plan*, and opinion-taking is triple-hedged ("rarely", "earned the right", "not unprompted"). Forensics: pushback 29.2% — spine exists vs excuses. |
| H9 no in-session memory | **REJECTED** | Full message array sent every turn, no slicing (chat/page.tsx:465-471); turn-1 survives to turn 20. Loss happens BETWEEN sessions. |

## Ranked interim root causes of "feels generic"
1. **Memory-artifact starvation (supply, not retrieval).** 183/192 sessions ran onboarding-mode (0 summaries by design); 13/20 users stuck `onboarding_complete=false`; only 7 sessions EVER summarised; only 6/20 users have an onboarding_summary. When context existed, Reid used it (4/4 callback openers). The flywheel never starts.
2. **The founder personally lives the no-memory path.** His primary account: 0/2 chat sessions summarised (ended-session-resume defect starves the summariser — `clearChatSessionId` never called, `sessionBelongsTo` ignores `ended_at`); 45 legacy `conversations` rows invisible to the pipeline; context frozen at 2026-05-19. His complaint is a faithful report of a real but *account-specific-in-degree* condition.
3. **Structured memory written but never read.** `commitments`/`key_points` reach no prompt; `tasks` table never injected; opener pipeline gets 4 thin facts via a separate, weaker persona at max_tokens 80.
4. **Session-lifecycle defects destroy accrual.** Ended sessions resume forever (36-msg session vs 20 cap); session fragmentation (9 session rows in 111s); scripted onboarding opener re-greets users with days of history (Noah, twice).
5. **Single static persona + absent mode system + no voice shaping + mid-tier model.** Real but secondary: forensics show the persona is sharp when fed (chat-mode generic rate 20.3% vs onboarding 43.3%).

## What Phase B must test
- Fresh-account behaviour IS the dominant prod experience (onboarding path) — capture it, but ALSO force the healthy path: complete onboarding, end a session properly, return → fair callback test (Persona 2).
- Spine vs *judgment* (Persona 1 trap T3, Persona 3) — H8's untested half.
- In-flight payload capture to confirm Agent 2's assembly map empirically.
- GPT-wrapper benchmark to quantify whether context use is distinguishable.
