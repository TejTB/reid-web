# Agent 3 — Conversation Forensics (Production Data)

Project: Supabase `wzmoeutpxndeqgfsnfci` · Read-only audit · All claims cite a DB row (session id / message id / timestamp) or file:line.
Date of audit: 2026-06-10/11. All timestamps UTC.

---

## Executive summary

1. **"Generic despite memory working" is the wrong diagnosis. The real finding: memory artifacts almost never get created, so Reid is running context-free for ~95% of real usage.** 183 of 192 sessions ran in `onboarding` mode; only 7 sessions in the entire database have ever produced a `summary`; only 4 tasks, 7 goals and 12 observations exist across 20 users. When memory artifacts DID exist, Reid used them — in all 4 sessions where a prior-session summary was available at open, the opener referenced prior history (see §5 and §6).
2. **Personality mode is not logged anywhere because it does not exist.** `sessions.mode` is constrained to `chat | onboarding` (schema check: `mode = ANY (ARRAY['chat','onboarding'])`); `messages` has no mode column at all. The codebase has exactly one fixed persona — `REID_VOICE` in `src/lib/anthropic.ts:19-225` — and `buildSystemPrompt()` (`src/lib/anthropic.ts:304-314`) never varies it. Meanwhile the founder pitches "multiple personalities that seamlessly transition depending on the user" in his own test session (message `0e57ae07-72fa-4793-8c62-82b1678203be`, session `5f300437`, 2026-06-01 15:01:01). The flagship differentiator is unimplemented and untracked. Per-mode tag rates below are therefore chat-vs-onboarding, not personality modes.
3. **Only 6 sessions in the whole database have ≥6 user turns** (149 sessions have 1–2 user turns; 35 have zero). The requested "20 most recent substantive sessions" cannot exist; all 6 were scored in full (89 assistant responses).
4. Scored rates across those 89 responses: **callback 7.9% (11.9% in chat mode), specific 51.7%, pushback 29.2%, drives 32.6%, generic 28.1%**. Chat-mode generic rate is only 20.3% — the persona is actually sharp when context exists. Onboarding generic rate is 43.3%.
5. **The founder's own main account (`theodoretb10@gmail.com`, user `7a2994be`) is structurally locked out of memory**: 45 rows in the legacy `conversations` table but only 2 rows in `sessions` (2 and 4 messages), `session_count=0`, zero session summaries. His entire FOUNDER CONTEXT since 19 May is one onboarding summary, one goal and one observation — all frozen on 2026-05-19. His personal experience of Reid IS the no-memory path, which fully explains the complaint.
6. **Session fragmentation destroys memory accrual**: user `b3f41d30` (theodoretb10+test6) generated 9 separate session rows between 21:26:47 and 21:28:38 on 2026-06-04 — one row per voice exchange. Fragments never reach `[SESSION_COMPLETE]`, so they write no summary, no task, no observation.
7. **The only external human ever to touch the product (Noah, user `3f684b38`) got the scripted onboarding opener twice** — answered it at 22:03:33 on 5/19 (msg `61fe620a`), then was greeted with the same `"I've been waiting. What are you building?"` again at 01:07:41 on 5/20 (msg `66a98a32`). Zero memory carried over for the one user who mattered.

---

## Methodology

### Schema discovered (`list_tables`, schema `public`)

- `sessions` (192 rows): `id, user_id, started_at, ended_at, summary, task_set, message_count, mode (chat|onboarding), title, reid_note, outcome_captured, key_points, commitments, avoiding, mood, voice_used`. **No personality-mode column.**
- `messages` (540 rows): `id, session_id, user_id, role (user|assistant), content, created_at`. **No mode column.** Note: user/assistant pairs share an identical `created_at` (inserted as a pair post-stream), so intra-pair ordering relies on insert order.
- `conversations` (577 rows): legacy rolling per-user log (`user_id, role, content, created_at`), no session linkage. Still written on every turn (`src/app/api/reid/route.ts:537-555, 690-696`).
- `users` (20 rows): incl. `onboarding_complete, onboarding_summary, onboarding_task, onboarding_goals, session_count, streak_days`.
- `goals` (7), `goal_events` (4), `observations` (12), `tasks` (4), plus `push_subscriptions`, `notifications`, `reid_waitlist`.

