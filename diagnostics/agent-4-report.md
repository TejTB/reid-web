# Agent 4 Report — Model & Inference Config

Audit date: 2026-06-11. Scope: every Anthropic call path in `/Users/theod/dev/reid-web`, model lineup vs frontier, voice-pipeline latency math, voice/text config divergence, hypotheses H3 and H4 (config portion). All claims cite file:line. Model lineup/pricing/caching facts come from the local `claude-api` skill (cached 2026-05-26), the most current documentation source available in this environment; latency throughput figures without a local doc source are **marked EST**.

---

## Executive summary

1. **The shipped model is `claude-sonnet-4-6`** (`src/lib/anthropic.ts:4`) for every conversational surface, plus `claude-haiku-4-5-20251001` for one summariser path (`src/lib/anthropic.ts:9`). Sonnet 4.6 is the **current** Sonnet-tier model — not deprecated, not retired — but it sits **two capability tiers below the frontier** (Opus 4.8 at $5/$25 per MTok, Fable 5 at $10/$50; Sonnet 4.6 is $3/$15). "Old model" is the wrong diagnosis; "mid-tier model for a product whose entire value proposition is persona depth and memory-weaving" is the accurate one.
2. **No sampling parameter is set anywhere.** Zero occurrences of `temperature`, `top_p`, `top_k`, `thinking`, or `effort` in `src/` (verified by grep). Every call runs API defaults. There is no config-level "flattening" — but also no tuning. Notably, Sonnet 4.6's `effort` defaults to **`high`** when unset, an unexamined latency/cost lever for a voice product (skill: model-migration guide, Sonnet 4.5→4.6 section).
3. **No prompt caching anywhere.** Zero `cache_control` breakpoints in the repo. Worse, the system prompt is assembled **volatile-content-first**: the per-user, per-turn FOUNDER CONTEXT is prepended *before* the ~3.4K-token static persona body (`src/lib/anthropic.ts:304-314`), so even adding a breakpoint today would cache nothing across users and little across turns. Every turn re-pays full-price prefill on ~4-5K system tokens plus the whole conversation history.
4. **Voice and text are byte-identical at the model layer.** Same route, same system prompt, same `max_tokens: 2048`, no voice flag reaches the prompt. The model is never told its words will be spoken aloud.
5. **The voice pipeline is fully sequential and fully buffered at every stage** (STT → complete LLM generation → complete TTS generation → full download → full decode → play). Estimated time-to-first-audible-word today: **~3.5–6.5s**. Because replies are prompt-capped at ~3 sentences (~40–80 tokens), upgrading to Opus 4.8 costs only **~+0.5–1.5s EST** — less than what fixing the pipeline's buffering would *save* (~1.5–3.5s EST).
6. **Verdicts:** H3 **PARTIAL** (no config flattening; model is current-gen but a tier below frontier; meaningful headroom exists in both model tier and unset levers). H4-config **REJECTED as a constraint** (`max_tokens: 2048` permits ~1,500-word essays; brevity is enforced purely by prompt text, not config).

---

## Per-call-path config table

