# Agent 2 — Context Pipeline Trace

Scope: what user context reaches the model, in what form, and where. All claims cite `file:line` or a SQL query + result against Supabase project `wzmoeutpxndeqgfsnfci` (read-only). Date of audit: 2026-06-11.

---

## Executive summary

1. **The pipeline is real and the context sits at the TOP of the system prompt — not buried.** `buildSystemPrompt` pushes the FOUNDER CONTEXT block first, then the ~1,700-token persona, then ~1,300 tokens of sentinel instructions (src/lib/anthropic.ts:304-313). H1 is rejected as stated.

2. **The Sprint 12 summary fix works on the WRITE side and is partially wired on the READ side.** 7/9 chat sessions (77.8%) now have non-null summaries vs the historical 0/159. But only `summary` and `task_set` are read back into the prompt (src/lib/reid-context.ts:102). **`commitments` and `key_points` — the sharpest structured memory the system produces — are written to the DB and read by exactly zero prompt-building code.** They surface only in UI (sessions list/detail, recap overlay).

3. **The genericness on the founder's own account is primarily a THIN-context problem, not a formatting problem.** For `theodoretb10@gmail.com` the context block is ~280 tokens against ~3,061 tokens of static instruction (≈87% static early-session). His 2 chat sessions have 0 summaries — both because neither ever triggered the summarise-at-next-start path (see finding 5).

4. **Session openers (`/api/reid/opening`) receive NO session summaries, NO commitments, NO key_points, and NO goals.** The opener prompt gets exactly four facts: last `task_set` (or onboarding task), the single most recent observation, `onboarding_summary`, and days-since-last-session (src/app/api/reid/opening/route.ts:33-77).

5. **Defect: ended sessions are resumed forever, which starves the summary pipeline.** `clearChatSessionId()` is never called when a session ends; the chat page keeps the ended session id in localStorage and `sessionBelongsTo` does not check `ended_at` (src/app/api/reid/route.ts:411, src/lib/session-server.ts:293-304). `creatingNewSession` therefore stays false, the summarise-at-next-start block (route.ts:502-527) never fires, and the 20-message hard cap is skipped because the row is `alreadyEnded` (route.ts:873). This is how a 36-message session exists in prod (cap is 20) and why Theo's qualifying 4-message session from 2026-06-10 is still unsummarised.

6. **Within-session memory is lossless; cross-session memory is one prose sentence.** The client sends the FULL message array every turn — no windowing — so turn-1 survives to turn 20 (H9 rejected). But when a new session starts, the entire prior transcript collapses to a single sentence in "RECENT SESSIONS".

---

## Per-source pipeline table

All sources below are fetched **on every POST to /api/reid** via `getReidContext(db, userId)` (src/app/api/reid/route.ts:558), assembled into one `=== FOUNDER CONTEXT ===` string, and prepended as the **first block of the system prompt** (src/lib/anthropic.ts:304-313). When `getReidContext` returns `""` (no user row), the prompt is persona-only.