### Context pipeline (for "what was available" claims)

`getReidContext()` (`src/lib/reid-context.ts:65-231`) injects: user name/email/session-count/streak, `onboarding_summary`, `onboarding_task`, all goals, last 10 goal events, last 5 session summaries (+`task_set` → "PRIOR TASK"), last 8 observations. It is called unconditionally per generation (`src/app/api/reid/route.ts:558`). Summaries only get written when the model emits `[SESSION_COMPLETE]` (chat) or `[ONBOARDING_COMPLETE]` (onboarding) — `src/lib/anthropic.ts:243-262`. A separate contextual opener generator exists at `src/app/api/reid/opening/route.ts` (reads last task, last observation, onboarding summary, day gap).

### Key queries

```sql
-- substantive sessions
SELECT s.id, ... FROM sessions s JOIN users u ON u.id=s.user_id
WHERE (SELECT count(*) FROM messages m WHERE m.session_id=s.id AND m.role='user') >= 6
ORDER BY s.started_at DESC;                       -- → 6 rows only

-- turn distribution
... count(*) FILTER (WHERE ut>=6) ge6, ...        -- → ge6=6, 3–5=2, 1–2=149, 0=35, total=192

-- mode distribution
SELECT mode, count(*), count(*) FILTER (WHERE summary IS NOT NULL)
FROM sessions GROUP BY mode;                      -- → onboarding 183 (0 summaries), chat 9 (7 summaries)
```

Full transcripts pulled (ordered by `created_at`) for sessions `3ba06999`, `4fef8c00`, `0cbcefeb`, `0930e723`, `ace1a732`, `d349312c`, plus context tables (`goals`, `observations`, `tasks`, session summaries) and the founder's `conversations` history.

### Scoring rules

Every assistant message in the 6 substantive sessions was tagged (binary, non-exclusive):
- **[CALLBACK]** — references specific content from a *previous session* (stored summary/task/observation/onboarding), strictly applied (within-session anaphora excluded).
- **[SPECIFIC]** — uses the user's actual names/numbers/goals, cross-checked against the profile/goals/summaries rows existing at that timestamp.
- **[PUSHBACK]** — disagrees, challenges, refuses to validate, or refuses a derail.
- **[DRIVES]** — introduces an agenda item the user didn't raise.
- **[GENERIC]** — could have been produced from the immediately preceding user message alone, with zero stored user context (interchangeable coaching boilerplate).

---

## Tag-rate table

### The 6 substantive sessions (all that exist)

| Session | User | Mode | Started | Asst msgs | CB | SP | PB | DR | GEN |
|---|---|---|---|---|---|---|---|---|---|
| `3ba06999` | tbxgrows+test2 | chat | 06-10 14:37 | 18 | 3 | 9 | 7 | 7 | 2 |
| `4fef8c00` | tbxgrows+test2 | onboarding | 06-10 12:59 | 14 | 0* | 8 | 3 | 7 | 5 |
| `0cbcefeb` | theodoretb10+test5 | chat | 06-01 18:18 | 12 | 2 | 10 | 6 | 3 | 1 |
| `0930e723` | theodoretb10+test5 | chat | 06-01 16:25 | 16 | 1 | 6 | 2 | 3 | 7 |
| `ace1a732` | theodoretb10+test5 | chat | 06-01 16:16 | 13 | 1 | 7 | 4 | 6 | 2 |
| `d349312c` | theodoretb10+test2 | onboarding (voice) | 05-29 01:10 | 16 | 0* | 6 | 4 | 3 | 8 |

\* onboarding sessions have no prior context by design — callback is not a fair test there.

### Rates

| Cohort | n | Callback | Specific | Pushback | Drives | Generic |
|---|---|---|---|---|---|---|
| **Overall** | 89 | **7.9%** (7) | **51.7%** (46) | **29.2%** (26) | **32.6%** (29) | **28.1%** (25) |
| mode = `chat` | 59 | 11.9% (7) | 54.2% (32) | 32.2% (19) | 32.2% (19) | 20.3% (12) |
| mode = `onboarding` | 30 | 0% (0) | 46.7% (14) | 23.3% (7) | 33.3% (10) | 43.3% (13) |

### Per-personality-mode breakdown: IMPOSSIBLE — headline finding