All paths share one client: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })` (`src/lib/anthropic.ts:3`). `REID_MODEL = "claude-sonnet-4-6"` (`src/lib/anthropic.ts:4`); `REID_SUMMARY_MODEL = "claude-haiku-4-5-20251001"` (`src/lib/anthropic.ts:9`).

| # | Path | Model | temp / top_p / thinking / effort | max_tokens | Streaming | Caching | System prompt structure | Post-processing | Citations |
|---|------|-------|----------------------------------|------------|-----------|---------|-------------------------|-----------------|-----------|
| 1 | **Main conversation** `POST /api/reid` (chat + onboarding + all voice turns) | `claude-sonnet-4-6` | none set (API defaults; Sonnet 4.6 effort defaults `high`) | **2048** | **Yes** (`anthropic.messages.stream`) | **None** | Single plain **string**: `FOUNDER CONTEXT` (volatile, per-user) + `REID_VOICE` (~1,108 words / ~1.9K tok est) + `REID_SENTINEL_INSTRUCTIONS` (~847 words / ~1.5K tok est), plus mode-dependent nudge blocks appended at 14/16/22 messages | Streaming `SentinelStripper` (lookahead buffer, 4096-char hard cap), flush-regex final pass, `parseSentinels` on full raw text, `\x1eREID_ACTIONS` / `\x1eREID_SESSION_END` trailer markers | model/max_tokens/system/stream: `src/app/api/reid/route.ts:653-658`; prompt assembly: `src/lib/anthropic.ts:304-314`; nudges: `route.ts:586-606`; stripper: `route.ts:54-352`; trailers: `route.ts:928, 936` |
| 2 | **Session opener** `POST /api/reid/opening` ("Reid speaks first" line) | `claude-sonnet-4-6` | none set | **80** | **Yes** (`messages.stream`) | None | Single string built inline (`buildOpeningPrompt`) — a *different, much thinner* Reid persona ("You are Reid, an AI co-founder…", 20-word cap) | None — raw deltas to client; failures collapse to 204 | `src/app/api/reid/opening/route.ts:167-172` (call), `:52-78` (prompt) |
| 3 | **Reid's take** `POST /api/reid-take` (observation/goal/task breakdown) | `claude-sonnet-4-6` | none set | **400** | No (`messages.create`) | None | `buildSystemPrompt("")` — full persona **including sentinel instructions**, irrelevant here | Concat text blocks + trim; cached in `generated_take` column. ⚠️ **No sentinel stripping** — a `[OBSERVATION]`-style emission would reach the user verbatim | `src/app/api/reid-take/route.ts:67-81, 93-97` |
| 4 | **Session recap** `POST /api/session-recap` (recap overlay JSON) | `claude-sonnet-4-6` | none set | **700** | No | None | Single inline string demanding raw JSON (no structured outputs) | `JSON.parse` with ```` ```json ```` fence recovery + `clampRecap` length clamps | `src/app/api/session-recap/route.ts:103-109` (prompt), `:113-137` (call+parse) |
| 5 | **Observation pass** `POST /api/observe` (post-session clinical notes) | `claude-sonnet-4-6` | none set | **512** | No | None | Single inline string (`OBSERVE_SYSTEM_PROMPT`), JSON-only demand | Balanced-brace JSON extractor + Zod schema (max 2 observations) | `src/app/api/observe/route.ts:28-31` (prompt), `:163-173` (call), `:188-206` (parse) |
| 6 | **Abandoned-session summary** `POST /api/sessions/summarise` | `claude-sonnet-4-6` | none set | **400** | No | None | Single inline string, one-sentence plain text demand | Trim; drop if identical to onboarding summary | `src/app/api/sessions/summarise/route.ts:24-28` (prompt), `:120-130` (call), `:140-156` |
| 7 | **Task-complete acknowledgement** `POST /api/tasks/complete` | `claude-sonnet-4-6` | none set | **160** | No | None | `buildSystemPrompt("")` + appended `SYSTEM NOTE` instruction | Text block trim; failure → static toast | `src/app/api/tasks/complete/route.ts:81-94` |
| 8 | **Daily push message** `POST /api/push-message` | `claude-sonnet-4-6` | none set | **80** | No | None | `REID_VOICE` alone (no sentinels, no context block); context goes in the *user* message | Trim + wrapping-quote strip + onboarding-opener echo refusal; cached per-day in `users.push_message` | `src/app/api/push-message/route.ts:148-157, 169-175` |
| 9 | **Prior-session summariser** `generateSessionSummary` (called from /api/reid at next-session start and onboarding force-complete) | **`claude-haiku-4-5-20251001`** | none set | **512** | No | None | Single inline string (`SUMMARY_SYSTEM`), JSON demand | Fence-tolerant `parseSummaryJson`; non-JSON degrades to raw text; never throws (falls back to `SUMMARY_FALLBACK`) | `src/lib/reid-summary.ts:305-310` (call), `:240-247` (prompt), `:264-286` (parse); invoked at `src/app/api/reid/route.ts:804` and `route.ts:502-527` via `summarisePriorSession` |

**Non-Anthropic legs of the voice pipeline** (for completeness): STT is OpenAI `whisper-1`, `language:"en"` pinned, whole-clip non-streaming (`src/app/api/transcribe/route.ts:18, 94-100`). TTS is ElevenLabs `eleven_turbo_v2`, voice `gXoaQmnIbECYarWwg7B2`, `stability 0.4 / similarity 0.8 / style 0.3`, output mp3_44100_128, and the route **buffers the entire audio stream server-side** before responding (`src/app/api/tts/route.ts:15, 166-177`), with a 24h Redis cache keyed on MD5 of final text (`tts/route.ts:25, 138`).