| Source | Query | Limit / Order | Format injected | Position in prompt | When empty | Citation |
|---|---|---|---|---|---|---|
| User profile (name, email, session_count, streak_days, last_session_at, last_review_at) | `users` by id | 1 row | Structured bullet list under `FOUNDER` | Top of context (context = top of system prompt) | name renders `unknown`; date lines omitted | reid-context.ts:71-77, 150-159 |
| Onboarding summary | same `users` row | 1 field | Raw prose paragraph under `WHAT YOU LEARNED IN ONBOARDING` | After FOUNDER | Section omitted entirely | reid-context.ts:161-165 |
| Onboarding task | same `users` row | 1 field | Raw prose under `THE TASK YOU SET THEM` | After onboarding summary | Section omitted | reid-context.ts:166-170 |
| Goals | `goals` eq user_id | **No LIMIT** (all goals), ORDER `is_primary DESC, created_at ASC` | Sharp structured block: title, current/target with units, remaining, deadline, primary flag | `ACTIVE GOALS` | Section omitted | reid-context.ts:94-99, 30-52, 172-176 |
| Goal events | `goal_events` + joined goal title | LIMIT 10, ORDER `created_at DESC` | Structured: date, goal title, signed delta, note | `RECENT PROGRESS EVENTS` | Section omitted | reid-context.ts:114-119, 178-187 |
| Prior task | derived from session rows below: first session with non-empty `task_set` | 1 | `PRIOR TASK` block: task text + set-on date, plus explicit directive "your first question this session should be about it" | Middle of context | Section omitted; directive in footer still references it conditionally | reid-context.ts:192-201, 225-227 |
| Observations | `observations` eq user_id, `category NOT NULL OR confidence IN (medium,high)` | LIMIT 8, ORDER `created_at DESC` | Structured one-liners `- (label) text` under `WHAT YOU'VE NOTICED` | Middle | Section omitted | reid-context.ts:107-113, 203-213 |
| Session summaries | `sessions` eq user_id, **`.not("summary","is",null)`** | LIMIT 5, ORDER `started_at DESC` | One prose sentence per session + `task set:` line, under `RECENT SESSIONS` | **Bottom of context block** | Section omitted | reid-context.ts:100-106, 215-223 |
| `sessions.commitments` (jsonb) | **NEVER QUERIED by any prompt builder** | — | — | — | — | only UI reads: app/api/sessions/list/route.ts:27, app/api/sessions/[id]/route.ts:40, SessionRecapOverlay.tsx:158 |
| `sessions.key_points` (jsonb) | **NEVER QUERIED by any prompt builder** | — | — | — | — | same as above |
| `sessions.mood` / `avoiding` / `reid_note` | never read into any prompt | — | — | — | — | grep over src: only types + session-recap UI |
| Tasks table (`public.tasks`, incl. "Today's Task") | **NOT read by getReidContext at all** — only used post-turn for outcome detection | — | — | — | — | route.ts:896-906 (count only) |
| Streak/activity | from `users` row (`streak_days`, `session_count`) | 1 row | `- streak: N days`, `- sessions completed: N` | FOUNDER block | rendered as `0` | reid-context.ts:153-154 |
| Conversation history | sent by the CLIENT in the request body, not fetched server-side | zod max 200 messages, 4,000 chars each | Raw alternating user/assistant turns as Anthropic `messages` | The messages array (after system prompt) | `[{role:"user",content:"Begin."}]` seeded | validation.ts:6,16; route.ts:614-651 |

Footer directive: the context block ends with "Use this context… If PRIOR TASK is present, your first question this session should be about it… Don't recap the context at them" (reid-context.ts:225-227). The mode flag does not change context — onboarding requests get the same `getReidContext` call (route.ts:558 runs unconditionally); a brand-new user simply produces a near-empty block.

### The opener pipeline (separate, weaker)

`POST /api/reid/opening` (fires on every /chat mount with no restored messages — chat/page.tsx:389-394) builds its OWN prompt with exactly: founder name, days since last chat session, last task (`sessions.task_set` of the most recent chat session, falling back to `users.onboarding_task`), the single most recent observation, and `onboarding_summary` (opening/route.ts:94-163). **It does not query `sessions.summary`, `commitments`, `key_points`, or `goals`.** Failure → 204 → static "Your co-founder is ready."

---

## Sprint 12 summary-fix verification

### DB numbers (queried 2026-06-11)

`SELECT count(*) … FROM sessions` (full results in queries below):

| Metric | All-time | Last 30 days |
|---|---|---|
| Total sessions (all modes) | **192** | 192 (all rows are <30 days old) |
| — mode='chat' | 9 | 9 |
| — mode='onboarding' | 183 | 183 |
| Non-null `summary` (all modes) | 7 (3.6%) | 7 (3.6%) |
| Non-null `summary` (chat only) | **7/9 = 77.8%** | 7/9 |
| Chat sessions with ≥4 messages (qualify) | 8 | — |
| — of which summarised | **7/8 = 87.5%** | — |
| Non-empty `commitments` | 2/192 (chat: 2/9 = 22.2%) | 2 |
| Non-empty `key_points` | 3/192 (chat: 3/9 = 33.3%) | 3 |
| Fallback string ("Session recorded — no summary…") | 0 | 0 |
| `task_set` non-null (chat) | 3/9 | — |

Queries: `SELECT count(*) FILTER (WHERE summary IS NOT NULL) … FROM sessions;` → `{"total_sessions":192,"with_summary":7,"with_commitments":2,"with_key_points":3,…}` and `GROUP BY mode` → chat `{"n":9,"with_summary":7,"substantive":8,"substantive_with_summary":7}`, onboarding `{"n":183,"with_summary":0}`.

Verdict vs the historical 0/159 defect: **fixed for chat sessions** (77.8% coverage, 87.5% of qualifying ones). The 183 summary-less onboarding rows are by design (onboarding memory lives on `users.onboarding_summary`) — but note only **6/20 users** have a non-null `onboarding_summary` (query: `users_with_onb_summary: 6, users_total: 20`), i.e. 177 of those onboarding sessions are abandoned attempts that produced no memory at all.

