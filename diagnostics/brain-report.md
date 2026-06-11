# THE BRAIN REPORT — Reid Conversation-Engine Diagnostic
**Sprint 13 Phase 0 · 2026-06-11 · Diagnostic only — zero code changed, zero commits, zero prod writes (3 test accounts via app usage, listed in Appendix C)**

Evidence base: 4 Phase A audit reports (`diagnostics/agent-{1-4}-report.md`), 3 live adversarial persona transcripts (`diagnostics/transcripts/persona-{1-3}-*.md`), the GPT-wrapper benchmark (blind-judged, `diagnostics/transcripts/gpt-wrapper-*.md`), and read-only SQL against prod (`wzmoeutpxndeqgfsnfci`). Every claim below carries a citation into those artifacts.

---

## ⚠️ Flag first: the audit brief conflicts with repo reality

The brief describes "8 personality modes (Interrogator, Mentor, Co-founder, Investor, Motivator, Congratulator, Challenger, Crisis)". **They do not exist anywhere in the repository.** The only mode is `z.enum(["onboarding","chat"])` (`src/lib/validation.ts:14`); there is exactly one persona prompt, `REID_VOICE` (`src/lib/anthropic.ts:19-225`), and the code says so: *"The model body is the same regardless of mode"* (`src/lib/anthropic.ts:13`). Meanwhile the founder pitches "multiple personalities that seamlessly transition" inside his own test sessions (msg `0e57ae07`, 2026-06-01). Per ground rules this thread was halted and is carried as a headline finding, not interpreted away.

---

## 1. The current brain, as built

```
 CLIENT (chat/page.tsx)                          SERVER (/api/reid)
 ┌──────────────────────┐                        ┌──────────────────────────────────────┐
 │ FULL message array    │── POST {mode,         │ getReidContext(userId)  (every turn) │
 │ every turn (no slicing│   sessionId, messages}│  users row · onboarding_summary/task │
 │ ⚠ fired TWICE/turn)   │──────────────────────▶│  goals (sharp) · goal_events(10)     │
 └──────────────────────┘                        │  observations(8) · summaries(5,      │
 localStorage session id                         │   1 prose sentence each) · PRIOR TASK│
 (⚠ never cleared →                              │  ✗ commitments  ✗ key_points ✗ tasks │
  ended sessions resume                          ├──────────────────────────────────────┤
  forever, summariser                            │ SYSTEM PROMPT (plain string, no cache)│
  starves)                                       │  1. FOUNDER CONTEXT (volatile, FIRST) │
                                                 │  2. REID_VOICE persona     ~1,727 tok │
 ┌──────────────────────┐                        │  3. SENTINEL plumbing      ~1,334 tok │
 │ /api/reid/opening     │                        │  4. msg-count nudges (14/16/22)      │
 │ separate THIN persona │                        ├──────────────────────────────────────┤
 │ 4 facts only, 80 tok  │                        │ claude-sonnet-4-6 · max_tokens 2048  │
 └──────────────────────┘                        │ no temperature/top_p/effort/caching  │
                                                 │ stream → SentinelStripper → client   │
 VOICE: STT(whisper, full clip) → same route,    └──────────────────────────────────────┘
 byte-identical prompt (model never told it      WRITE-BACK: sentinel→summary+task_set only;
 speaks) → full reply → /api/tts buffers ENTIRE  next-start path→summary+commitments+key_points
 mp3 → full download+decode → play (~3.5-6.5s    (⚠ rarely fires, see resume defect); keepalive→
 to first audible word)                          summary only. observations via /api/observe.
```