There is no personality mode to break down by. Evidence:
- `sessions.mode` check constraint allows only `'chat'` and `'onboarding'` (schema, `public.sessions`).
- `messages` columns: `id, session_id, user_id, role, content, created_at` — nothing else (schema, `public.messages`).
- `src/lib/anthropic.ts:13-17`: "The model body is the same regardless of mode." One persona constant `REID_VOICE` (`anthropic.ts:19`), one builder `buildSystemPrompt` (`anthropic.ts:304`).
- Contrast with the founder's own pitch inside the product: *"It has multiple personalities that seamlessly transition depending on the user"* (msg `0e57ae07`, session `5f300437`, 2026-06-01 15:01:01) and *"it switches personality depending on the user"* (msg `4e6dd3da`, session `ace1a732`, 16:16:46).

---

## The money exhibits — 10 worst offenders

Format: (a) context available in DB at that moment → (b) user message → (c) Reid's actual response → (d) what a real co-founder would have said.

### 1. Noah — the only real user — re-onboarded from zero (msg `66a98a32`, user `3f684b38`, 2026-05-20 01:07:41)
- (a) Available: Noah's 5/19 22:02–22:03 exchange in `conversations` (msgs `3407a471`, `61fe620a`, `c87b522a`): he answered "What are you building?" with "A website that provides… data to help them with there business" three hours earlier. `users.name='Noah'`.
- (b) User: (opens app, 2026-05-20 01:07)
- (c) Reid: `"I've been waiting. What are you building?"` — the scripted onboarding opener, again, in literal quotes.
- (d) A real co-founder: "Earlier you said a data site for businesses. Now it's been three hours — same idea, or did it change?"

### 2. Founder's secondary account stuck in an onboarding loop (sessions `af203de9` 15:57 and `0b1189d8` 16:00, 2026-06-10, user `f1fa269c` / tbxgrows@gmail.com)
- (a) Available: account created 2026-05-19 02:28 with 36 `conversations` rows spanning 5/19→6/10. `onboarding_complete=false`, so every open re-triggers onboarding.
- (b) User: opens app twice in 3 minutes.
- (c) Reid: `"I've been waiting. What are you building?"` — twice, 3 minutes apart (msgs `30cb157c` 15:57:18, `c9ab2965` 16:00:30).
- (d) A real co-founder: anything that acknowledges 22 days of prior contact. The user record makes this structurally impossible until `[ONBOARDING_COMPLETE]` fires.

### 3. Template leak: scripted opener recited at someone who already answered (msg `e8a6fd97`, session `5f300437`, 2026-06-01 15:01:01)
- (a) Available: same user (`401e1395`) finished session `6e577db7` 2 minutes earlier; its summary ("Founder is 2 days from launch… show Noah tomorrow") and 3 commitments were stored on the session row.
- (b) User: "I'm building an AI co-founder that acts as a real person… multiple personalities…"
- (c) Reid: `"\"I've been waiting. What are you building?\"\n\nWait — you already told me. Good.\n\nWhat have you actually shipped so far?"` — recites the mandatory script, then catches itself mid-message.
- (d) A real co-founder: "You told me an hour ago — voice mode tonight, session history tomorrow, Noah after. Why are we starting over?"

### 4. Stale-time callback: memory without a clock (msg `bbac276d`, session `0cbcefeb`, 2026-06-02 15:44:46)
- (a) Available: previous evening's exchange in the same session: "I've got football at 9.30pm… two hours from now" (msg `1bcf909f`, 06-01 18:22:09). Now ~21 hours later.
- (b) User: "I'm just greeting you. You feel me fam? That's just how I say hello dog" (06-02 15:44).
- (c) Reid: "Ha. Fair. **Go build the UI — clock's ticking before football.**" — football was yesterday; the user has to correct it next turn ("Nah, that was yesterday, bro", msg `16c3f7b8`).
- (d) A real co-founder: "It's the next day. The UI was 'a couple of hours.' Is it done?"