**Prompt structure notes (apply to all paths):**
- Every `system` parameter is a **plain string**, never content blocks — so no per-block `cache_control` is even possible without a refactor.
- Zero `cache_control` anywhere in `src/` (grep-verified).
- Prefill is not used anywhere — correctly so: last-assistant-turn prefills return 400 on Sonnet 4.6 (skill: model-migration, "Breaking Changes by Source Model" §3). The JSON-demanding paths (#4, #5, #9) instead rely on prose instructions + tolerant parsers; the supported modern replacement is structured outputs via `output_config.format`, which none of them use.

---

## Current Anthropic lineup vs the shipped model

Source: `claude-api` skill, "Current Models" table (cached 2026-05-26) and `shared/models.md`.

| Model | ID | Context | Input $/MTok | Output $/MTok | Status |
|---|---|---|---|---|---|
| Claude **Fable 5** | `claude-fable-5` | 1M | $10.00 | $50.00 | Frontier (top tier, above Opus) |
| Claude **Opus 4.8** | `claude-opus-4-8` | 1M | $5.00 | $25.00 | Most capable Opus; current default recommendation |
| Claude Opus 4.7 / 4.6 | `claude-opus-4-7` / `-4-6` | 1M | $5.00 | $25.00 | Previous Opus generations, active |
| Claude **Sonnet 4.6** ← **Reid ships this** | `claude-sonnet-4-6` | 1M | $3.00 | $15.00 | **Current** Sonnet tier |
| Claude **Haiku 4.5** ← Reid's summariser | `claude-haiku-4-5` (full ID `claude-haiku-4-5-20251001`) | 200K | $1.00 | $5.00 | Current Haiku tier |

**Plain statement:** Reid is **not** running an outdated or retired model. `claude-sonnet-4-6` is the newest model in its tier and `claude-haiku-4-5-20251001` is a valid full ID for the current Haiku. However, Reid is running **two capability tiers below the frontier** (Sonnet < Opus 4.8 < Fable 5) — zero generations behind within-tier, two tiers behind across-tier. The skill's own default guidance is Opus 4.8 (`claude-opus-4-8`) unless the user explicitly chooses otherwise. The Haiku choice for one-shot JSON summarisation (#9) is correct and well-reasoned in the code comment (`src/lib/anthropic.ts:5-8`).

**Upgrade compatibility check (Opus 4.8):** Reid's call sites set no `temperature`/`top_p`/`top_k`, no `budget_tokens`, and no prefills — i.e. **none of the parameters that 400 on Opus 4.8/Fable 5** are present. A model-string swap at `src/lib/anthropic.ts:4` is a drop-in change for every path in the table. Caveats from the skill (migration guide, "Migrating to Opus 4.8"): (a) thinking is *off* when the `thinking` param is omitted — same as today's behaviour; (b) on Fable 5 specifically, an explicit `thinking: {type:"disabled"}` 400s (omit instead); (c) Opus 4.7+ counts tokens differently — re-baseline cost dashboards; (d) per-tier minimum cacheable prefix rises from 2048 (Sonnet 4.6 / Fable 5) to 4096 tokens (Opus 4.8) — Reid's ~3.4K-token static body would cache on Sonnet 4.6 and Fable 5 but **not** on Opus 4.8 without adding more stable prefix content.

**Cost per main-conversation turn** (assumes ~4.5K system tokens + ~1K history avg + ~60 output tokens; no caching, as shipped):
- Sonnet 4.6: ~$0.017/turn
- Opus 4.8: ~$0.029/turn (~1.7×)
- Fable 5: ~$0.058/turn (~3.4×)
With prompt caching of a reordered static body (5-min ephemeral, reads at ~0.1× input price), the static ~3.4K tokens drop from ~$0.010 to ~$0.001/turn on Sonnet, making an Opus upgrade roughly cost-neutral against today's uncached Sonnet spend.

---

## Voice-pipeline latency math

**Architecture finding (dominates everything):** the loop is strictly sequential and buffered at *every* boundary. Evidence:
1. Voice turn waits for the **complete** LLM stream — `runReidTurn` resolves only after `streamWithRetry` finishes accumulating the full reply (`src/app/(app)/chat/page.tsx:523-548`), then hands the finished text to TTS (`src/lib/useVoiceLoop.ts:294-298`).
2. `/api/tts` collects the **entire** ElevenLabs stream into a Buffer before sending one response (`src/app/api/tts/route.ts:175-177`).
3. The client reads the **whole** mp3 (`res.arrayBuffer()`), then fully decodes via `decodeAudioData`, before `source.start()` (`src/lib/voice.ts:206-266`).

So: time-to-first-audible-word = STT(full) + LLM(TTFT + full generation) + TTS(full generation) + download + decode. The LLM's streaming is consumed for the on-screen typewriter only; the *ear* gets nothing until everything is done.

**Assumptions (stated):** typical founder clip 5–10s; typical Reid reply 40–80 output tokens (the prompt caps at "Maximum 3 sentences", `src/lib/anthropic.ts:77`), ≈ 10–15s of speech; uncached ~5K-token prompt prefill; no TTS cache hit (replies are model-generated and rarely byte-identical, so the MD5 cache mostly serves repeats of openers/canned lines). Throughput figures are **EST** — no authoritative tokens/sec document was available locally; ranges reflect commonly observed streaming rates for each tier.

| Stage | Today (Sonnet 4.6) | Opus 4.8 (EST) | Fable 5 (EST) |
|---|---|---|---|
| STT — whisper-1, full clip | 0.7–1.5s | same | same |
| LLM TTFT (uncached ~5K prefill, thinking off) | 0.8–1.5s | 1.0–2.0s | 1.2–2.5s |
| LLM generation, 60 tok | @ ~60–80 tok/s EST → 0.8–1.0s | @ ~30–50 tok/s EST → 1.2–2.0s | @ ~25–40 tok/s EST → 1.5–2.4s |
| TTS — eleven_turbo_v2, full buffer for ~12s audio | 0.8–2.0s | same | same |
| Download + decode | 0.3–0.5s | same | same |
| **Time to first audible word** | **~3.5–6.5s** | **~4.0–8.0s (+0.5–1.5s)** | **~4.5–8.9s (+1.0–2.4s)** |

**Interpretation:**
- Because the persona prompt caps replies at ~3 sentences, the model-upgrade latency penalty is **small in absolute terms** (the generation delta on 60 tokens is well under a second; TTFT delta is the larger share).
- Enabling adaptive thinking on an upgraded model would add a variable 1–5s+ EST per turn — **do not** enable it for the voice turn path; leave `thinking` omitted (off by default on Opus 4.7/4.8; on Fable 5 omit the param entirely, since explicit `disabled` 400s).
- **The pipeline architecture costs more than any model choice.** Three changes, all model-agnostic, recover more than an Opus upgrade spends: (a) sentence-split the LLM stream and start TTS on sentence 1 while the rest generates; (b) stream the ElevenLabs response through `/api/tts` instead of buffering (`tts/route.ts:175-177`), or use ElevenLabs' lower-latency `eleven_flash_v2_5`; (c) add prompt caching (after reordering — see below) to cut TTFT prefill. Combined EST saving: **1.5–3.5s**, i.e. an Opus 4.8 + fixed-pipeline configuration would be *faster than today's* Sonnet + buffered pipeline.
- Prompt-caching prerequisite: `buildSystemPrompt` puts the volatile FOUNDER CONTEXT *first* (`src/lib/anthropic.ts:306-310`) — the exact anti-pattern the skill's caching guide warns about ("keep stable content first"). Reordering to static-persona-first + context-last + a `cache_control` breakpoint after the static body (3.4K tok > Sonnet's 2048 minimum) would make turns 2–20 of every session hit cache on the persona and prior history.