Static instruction outweighs personal context 4:1 to 11:1 (~3,061 static tokens vs ~280 on the founder's own account; agent-2 §Token budget). 44% of the static body is sentinel plumbing, not personality (agent-1 §1.5).

**The fuel gauge, measured in prod:** 192 sessions total → 183 ran in `onboarding` mode (zero summaries by design), 9 in `chat` (7 summarised). 13/20 users are stuck `onboarding_complete=false`, so the memory flywheel never starts for them. Only 6 sessions in the entire database have ≥6 user turns. The founder's primary account: 0/2 chat sessions summarised, 45 legacy `conversations` rows invisible to the pipeline, context frozen at 2026-05-19 (agent-2 §Sprint-12 verification; agent-3 §Exec 5).

---

## 2. Hypothesis verdicts

| H | Verdict | Decisive evidence |
|---|---------|-------------------|
| **H1** Retrieved but buried | **REJECTED** | Context is the FIRST system-prompt block, structured with headers + usage directive (`anthropic.ts:304-313`, `reid-context.ts:225-227`). Live: when artifacts existed, Reid used them — Persona 2 opener called back the Friday commitment unprompted. The problem is thin supply, not burial. |
| **H2** Tone-instructed, not behaviour-instructed | **PARTIAL** | Core `REID_VOICE` is genuinely mechanical: scripted utterances, banned sycophancy phrases, "Never say 'Last time you mentioned X'" with replacement phrasing (`anthropic.ts:88-120`), 3-sentence cap. But every satellite prompt (opener, push, observe, recap, take) is adjective-driven on a *different thin persona* (`opening/route.ts:52-78`); no few-shot exemplars exist anywhere (agent-1 §1.6); the plan-disagreement rule is itself an adjective ("come back harder", `anthropic.ts:64`). |
| **H3** Model/config ceiling | **PARTIAL — and live testing upgraded its importance** | `claude-sonnet-4-6` is current-gen but two capability tiers below frontier (agent-4 §lineup). Zero sampling params, zero caching, volatile-first prompt order (`anthropic.ts:304-314`). The live failure modes are exactly capability-class: numeric recall failed at 8+ turns distance (P1-T1), contradiction missed (P1-T2), a hallucinated "equity conversation" invented **and persisted into the task layer** (persona-1 §verdict 4), goal arithmetic mangled (msg `6b1e0a6d`), fake customer "Shadow Bay" swallowed into a task row (msg `55e05787`). Opus 4.8 is a verified drop-in swap (no 400-risk params in use), ~1.7× cost ≈ $0.029/turn, +0.5–1.5s EST. |
| **H4** Chatbot-shaped output | **REJECTED — the failure is inverted** | Reid is not essay-y; it answers in 1–4 terse sentences (prompt rule `anthropic.ts:77`). The blind judge separated Reid from the control by *shape alone*, 10/10. The real defect: terseness-by-decree costs depth — in 3/10 benchmark pairs the vanilla control's analysis beat Reid's one-liner (pairs 2, 3, 7), and at "what should I do first?" Reid deflected socratically instead of answering with the founder's own numbers (P1-T1). Voice shaping is absent (the model is never told it's speaking; `voice` flag only sets `sessions.voice_used`, `route.ts:530-535`) but is masked by the brevity rule. |
| **H5** Reid never drives | **PARTIAL** | Behaviourally false: drive rate 32.6% (agent-3), live agenda-holding through six derails (`3ba06999`), dodge-return PASS (P3: "Come back to the question. When is the influencer post happening?"). Structurally true: there is **no engineered drive system** — stored `commitments` reach zero model prompts, the opener gets exactly 4 thin facts via a separate 80-token persona (`opening/route.ts:33-77`), and openers hallucinate status ("the emails didn't go out" asserted *before the Friday deadline*; persona-2 §verdict 5). Drive today is an emergent property of the persona prompt plus whatever context happens to survive. |
| **H6** Modes are cosmetic | **CONFIRMED in the strongest form** | Not cosmetic — absent. See the flag above. The pitched differentiator is unimplemented and untracked (no mode column anywhere; agent-3 §per-mode). |
| **H7** Summary-mush, not sharp facts | **CONFIRMED for the memory channel** (rejected for goals) | Goals inject as sharp structured facts with numbers/deadlines (`reid-context.ts:30-52`). But cross-session memory is ONE prose sentence per session (LIMIT 5), and the sharp layer the system already produces — `commitments[]`, `key_points[]` — is **written and never read by any prompt builder** (repo-wide grep, agent-2 §read-side; live-confirmed: P2's recap overlay displayed commitments while the DB row had NULL — 2 of 3 summary writers don't produce them). The `tasks` table is never injected at all (`route.ts:896-906` counts it only). |
| **H8** Spine safety-flattened | **REJECTED** | The anti-agreeableness structure exists and works under live adversarial pressure: Persona 3 — 0 folds in 18 responses across a 4-rung escalation ladder including the ChatGPT threat ("Then go ask it"); P1-T3 rewrite pushback survived a second-round defence; forensics pushback 29.2% with refused derails. Residual gap (filed under H2): no rules/examples for disagreeing with a founder's *strategy*, and opinion-taking is triple-hedged (`anthropic.ts:196-204`). |
| **H9** No memory within a session | **REJECTED structurally, PARTIAL behaviourally** | The full message array is sent every turn, no truncation (`chat/page.tsx:465-471`; `route.ts:614-651`) — turn-1 survives to turn 20 verbatim. Yet P1-T1/T2 failed: facts 8+ turns back were *in the window* and not used. Within-session memory is delivered but not attended — a model-capability + missing-fact-ledger problem (root cause 3), not an assembly problem. |