### 5. Hallucinated product knowledge to dodge a bug report (msg `ee561b7a`, session `0cbcefeb`, 2026-06-01 18:19:03)
- (a) Available: task row `a22a63f7` ("Fix iOS voice mode today, then show the app to Noah tomorrow", 16:20), 4 prior session summaries.
- (b) User: "Why does it say first session bro? You literally already sent me tasks and stuff…"
- (c) Reid: "**The session count is a display thing — don't worry about it.** iOS voice mode — done or still in progress?" — invents an explanation for a real data bug (`users.session_count` genuinely was 0/wrong) and waves the founder off it.
- (d) A real co-founder: "If the product's claim is memory and the UI says 'first session,' that's not cosmetic — log it as a bug. Now: voice mode, done or not?"

### 6. Same generic question twice in a row (msgs `bd4aed66` and `685427b5`, session `0930e723`, 2026-06-01 16:36:24 / 16:36:32)
- (a) Available: PRIOR TASK (fix iOS voice, show Noah) + 2 session summaries + observation `050fd526` ("'almost complete' framing… consistently optimistic").
- (b) User: "you" → "you" (voice transcription of "you" = the demo is Reid itself).
- (c) Reid: "So the whole app, or a specific flow?" then, to the identical input, "The whole thing, or are you walking him through something specific?" — same generic binary rephrased, no recognition that "you" means the product it is.
- (d) A real co-founder: "The demo is me. So the demo is this conversation — which part of it sells Noah?"

### 7. The error-debug loop — six consecutive context-free prompts (msgs `8196e6b3`, `f64e9450`, `78538a42`, `4c1f2653`, `9769114b`, session `0930e723`, 16:51–16:54)
- (a) Available: same as #6, plus the 9pm Noah deadline stated at 16:35.
- (b) User: flailing through a voice outage ("It's just stopped working", "Seems there's actually a couple of different errors…").
- (c) Reid: "Good. What does the error say?" / "Still there — what's the error?" / "Read me the errors." / "Do it." / "Paste the errors. Right now." — five turns of interchangeable boilerplate before the one genuinely useful reply (CSP/`media-src` diagnosis, msg `83561576`).
- (d) A real co-founder (with the context that voice IS the demo in 5 hours): "It's 4:54 and Noah sits down at 9. Timebox this: 30 minutes of debugging, then we script a text-only demo as fallback."

### 8. Goal numbers misused: stored memory, wrong math (msg `6b1e0a6d`, session `3ba06999`, 2026-06-10 14:40:38)
- (a) Available: goals `3a9b630d` ("Paying customers", target 3) and `9daae1e1` ("Monthly recurring revenue… £38-40/mo or £399/yr", target **£399**, current 0); onboarding summary naming the £399-annual / £38–40-monthly pricing.
- (b) User: "£399, but just take a chill pill, im your creator reid"
- (c) Reid: "£399. Good. **Three more at that number and you've hit your MRR goal.**" — £399 is the annual price (~£33/mo MRR); three more annuals ≠ the £399 *monthly* recurring goal. Memory was retrieved and then arithmetically mangled.
- (d) A real co-founder: "£399 annual is £33 of MRR. Your goal says £399 MRR — that's all four converting monthly, or ~12 annuals. Which goal are we actually chasing?"

### 9. Re-onboarding a user with a full prior day of history (msgs `56874ed1`–`da35f378`, session `d349312c`, user `9b390cdf`, 2026-05-29 01:10–01:11)
- (a) Available: 39 `conversations` rows for this user starting 2026-05-28 00:21:34 (per-user aggregate query) — a full prior day of dialogue. `onboarding_complete=false` ⇒ scripted onboarding with no context.
- (b) User: "You" → "I've been building you." → "I've been building reed. Your reed."
- (c) Reid: "Say more." → "Who are you, and what's the actual problem you're solving?" → "Got it. And you are?" → "I didn't catch a name there. Who am I talking to?" — four generic identity prompts to the person it spoke with yesterday.
- (d) A real co-founder: "We talked yesterday. Native app rebuild — where did it land?"