---

## Voice/text path divergence

**Verdict: zero divergence at the model layer.** Evidence chain:
- The web voice loop calls the **same** `streamWithRetry` → `streamReid` → `POST /api/reid` pipeline as typed chat, with the identical body `{ mode: "chat", sessionId, messages }` (`src/app/(app)/chat/page.tsx:204-209` for text, `:523-531` for voice; onboarding equivalent at `src/app/onboarding/OnboardingClient.tsx:163-168, 233-241`).
- A `voice: boolean` flag exists in the request schema (`src/lib/validation.ts:21`) but: (a) the **web voice loop never sends it** — only the native client does (grep: no `voice: true` in any client call site; the only reference is the route comment `src/app/api/reid/route.ts:531`); (b) even when sent, its sole effect is flagging `sessions.voice_used = true` for entitlement counting (`route.ts:533-535`). It changes **nothing** about model, prompt, max_tokens, or post-processing.
- Consequences: (1) the model is never told its output will be spoken — no "speakable text" instruction, no number/abbreviation normalisation; markdown is regex-stripped after the fact in `/api/tts` (`tts/route.ts:59-67`); (2) `max_tokens` is 2048 for voice turns just as for text; (3) side finding outside this agent's domain but worth flagging: since web voice never sends `voice: true`, `sessions.voice_used` is never set by the web loop, which the entitlement gate reportedly counts on (`route.ts:529-535`).