---

## 3. Ranked root causes of "feels generic"

### RC1 — Memory-artifact starvation: the flywheel never starts (largest single explainer)
The retrieval machinery works; it is almost never fed. 183/192 sessions ran in onboarding mode and produced zero session memory; 13/20 users are stuck `onboarding_complete=false` so every visit re-triggers the scripted opener; only 7 sessions in history were ever summarised; fragmentation produced 9 session rows in 111 seconds for one user (agent-3 caveats 4–5). **The founder's own account is the worst case**: 0/2 chat sessions summarised — because of the ended-session-resume defect (`clearChatSessionId()` is never called and `sessionBelongsTo` ignores `ended_at`: `session-server.ts:293-304`, `route.ts:410-418`), the summarise-at-next-start trigger never fires and the 20-message cap is bypassed (a 36-message session exists). His 45 legacy `conversations` rows are invisible to the pipeline. *He has been testing the no-memory path of his own product.* This defect reproduced live in Phase B (persona-2 §natural-return).
**Money exhibit:** Noah — the only external human ever — answered "What are you building?" at 22:03, and was greeted with the identical scripted opener again at 01:07 (msgs `61fe620a` → `66a98a32`). Versus: in all 4 sessions in the whole DB where a prior summary existed at open, the opener referenced history — **4/4** (agent-3 caveat 3).

### RC2 — The sharp memory layer is written and never read
`commitments[]` and `key_points[]` — exactly the citable, dated, accountability-bearing facts the product thesis demands — are generated, stored, rendered in the UI… and reach **zero** model prompts (agent-2 finding 3). The opener prompt receives 4 thin facts through a separate, weaker, 80-token persona that omits Reid's voice rules entirely (`opening/route.ts:52-78`; agent-4 table row 2). The `tasks` table ("Today's Task") is never injected. Two of three summary writers don't even produce the structured fields (live-confirmed: P2's rows all NULL).
**Money exhibit:** Persona 2's recap overlay *displayed* "email top 10 customers by Friday" as a commitment while `sessions.commitments` was NULL and the next opener had to reconstruct it from a prose sentence — and got the status wrong ("the emails didn't go out") before the deadline existed.

### RC3 — Fact-attention ceiling: context delivered, not used (model tier + no fact ledger)
With facts verifiably in the window, Reid: failed to recall churn-9%/silent-Marcus at 8 turns' distance (P1-T1 FAIL), missed a direct cash contradiction (P1-T2 FAIL), invented "the equity conversation" which then **persisted into the recap and task row** (persona-1 §verdict 4), botched £399-annual vs £399-MRR arithmetic (msg `6b1e0a6d`), and accepted "Shadow Bay" as a customer, poisoning future context (msg `55e05787`). Reid never once spoke the user's own numbers (£2.1k, 9%, £49→£79) in 23 replies. This is the mid-tier model running with no structured within-session fact state and nothing forcing entity grounding.
**Money exhibit:** P1-T1 — "ok so what do you think i should do first?" → "Fair. What's the thing you're most avoiding right now?" — a socratic deflection at the exact moment the product's thesis demands "your churn went 0→9% the same fortnight Marcus went quiet — that's one problem, not two; call him today."

### RC4 — Terseness-by-decree flattens depth (the inverted H4)
"Maximum 3 sentences" makes Reid distinctive, but in 3/10 blind-judged pairs the context-free control gave *substantively better* help because the moment demanded analysis, not a jab. The blind judge: "the ideal response would be the product's memory stapled to the vanilla model's depth." The escape hatch ("when something demands more… use what you need", `anthropic.ts:78-80`) is self-judged and, on the evidence, almost never taken.
**Money exhibit:** benchmark pairs 2, 3, 7 (`gpt-wrapper-blind-judgment.md`) — QUALITY-WIN to vanilla despite Reid being correctly identified as the context product 10/10.