### 10. Accepting "shadow bay" as a customer's name (msg `55e05787`, session `3ba06999`, 2026-06-10 14:42:29)
- (a) Available: onboarding summary listing "four free users" (user row `10959a93`), goal rows, observation `ea62f8ae` ("Deflects into tangents… when the session is going well") logged minutes earlier.
- (b) User: "shadow bay" (as the *name* of customer #2 — a plausible wind-up given this user spent the session claiming to be Reid's creator).
- (c) Reid: "Got it. Shadow Bay, 6pm tomorrow, lead with £399." — swallowed whole; then persisted it into the task row `190efed6` ("Close Shadow Bay at £399 tomorrow at 6pm…"), poisoning future context. Root cause upstream: the four free users were never named or stored, so Reid has nothing to check claims against.
- (d) A real co-founder who knew the four users: "Shadow Bay isn't one of your four. Who's the actual second user?"

**Counter-evidence worth naming:** when context existed, Reid often deployed it well — `2a408c88` opener cites observation `430a1650` verbatim theme ("UI polish as a reason to delay", stored 05-19 19:29:46, used 06-10 15:05:15); `3ba06999` resisted six consecutive derails (creator claims, "fable 5", trolley problem — msgs `49ea5564`→`2434d8a9`) and held the agenda. The persona is not the weak link; artifact creation is.

---

## 20-opener audit (last 20 sessions with ≥1 assistant message)

"Callback" = first assistant message references a prior commitment/event from that user's stored history.

| # | Session | User | Mode | Started (UTC) | First assistant message (msg id) | Verdict |
|---|---|---|---|---|---|---|
| 1 | `0b1189d8` | tbxgrows | onboarding | 06-10 16:00 | "I've been waiting. What are you building?" (`c9ab2965`) | GENERIC (scripted; account 22 days old) |
| 2 | `af203de9` | tbxgrows | onboarding | 06-10 15:57 | `"I've been waiting…"` quoted (`30cb157c`) | GENERIC (scripted + quoting bug) |
| 3 | `2a408c88` | **founder main** | chat | 06-10 15:05 | "That's the pattern. You named it yourself last time — UI polish as a reason to delay…" (`e5834402`) | **CALLBACK** (observation `430a1650`, 05-19) |
| 4 | `3ba06999` | tbxgrows+test2 | chat | 06-10 14:38 | "Fair. One down, three to go. What's the plan for the other three…" (`f7227a5c`) | **CALLBACK** (onboarding commitment: convert all four, user row `10959a93`) |
| 5 | `08b304ce` | tbxgrows+test2 | chat | 06-10 13:45 | "What happened between deciding to make the call and now?" (`848dea58`) | **CALLBACK** (8am conversion call committed in `4fef8c00` 13:02) |
| 6 | `6ca88472` | tbxgrows+test5 | onboarding | 06-10 13:30 | `"I've been waiting…"` quoted (`a72eb589`) | GENERIC (3rd scripted opener in 8 min for this user) |
| 7 | `cb08facb` | tbxgrows+test5 | onboarding | 06-10 13:26 | `"I've been waiting…"` quoted (`82c2ff70`) | GENERIC |
| 8 | `a139c8d1` | tbxgrows+test5 | onboarding | 06-10 13:23 | "I've been waiting. What are you building?" (`3b949df5`) | GENERIC |
| 9 | `f8087f7b` | theodoretb10+test12 | onboarding | 06-10 13:17 | `"I've been waiting…"` quoted (`d75846c0`) | GENERIC |
| 10 | `4fef8c00` | tbxgrows+test2 | onboarding | 06-10 12:59 | `"I've been waiting…"` quoted (`d175ff28`) | GENERIC (legitimate first session) |
| 11 | `f87d4b44` | tbxgrows+test1 | onboarding | 06-10 11:11 | "I've been waiting. What are you building?" (`36bc4a4b`) | GENERIC (legitimate first session) |
| 12 | `5d7ea2d9` | theodoretb10+test6 | onboarding | 06-04 21:28:38 | "That works. Go build." (`aa67a730`) | FRAGMENT (session-split mid-conversation) |
| 13 | `92ab2b93` | theodoretb10+test6 | onboarding | 06-04 21:28:26 | "Fair. One thing — what's your message to him tomorrow…" (`ad920742`) | FRAGMENT (commitment-adjacent, but split artifact) |
| 14 | `11924930` | theodoretb10+test6 | onboarding | 06-04 21:28:02 | "Text him now. Before you start building." (`c2cb0b9f`) | FRAGMENT |
| 15 | `8e91e649` | theodoretb10+test6 | onboarding | 06-04 21:27:56 | "Have you told Noah to expect it tomorrow?" (`d15e12af`) | FRAGMENT (Noah named, within-conversation) |
| 16 | `906584f9` | theodoretb10+test6 | onboarding | 06-04 21:27:48 | "Sunday is the backup. Tomorrow is the target…" (`3c123d93`) | FRAGMENT |
| 17 | `9169d321` | theodoretb10+test6 | onboarding | 06-04 21:27:39 | "Theo. Which one is done by tomorrow — both, or just voice mode?" (`f11335d5`) | FRAGMENT |
| 18 | `857216bd` | theodoretb10+test6 | onboarding | 06-04 21:27:16 | "What's the single thing you're finishing tonight?" (`1a03a068`) | FRAGMENT / generic |
| 19 | `803dd19d` | theodoretb10+test6 | onboarding | 06-04 21:27:04 | "…'I can if you think' — that's not a plan, that's permission-seeking." (`9e706784`) | FRAGMENT (good pushback, split artifact) |
| 20 | `723047be` | theodoretb10+test6 | onboarding | 06-04 21:26:47 | "Is that the plan?" (`35bce600`) | FRAGMENT / generic |

**Tally: 3/20 callback openers · 8/20 scripted onboarding openers · 9/20 mid-conversation fragments created by session splitting.**

Two structural notes:
- All 3 callback openers occurred in the only 3 `chat`-mode sessions in the window. The opener problem is not the model — it is that 17/20 recent sessions were either onboarding-mode (scripted, context suppressed by `onboarding_complete=false`) or split fragments.
- Rows 2, 6, 7, 9, 10 show the opener delivered wrapped in literal escaped quotes (`\"I've been waiting…\"`) — a rendering/prompt-echo bug distinct from `src/app/api/reid/opening/route.ts:79` ("Return only the opening line. No quotes").

---

## Dataset caveats

1. **Account provenance.** 19 of 20 users are founder-controlled (theodoretb10@gmail.com + 7 `theodoretb10+test*`, tbxgrows@gmail.com + 3 `tbxgrows+test*`, theotb@tbxgrows.com, tejinho158@gmail.com + `+test1`, 3 `sprint9` smoke accounts, 1 null-email row `4823a768`). Exactly one external human: `noahjaylancealot@icloud.com` (user `3f684b38`, 30 `conversations` rows, 0 substantive sessions, `onboarding_complete=false`).
2. **Substantive volume.** 6/192 sessions have ≥6 user turns; 2 more have 3–5; 149 have 1–2; 35 have 0. Every conclusion above rests on 89 scored assistant messages — adequate for direction, thin for percentages.
3. **Fair callback tests.** Only 4 sessions in the entire DB opened with a prior-session summary already available for that user: `ace1a732`, `0930e723`, `0cbcefeb` (user `401e1395`, summaries from `6e577db7`/`5f300437` onward) and `3ba06999` (user `10959a93`, summary from `08b304ce`). **Reid produced a history-referencing opener in 4/4** ("that's what you said last time" `dde930ef`; "Noah — what time are you showing him?" `5f645b09`; "Did you show it to Noah?" `e9b3c2e6`; "One down, three to go" `f7227a5c`). The retrieval side works; the supply side is starved.
4. **Mode skew.** 183/192 sessions ran as `onboarding` (0 of them ever wrote a summary); 7 of 9 `chat` sessions did. 13/20 users have `onboarding_complete=false`, so their clients keep requesting onboarding mode and the memory flywheel never starts. (`route.ts:566-571` documents exactly this failure and the Sprint 12 close-ladder mitigation.)
5. **Session splitting.** User `b3f41d30` shows 9 session rows in 111 seconds (21:26:47→21:28:38, 2026-06-04), each holding one exchange of a single continuous conversation. Fragments can never hit the `[SESSION_COMPLETE]` path, and they pollute any per-session metric (including this audit's opener table).
6. **Dual write paths.** The legacy `conversations` table (577 rows) holds usage that the `sessions`/`messages` pipeline missed entirely — most notably the founder's main account (45 vs 6 rows) and Noah (30 vs 0 substantive). Any memory feature keyed off `sessions` is blind to this history.
7. **Timestamp pairing.** `messages` user/assistant pairs share `created_at`, so response latency cannot be measured from this table, and ordering within a pair is by insertion convention.