---

## Hypothesis verdicts

### H3 — model/config ceiling: **PARTIAL**

**Rejected components:**
- "Older/weaker model" in the generational sense: `claude-sonnet-4-6` is the current Sonnet and `claude-haiku-4-5-20251001` the current Haiku (`src/lib/anthropic.ts:4, 9`; skill models table). Nothing is deprecated or retired.
- "Temperature/max_tokens config flattening personality": no sampling parameter is set anywhere in the repo (grep-verified across `src/`), so every call runs the API default — there is no low-temperature flattening, and `max_tokens: 2048` (`src/app/api/reid/route.ts:655`) does not clip the main conversation.

**Confirmed components:**
- **Tier ceiling is real.** The product's differentiator — a persona that notices subtext, weaves memory across sessions, and lands psychologically precise observations — is exactly the workload class where the skill documents Opus-tier gains ("knowledge work", "memory", "more willing to push back", "stronger thought partner"; migration guide, Opus 4.8 capability sections). Reid runs the $3 tier for this. Every config knob that could compensate (effort tuning, thinking) is also unset.
- **Several ancillary "personality" surfaces are config-starved:** the daily push message gets `max_tokens: 80` with no founder-context block in the *system* prompt (`src/app/api/push-message/route.ts:148-152`), and the session opener gets `max_tokens: 80` with a thin, *different* persona prompt that never includes `REID_VOICE`'s actual voice rules (`src/app/api/reid/opening/route.ts:52-78`) — these are the first Reid lines a returning user sees, generated under the most constrained configs in the codebase.
- **No prompt caching + volatile-first prompt ordering** (`src/lib/anthropic.ts:304-314`) is a latency/cost ceiling rather than a personality one, but it directly blocks the cheap path to an Opus upgrade.

**Net:** config is not actively flattening the persona, but the model tier plus untouched defaults form a genuine ceiling. A drop-in `claude-opus-4-8` swap is API-compatible today (no 400-risk parameters in use) at ~1.7× token cost, latency-affordable (+0.5–1.5s EST, recoverable several times over by un-buffering the pipeline).

### H4 (token-cap portion) — does config constrain responses to voice-appropriate brevity? **REJECTED (config permits essays)**

- Main conversation `max_tokens: 2048` (`src/app/api/reid/route.ts:655`) allows ~1,500 words — essay-length. Nothing in config enforces voice-appropriate brevity.
- Brevity is enforced **entirely by prompt text**: "Maximum 3 sentences in normal conversation" (`src/lib/anthropic.ts:77`) plus "Short sentences. Rhythm over length." (`src/lib/anthropic.ts:219`). If responses feel uniformly clipped/terse-generic, the cause is this prompt rule (Agent on prompts' domain), not a token cap.
- Ancillary paths *are* config-capped, deliberately and tightly: opener 80, push 80, ack 160, take 400, summarise 400, observe 512, summary 512, recap 700 (table above). The two 80-token caps are the only ones tight enough to plausibly degrade output quality on their surfaces.
- No voice-specific `max_tokens` exists (see divergence section) — voice turns can also, in principle, produce a 2,000-token reply that the founder must then sit through as ~4 minutes of TTS; only the prompt rule prevents this.

---

## Appendix — measured prompt sizes

- `REID_VOICE`: 1,108 words / 6,907 chars ≈ **~1.9K tokens EST** (`src/lib/anthropic.ts:19-225`)
- `REID_SENTINEL_INSTRUCTIONS`: 847 words / 5,335 chars ≈ **~1.5K tokens EST** (`src/lib/anthropic.ts:227-299`)
- FOUNDER CONTEXT: variable, ~200–800 tokens EST (goals, 5 session summaries, 8 observations, 10 goal events; `src/lib/reid-context.ts:146-230`)
- Static body ≈ 3.4K tokens — above Sonnet 4.6's 2,048-token cache minimum, **below Opus 4.8's 4,096-token minimum** (skill: prompt-caching API reference table).