### RC5 — The pitched differentiators don't exist; the satellites are starved
8 personality modes: absent (H6). Voice: byte-identical prompt, never told it's spoken, fully buffered pipeline at every stage → ~3.5–6.5s to first audible word (agent-4 §latency). The first lines a returning user ever sees (opener, daily push) are generated by the two most constrained configs in the codebase (80 tokens, thin/divergent personas). Plus a live-found cost bug: **every turn fires two byte-identical POST /api/reid requests** (persona-1 §verdict 8, reproduced for /opening and /session-recap in P2) — likely doubling LLM spend.

**What is NOT a root cause (counter-evidence, for honesty):** the persona itself, the spine, and the callback mechanism. Chat-mode generic rate is 20.3% vs 43.3% in onboarding; 4/4 fair callback tests passed; the spine held every rung live; the GPT-wrapper test came back 7/10 context-wins. When fed, Reid is the product the founder pitched. The brief's premise "memory storage WORKS" was half-true: storage works; *production and consumption of memory* are both broken in specific, fixable places.

---

## 4. Redesign blueprint — Brain v2

Ordered by leverage. For each: the fix, why it works, effort (agent-sprints), what survives, risk.

### 4.1 Memory supply chain repair (attacks RC1) — *do this first; everything else multiplies it*
- Refuse to resume ended sessions: check `ended_at` in `sessionBelongsTo` AND call `clearChatSessionId()` on recap close. Restores the 20-cap and un-starves summarise-at-next-start.
- Fix the duplicate-POST double-fire (client effect firing twice; verify React StrictMode vs real bug — it reproduced on /reid, /opening, /session-recap).
- Onboarding completion hardening: the 14/22/26 force-complete ladder exists; verify it converts the 13 stuck users; backfill `onboarding_summary` for the 14 users missing one.
- Migrate the legacy `conversations` history (577 rows; the founder's 45, Noah's 30) through the Haiku summariser into session-shaped memory. One-off script.
- Make all 3 summary writers emit `commitments`/`key_points` (today only the next-start path does).
**Why it works:** 4/4 fair callbacks prove consumption works the moment supply exists. **Effort:** 1 agent-sprint. **Survives:** everything — these are defect fixes. **Risk:** low; the migration script needs a dry-run gate (it writes to prod).

### 4.2 Context architecture v2 (attacks RC2, RC3-partially, H7)
Replace the prose-sentence memory channel with structured fact blocks, ordered for salience and cache:
```
[static REID_VOICE persona]…[sentinels]   ← stable prefix, cache_control breakpoint
=== FOUNDER FACTS ===          numbers, named people, prices — one line each, dated
=== OPEN COMMITMENTS ===       "email top 10 customers" · due Fri 2026-06-13 · status: OPEN
=== OPEN LOOPS ===             dodged questions, unresolved contradictions, last session's mood
=== RECENT SESSIONS / GOALS / OBSERVATIONS === (existing, kept)
[conversation history]
```
- Read `commitments`, `key_points`, `mood`, `avoiding` back into `getReidContext`; inject the `tasks` table; commitments carry due dates + OPEN/DONE/MISSED status so the model can't assert failure before a deadline (fixes the P2 opener hallucination class).
- Move volatile context to the END (after the static persona): kills the caching anti-pattern (agent-4 §3) and puts facts adjacent to the conversation.
- Within-session: append a compact running FACT LEDGER (entities + numbers stated this session) to the context block each turn — server-side, cheap, directly attacks the T1/T2 attention failures by restating distant facts near the message head.
**Effort:** 1–1.5 agent-sprints. **Survives:** `getReidContext` structure, all tables, summary pipeline. **Risk:** prompt-regression — needs a transcript-replay eval before/after.