Caveat on whose sessions are summarised: per-user breakdown — `theodoretb10+test5`: 5/5 summarised; `tbxgrows+test2`: 2/2; **`theodoretb10@gmail.com` (the founder's primary account): 0/2 summarised**, including a 4-message session from 2026-06-10 that qualifies but has never been picked up (see write-path gap below).

### Three write paths (only one writes structured fields)

1. **Summarise-at-next-start** (Sprint 12): fires only when `creatingNewSession && mode==="chat"` (route.ts:502-527) → `summarisePriorSession` writes `summary` + `commitments` + `key_points` (reid-summary.ts:365-382, Haiku model).
2. **[SESSION_COMPLETE] sentinel**: writes `summary` + `task_set` only (reid-sentinels.ts:427-432 → endSession; session-server.ts:106-107). **No commitments/key_points.**
3. **Keepalive unmount** `/api/sessions/summarise`: writes `summary` only (sessions/summarise/route.ts:158-162). **No commitments/key_points.** This explains why 4 of the 7 summarised sessions have null commitments/key_points.

### READ side — the exact code

Summaries ARE read and injected on the next request:

```ts
// src/lib/reid-context.ts:100-106
db.from("sessions")
  .select("id, user_id, started_at, ended_at, summary, task_set, message_count")
  .eq("user_id", userId)
  .not("summary", "is", null)
  .order("started_at", { ascending: false })
  .limit(5),
```
rendered at reid-context.ts:215-223 as `RECENT SESSIONS` (`- {date}: {summary}` + optional `task set:` line).

**`commitments` and `key_points` are not in that select and appear nowhere in `reid-context.ts`, `route.ts`, or `opening/route.ts`.** Full-repo grep for `commitments|key_points` outside tests hits only: `types/*`, `reid-summary.ts` (writer), `app/(app)/sessions/[id]/page.tsx`, `app/api/sessions/list|[id]/route.ts`, `app/api/session-recap/route.ts`, `SessionRecapOverlay.tsx` — all UI/recap surfaces. **Written, never read by the model.**

### Write-path starvation defect (why the founder's own sessions stay unsummarised)

- The chat page stores the session id in localStorage (`setChatSessionId`, chat/page.tsx:478, 534) and restores it on every mount (chat/page.tsx:355-358). `clearChatSessionId()` exists (lib/session.ts:22-25) but is **called nowhere** — `SessionRecapOverlay.onClose` only clears React state and refreshes entitlement (chat/page.tsx:710-718); only `signOut` removes the key.
- The route honours any session id that belongs to the user — `sessionBelongsTo` checks ownership but not `ended_at` (session-server.ts:293-304; route.ts:410-418). So after a session ends, the next visit resumes the ENDED session: `creatingNewSession=false` → summarise-at-next-start (route.ts:502) never fires, and the 20-cap force-end is skipped because `alreadyEnded` is true (route.ts:866-879).
- Observable evidence in prod: chat session `3ba06999…` has **36 messages** against a 20-message hard cap; Theo's primary account has a qualifying unsummarised session because no NEW session has been created since.

---

## In-session history assembly

- **No truncation anywhere.** `handleSend` builds `nextMessages = [...messages, userMessage]` and passes the whole array (chat/page.tsx:465-471); the voice loop does the same via `messagesRef` (chat/page.tsx:526-531). The server maps `messages` 1:1 into the Anthropic call — `sourceMessages.map(...)` with no slice (route.ts:614-651).
- Bounds are: zod `messages.max(200)`, `content.max(4000)` chars (validation.ts:6,16), and the session hard cap of 20 messages with a wrap-nudge at 16 (route.ts:564-592). Within those bounds **turn-1 content is present verbatim at turn 20**.
- Session restore: `/api/reid/history?limit=5` → only the restored session's messages are loaded into state (chat/page.tsx:360-377); prior sessions' transcripts are never re-sent (the `priorSessions` render path is wired but permanently empty — chat/page.tsx:155-157).
- Cross-session: nothing of the prior transcript reaches the model except the 1-sentence `summary` (+ `task_set`) via RECENT SESSIONS.

---

## Token budget (estimates: chars ÷ 4)

Static parts measured from the actual template literals (`node` count over src/lib/anthropic.ts):

| Component | Chars | ≈ Tokens |
|---|---|---|
| `REID_VOICE` persona | 6,907 | ~1,727 |
| `REID_SENTINEL_INSTRUCTIONS` | 5,335 | ~1,334 |
| **Static total** | 12,242 | **~3,061** |

User context, measured from prod data:

- **Richest user** (`+test5`: 3 qualifying observations = 573 chars, 5 session summaries + task_set = 1,241 chars, 0 goals, 0 events, no onboarding summary): FOUNDER block ~160 + observations ~650 + sessions ~1,400 + prior task ~180 + headers/footer ~400 ≈ **2,800 chars ≈ 700 tokens**.
- **Founder's primary account** (onboarding_summary 181 chars, task 84, 1 goal, 1 event, 1 observation 140 chars, 0 session summaries): ≈ **1,100 chars ≈ 280 tokens**.

History (avg message = 113 chars in prod; query `avg(length(content))` over `messages` = 113): at the 20-message cap ≈ 2,260 chars ≈ 565 tokens + ~5 tokens/message overhead ≈ **~665 tokens**; mid-session (10 msgs) ≈ ~330 tokens.

**Typical assembled prompt (rich user, late session): 3,061 + 700 + 665 ≈ 4,430 tokens → static 69%, user context 16%, history 15%.**
**Founder's primary account, early session: 3,061 + 280 + ~120 ≈ 3,460 tokens → static 88%, user context 8%, history 4%.**

The model is never context-starved by token limits — the whole prompt is under 5k tokens. The imbalance is informational, not budgetary: static persona outweighs personal context 4:1 to 11:1.

---

## Hypothesis verdicts

### H1 — context injected but as low-salience mush buried deep: **REJECTED** (with one nuance)
Context is the FIRST thing in the system prompt: `parts.push(context)` before persona (anthropic.ts:304-313). It is delimited (`=== FOUNDER CONTEXT ===`), sectioned with ALL-CAPS headers, and ends with an explicit usage directive ("If PRIOR TASK is present, your first question this session should be about it" — reid-context.ts:225-227). Nuance: it is top-loaded rather than adjacent to the conversation, and ~3,000 tokens of persona sit between the context and the messages; but "buried deep / mush" is factually wrong. The real salience problem is that for the founder's account the block is ~280 tokens and contains zero session memory (0/2 of his sessions summarised — DB query above).

### H5 (data-path) — do session openers receive prior commitments: **CONFIRMED as a gap**
The opener prompt receives exactly: name, days-gap, last `task_set`/onboarding task, ONE observation, onboarding summary (opening/route.ts:33-77, 94-163). `commitments` is not selected there, nor in `getReidContext` (reid-context.ts:102), nor anywhere else that builds a model prompt — repo-wide grep confirms only UI readers. **Stored commitments never reach any model call.** The opener can reference "the task" only when a `[SESSION_COMPLETE]` sentinel fired (3/9 chat sessions have `task_set`); sessions summarised via the lazy/keepalive paths contribute nothing the opener can see.

### H7 — paragraph summaries instead of sharp structured facts: **PARTIAL — confirmed for session memory, rejected for goals**
- Goals are injected as sharp structured facts: exact numbers, remaining amount, deadline, primary flag (formatGoal, reid-context.ts:30-52); goal events carry signed deltas + dates (178-187); observations carry labels (203-213). H7 rejected there.
- Cross-session memory is exactly one prose sentence per session (`- {date}: {summary}` — reid-context.ts:219). The sharp structured layer the system already generates — `commitments[]` ("Build voice mode as default by tonight", "Show working app to Noah tomorrow" — live prod rows) and `key_points[]` — is **never injected** (read-side grep above). Worse, 2 of 3 summary writers don't even produce them. H7 confirmed for the memory channel, which is the channel the founder's complaint is about.

### H9 — history windowing drops early-session content: **REJECTED (within-session)**
Full array sent every turn, no `.slice` on the send path (chat/page.tsx:465-471, 526-531; route.ts:614-617); zod cap is 200 messages vs a 20-message session cap, content cap 4,000 chars vs 113-char average. Turn-1 survives to turn 20 verbatim. The discontinuity is **between** sessions: the transcript collapses to one sentence — and on the founder's account, to nothing (0 summaries) — which presents symptomatically like memory loss but is a summarisation/read gap (H5/H7), not windowing.

---

## Top recommendations implied by the trace (for the synthesis agent)

1. Add `commitments, key_points` to the `getReidContext` sessions select and render them as structured bullets (e.g. `OPEN COMMITMENTS`), and feed the latest non-empty `commitments` into `buildOpeningPrompt`.
2. Make all three summary writers produce `commitments`/`key_points` (sentinel + keepalive paths currently write prose only).
3. Clear (or refuse to resume) ended sessions: check `ended_at` in `sessionBelongsTo` or call `clearChatSessionId()` in `SessionRecapOverlay.onClose` — this both restores the 20-cap and un-starves summarise-at-next-start.
4. Inject the `tasks` table ("Today's Task") into context — it is currently invisible to the model except as a count.