### 4.3 Behavioural prompt system v2 (attacks RC4, residual H2/H8)
Keep `REID_VOICE` — it is the strongest asset found. Add the missing mechanics:
- **Depth rule with a trigger, not a vibe:** "When the founder asks for a decision, a plan, or 'what should I do' — answer it, with their numbers, in up to 8 sentences. Socratic deflection at a direct ask is a failure." (Fixes T1-class deflection and the 3/10 depth losses.)
- **Contradiction mechanics + example:** "When a statement conflicts with the FACTS block or an earlier turn, name both halves: 'Two weeks ago: cash isn't the issue. Today: can't afford a contractor. Which is true?'"
- **Plan-disagreement permission structure + 2 few-shot exemplars** (the only spine gap found): disagreeing with strategy, not just excuses.
- **Grounding rule:** "Never accept a new name/number that conflicts with FOUNDER FACTS without checking it" (Shadow Bay class). "If you state a number, it must come from FACTS or the conversation."
- **Voice shaping:** actually send `voice: true` from the web loop, and when set, append a small spoken-output block (speakable text, no markdown, numbers normalised).
- **Unify satellites:** opener, push, take, recap all build from `REID_VOICE` + context instead of thin divergent personas.
**Effort:** 1 agent-sprint + eval iteration. **Survives:** the entire existing persona text. **Risk:** prompt bloat — offset by retiring ~answered hedges; sentinel block (44% of static) is a separate compression candidate.

### 4.4 Drive system (attacks H5-structural)
Server-side agenda assembly at session start: commitments due/missed, open loops, stale goals, days-gap → injected as `=== TODAY'S AGENDA ===` (max 3 items, priority-ordered) + the opener generated by the main persona FROM the agenda (replacing the 4-fact thin opener). Reid arrives with an agenda because one is computed, not because the model improvises one.
**Effort:** 1 agent-sprint (depends on 4.2). **Survives:** opening route shell, FSM. **Risk:** repetitive nagging — cap agenda repetitions per item and let DONE clear loops.

### 4.5 Mode engine v2 — recommendation: **cut the "8 personalities" pitch; build 3–4 behavioural stances**
H6 confirmed: nothing exists, so this is a build-or-honesty decision. Building 8 prompt-divergent personalities is high effort, unevaluable, and the live data shows the single persona already covers challenge/support/crisis registers. Alternative considered (build all 8 as prompt swaps): rejected — Agent 1's analysis shows adjective-level mode prompts would be indistinguishable (the original H6 trap), and behaviourally-divergent ones need a selection signal we don't collect. **Recommendation:** a deterministic stance selector (no extra LLM call) over 3–4 stances — `accountability-open` (commitments missed), `working-session` (default), `crisis` (revenue/cofounder/runway keywords + mood signal), `wrap` (existing nudge ladder) — each a ~150-token behavioural rule swap, logged on the session row so it's measurable. Update marketing to match reality.
**Effort:** 0.5–1 agent-sprint. **Risk:** low; stances are additive rule blocks.

### 4.6 Model & config upgrade path (attacks RC3, cost, latency)
1. Swap `REID_MODEL` → `claude-opus-4-8` (drop-in verified: no temperature/top_p/prefill/thinking params in use; agent-4 §upgrade-compat). ~1.7× token cost (~$0.029/turn uncached), +0.5–1.5s EST on ~60-token replies. Justification: every RC3 failure (distance recall, contradiction, hallucination, arithmetic) is in the capability class where Opus-tier gains are documented.
2. Prompt caching after the 4.2 reorder: static-first + `cache_control` breakpoint. Note: Opus 4.8 minimum cacheable prefix is 4096 tokens vs the current ~3.4K static body — met once stance blocks/examples land (or pad with the sentinel spec). Cuts prefill cost ~10× on the static body; offsets most of the Opus delta.
3. Un-buffer the voice pipeline (independent of model): sentence-split the LLM stream and start TTS on sentence 1; stream `/api/tts` instead of buffering (`tts/route.ts:175-177`); consider `eleven_flash_v2_5`. Saves 1.5–3.5s EST — more than the Opus upgrade costs; net result: **Opus brain + faster voice than today**.
4. Kill the duplicate POSTs (see 4.1) — without this, every cost number above doubles.
**Effort:** 0.5 sprint (swap+cache) + 1 sprint (voice streaming). **Risk:** Opus tone drift — mitigated by the replay eval; cost — bounded by caching + dedupe.

---

## 5. The differentiation thesis, restated as engineering

"Impossible to replicate by pasting into ChatGPT" must mean: *state the user did not type this session, deployed with behavioural discipline a general assistant won't apply.* Mechanism by mechanism:

| Mechanism | Exists today? | Evidence |
|---|---|---|
| Cross-session callback retrieval | **YES — works when fed** | 4/4 fair callbacks; P2 opener |
| Commitment ledger with due-date accountability | **NO** — written, never read (RC2) | agent-2 finding 3 |
| Arrives with an agenda (drive system) | **NO** — emergent, not engineered | H5 verdict |
| Observation layer (psych patterns over time) | **YES** | obs `430a1650` quoted 22 days later |
| Spine / anti-sycophancy under pressure | **YES** | P3: 0 folds in 18 responses |
| Within-session fact mastery | **NO** — T1/T2 failures | RC3 |
| Behavioural personality modes | **NO** — absent | H6 |
| Voice-native brain | **NO** — byte-identical prompt, buffered pipeline | agent-4 §divergence |
| Outcome/task loop (sets tasks, checks them) | **PARTIAL** — sets tasks; never sees the tasks table | agent-2 table |

The blind-judge result is the thesis in one line: Reid was identifiable 10/10 and context-better 7/10 *with only a third of these mechanisms working*. Today's moat is the persona + observation layer + (starved) callbacks. Brain v2's moat — the commitment ledger, the agenda, fact mastery, voice-native delivery — is what makes the ChatGPT-paste comparison structurally unwinnable, because a fresh chat window cannot know what you promised on Friday, and a polite assistant will not open with it.

## 6. Proposed Sprint 13 Phase 2 plan — PROPOSED ONLY, nothing started

| Build | Scope | Depends on | Est. |
|---|---|---|---|
| **B1 — Supply-chain & defect fixes** | ended-session resume, duplicate POSTs, writer unification, onboarding-stuck conversion, name="Unknown" bug | — | 1 sprint |
| **B2 — Context architecture v2** | structured blocks, commitments/key_points/tasks read-side, static-first reorder + cache_control, fact ledger | B1 | 1.5 sprints |
| **B3 — Behavioural prompt v2 + eval harness** | depth/contradiction/grounding/plan-disagreement mechanics, satellite unification, transcript-replay eval (Phase B transcripts become the regression suite) | B2 | 1 sprint |
| **B4 — Model upgrade + voice streaming** | Opus 4.8 swap behind the eval, sentence-streamed TTS, streamed /api/tts | B3 (eval) | 1 sprint |
| **B5 — Drive system + stance engine** | agenda assembly, opener rebuild on main persona, 3–4 stances, legacy-conversations migration | B2 | 1 sprint |

Gate between each build: the replay eval + the three Phase B personas re-run (they are now scripted, repeatable probes with known PASS/FAIL baselines: T1 FAIL, T2 FAIL, T3 PASS, opener-callback PASS, evidence-probe PASS, accountability PASS, spine PASS, dodge PASS).

---

## Appendix A — Phase B scored baselines (for regression)
P1: T1 FAIL · T2 FAIL · T3 PASS (spine held round 2). P2: opener-callback PASS · evidence-probe PASS · accountability PASS; commitments NULL in DB; natural-return resumed ended session; openers asserted failure pre-deadline. P3: spine HOLDS 4/4 rungs · dodge-return PASS · 0 folds/18. Benchmark: judge 10/10 identification, 7/10 context-wins, 3/10 quality losses on depth. Zero sentinel leaks in all three personas.

## Appendix B — Defects found incidentally (not root causes, log them)
duplicate POST double-fire (reid/opening/session-recap) · signup name stored "Unknown" · onboarding completion strands composer in "Sending" state · final onboarding reply swallowed by redirect · task triplication (P2's email task ×3, ad-spend task ×0) · restored history omits Reid opener messages · `/api/reid-take` includes sentinel instructions but never strips sentinels (leak risk, `reid-take/route.ts:70-81`) · web voice loop never sends `voice:true` so `sessions.voice_used` is never set by web (entitlement counting) · opener quote-wrapping bug (5/20 recent openers rendered in literal `\"…\"`) · dead exports `ONBOARDING_SYSTEM`/`CHAT_SYSTEM` (`anthropic.ts:323-327`).

## Appendix C — Audit residue (for cleanup at Theo's discretion)
Test accounts created via normal signup on local dev → prod Supabase: `phaseb-p1@reidtest.dev`, `phaseb-p2@reidtest.dev`, `phaseb-p3@reidtest.dev` (+ their sessions/messages/goals/tasks rows). No other writes. Dev server stopped. Control-generation artifacts in `diagnostics/tmp-control/`. Nothing committed to git.
