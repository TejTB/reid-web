# B1 — Supply-Chain & Defect Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Reid's memory supply chain (session lifecycle, summary writers, onboarding completion) and fix the six approved defects, so memory artifacts are produced reliably before B2 makes them richer.

**Architecture:** All fixes are surgical changes to the existing `/api/reid` pipeline, session helpers, and client session handling. One new pure module (`session-policy.ts`) introduces real "closed session" semantics — the load-bearing discovery of plan investigation is that `sessions.ended_at` is stamped on **every turn** by `endSession` (src/app/api/reid/route.ts:831 → src/lib/session-server.ts:103), so it means "last activity", not "closed" — and the 20-message hard cap at route.ts:873 is currently dead code because `alreadyEnded` is always true after turn 1. Closure is therefore **derived, with a time dimension** (Theo's amendment): `summary IS NOT NULL` OR `message_count ≥ cap` OR `idle > 60 min` — never read from `ended_at` as a flag. `ended_at` keeps its per-turn stamping and is **documented as the last-activity timestamp** (verified 2026-06-11: `sessions` has NO `updated_at` column, and every existing consumer — opening-route days-gap included — already reads `ended_at` as activity). This costs zero DDL. The companion rule: the keepalive summarise route refuses sessions active in the last 10 minutes, so tab-switches never close a live conversation; truly abandoned sessions close lazily via the idle rule + summarise-at-next-start, which Task 1 unstarves.

**Tech Stack:** Next.js 16 (App Router route handlers), TypeScript, Supabase JS, `node --test` + `node:assert/strict` for unit tests (pure helpers only — existing convention in `src/lib/__tests__/*.test.ts`, imports use explicit `.ts` extensions).

**Branch:** `sprint13-brain` (created). Commits via git-commit-smart. Nothing merges or deploys — Theo owns both.

**Prod facts gathered during planning (read-only, 2026-06-11):**
- Duplicate-POST check: zero duplicate message pairs in prod data (the only same-content rows are user messages repeated 3-15 *minutes* apart — genuine repeats). The Phase B duplicates were local-dev StrictMode artifacts. Verdict pre-confirmed; Task 2 documents it and adds guards anyway.
- `users.name` for phaseb-p1/p2 is the literal string `"Unknown"` — the model emitted `[NAME_CAPTURED] name="Unknown"` and `isPlausibleFirstName` passes it (alpha, ≤20 chars, not in stoplist). The NAME_CAPTURED write site only fires when name is empty (reid-sentinels.ts:467-478), so the signup name had also never landed → two distinct bugs (Task 6).
- Stuck users: 13 of 23 have `onboarding_complete = false` (0 are phaseb accounts). Mechanism confirmed: OnboardingClient threads its session id in a ref only (OnboardingClient.tsx:135,167) — lost on reload → every return mints a new onboarding session → the 14/22/26 ladder counts `preTurnMessageCount` **per session** (route.ts:593-606) and never accrues.

**Pre-flight for the executor (before ANY code):** Per AGENTS.md, read `node_modules/next/dist/docs/` guides for route handlers and the App Router client patterns you touch. Run `npm test` and `npx tsc --noEmit` first to confirm a green baseline.

---

## File map

| File | Tasks | Change |
|---|---|---|
| `src/lib/session-policy.ts` (CREATE) | 1, 4 | Pure closure semantics + ladder thresholds |
| `src/lib/__tests__/session-policy.test.ts` (CREATE) | 1, 4 | Unit tests |
| `src/lib/session-server.ts` | 1, 3 | `sessionBelongsToAndOpen`, `recordTurnActivity`, `endSession` structured fields |
| `src/app/api/reid/route.ts` | 1, 3, 4, 7 | Use new helpers; fix dead cap; onboarding ladder on TOTAL; structured pass on sentinel close; first-message quote strip |
| `src/app/(app)/chat/page.tsx` | 1, 2, 8 | Recap-close clears session; opening in-flight guard; voice flag |
| `src/lib/reid.ts` | 8 | `voice` in request body |
| `src/app/api/sessions/summarise/route.ts` | 3 | Recent-activity refusal (10-min window); use `generateSessionSummary` (Haiku), write all three fields |
| `src/lib/anthropic.ts` | 5 | `buildSystemPrompt(context, { sentinels })` |
| `src/app/api/reid-take/route.ts`, `src/app/api/tasks/complete/route.ts` | 5 | Call with `sentinels: false` + defensive strip |
| `src/lib/reid-sentinels.ts` | 5 | `stripSentinelTags` export |
| `src/lib/reid-summary.ts` | 6, 7 | Stoplist additions; `stripWrappingQuotes` |
| `src/lib/__tests__/reid-summary.test.ts` | 6, 7 | Tests |
| `src/lib/ensure-user-row.ts` | 6 | Insert-conflict recovery |
| `src/app/api/reid/opening/route.ts` | 7 | Buffer + strip wrapping quotes |
| `src/app/onboarding/OnboardingClient.tsx` | 4, 8 | Persist onboarding session id; voice flag |
| `src/lib/session.ts` | 4 | Clear `reid:onboardingSessionId` on signOut |
| `diagnostics/b1-verification.md` (CREATE) | 9 | Verdicts + gate evidence |

---

### Task 1: Session lifecycle integrity (ended-session resume + dead 20-cap)

**Files:**
- Create: `src/lib/session-policy.ts`, `src/lib/__tests__/session-policy.test.ts`
- Modify: `src/lib/session-server.ts` (add helpers; keep `sessionBelongsTo` for other callers), `src/app/api/reid/route.ts:409-418, 564-578, 830-880`, `src/app/(app)/chat/page.tsx:705-718`

- [ ] **Step 1: Write failing tests for closure semantics**

`src/lib/__tests__/session-policy.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSessionClosed,
  SESSION_HARD_CAP,
  ONBOARDING_HARD_CAP,
  SESSION_IDLE_TIMEOUT_MS,
  KEEPALIVE_MIN_IDLE_MS,
} from "../session-policy.ts";

const NOW = Date.parse("2026-06-11T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

test("chat session with a summary is closed", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: "did things", message_count: 6, last_activity_at: minsAgo(1) },
      NOW,
    ),
    true,
  );
});

test("chat session at the hard cap is closed even without a summary", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: SESSION_HARD_CAP, last_activity_at: minsAgo(1) },
      NOW,
    ),
    true,
  );
});

test("active chat session below cap with no summary is open", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: SESSION_HARD_CAP - 1, last_activity_at: minsAgo(5) },
      NOW,
    ),
    false,
  );
});

test("unsummarised session idle beyond the timeout is closed", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: 6, last_activity_at: minsAgo(61) },
      NOW,
    ),
    true,
  );
  // exactly at the boundary stays open (strict >)
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: 6, last_activity_at: minsAgo(60) },
      NOW,
    ),
    false,
  );
});

test("session with no recorded activity is open (just created)", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: 0, last_activity_at: null },
      NOW,
    ),
    false,
  );
});

test("onboarding session closes at its own (higher) cap, not the chat cap", () => {
  assert.equal(
    isSessionClosed(
      { mode: "onboarding", summary: null, message_count: SESSION_HARD_CAP, last_activity_at: minsAgo(1) },
      NOW,
    ),
    false,
  );
  assert.equal(
    isSessionClosed(
      { mode: "onboarding", summary: null, message_count: ONBOARDING_HARD_CAP, last_activity_at: minsAgo(1) },
      NOW,
    ),
    true,
  );
});

test("thresholds are sane relative to each other", () => {
  // keepalive must refuse anything younger than its window, and that window
  // must be well inside the idle timeout so there's no closure dead zone.
  assert.equal(KEEPALIVE_MIN_IDLE_MS, 10 * 60_000);
  assert.equal(SESSION_IDLE_TIMEOUT_MS, 60 * 60_000);
  assert.ok(KEEPALIVE_MIN_IDLE_MS < SESSION_IDLE_TIMEOUT_MS);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (`session-policy.ts` not found).

- [ ] **Step 3: Implement `src/lib/session-policy.ts`**

```ts
// Pure session-lifecycle policy. IMPORTANT CONTEXT: sessions.ended_at is
// stamped on EVERY turn (recordTurnActivity, née endSession's per-turn path),
// so it is the LAST-ACTIVITY timestamp, NOT a closed flag — there is no
// updated_at column on sessions (verified in prod 2026-06-11) and every
// existing consumer (opening-route days-gap included) already reads it as
// activity. A session is closed when it has been summarised (any writer),
// has hit its mode's hard cap, or has sat idle past SESSION_IDLE_TIMEOUT_MS.
// Server resume checks and the recap trigger derive closure from this single
// function; the keepalive summariser uses KEEPALIVE_MIN_IDLE_MS so a
// tab-switch or internal navigation never closes a live conversation.

export const SESSION_HARD_CAP = 20;
export const SESSION_NUDGE_AT = 16;
export const ONBOARDING_NUDGE_AT = 14;
export const ONBOARDING_FINAL_AT = 22;
export const ONBOARDING_HARD_CAP = 26;

/** An unsummarised session idle longer than this is treated as closed; the
 *  next request mints a fresh session, which triggers summarise-at-next-start
 *  on this one. */
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60_000;
/** The keepalive summarise route refuses sessions with activity younger than
 *  this — unmount fires on every internal navigation, and summarising a live
 *  conversation would close it under the derived-closure rule. */
export const KEEPALIVE_MIN_IDLE_MS = 10 * 60_000;

export function isSessionClosed(
  s: {
    mode: string;
    summary: string | null;
    message_count: number;
    /** sessions.ended_at ?? sessions.started_at (ISO). Null = no activity recorded. */
    last_activity_at: string | null;
  },
  nowMs: number,
): boolean {
  if (s.summary !== null && s.summary.trim().length > 0) return true;
  const cap = s.mode === "onboarding" ? ONBOARDING_HARD_CAP : SESSION_HARD_CAP;
  if (s.message_count >= cap) return true;
  if (s.last_activity_at !== null) {
    const last = Date.parse(s.last_activity_at);
    if (!Number.isNaN(last) && nowMs - last > SESSION_IDLE_TIMEOUT_MS) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Add `sessionBelongsToAndOpen` and `recordTurnActivity` to `src/lib/session-server.ts`** (below `sessionBelongsTo`, which stays — grep its other callers and leave them untouched):

```ts
import { isSessionClosed } from "./session-policy";

/** True iff the session exists, belongs to the user, AND is still open
 *  (not summarised, not at its hard cap, not idle past the timeout).
 *  Closed sessions must never be resumed — resuming them starved
 *  summarise-at-next-start and bypassed the 20-message cap (the
 *  founder-account memory bug, Sprint 13 audit). An idle-closed session
 *  falls into the new-session path, whose summarise-at-next-start gives it
 *  its summary lazily. */
export async function sessionBelongsToAndOpen(
  db: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("sessions")
    .select("id, user_id, mode, summary, message_count, ended_at, started_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || data.user_id !== userId) return false;
  return !isSessionClosed(
    {
      mode: (data.mode as string) ?? "chat",
      summary: (data.summary as string | null) ?? null,
      message_count: (data.message_count as number | null) ?? 0,
      last_activity_at:
        (data.ended_at as string | null) ??
        (data.started_at as string | null) ??
        null,
    },
    Date.now(),
  );
}

/** Per-turn bookkeeping: bumps message_count, stamps the session's
 *  last-activity timestamp, and refreshes the user's last_session_at.
 *  NOTE the column wart, on purpose: `ended_at` IS the last-activity
 *  timestamp (no updated_at column exists; every consumer already reads it
 *  as activity). Closure is never inferred from ended_at — see
 *  session-policy.ts. Extracted from endSession so the per-turn path stops
 *  pretending to end the session. */
export async function recordTurnActivity(
  db: SupabaseClient,
  sessionId: string,
  userId: string,
  messageCountDelta: number,
): Promise<void> {
  const { data: current } = await db
    .from("sessions")
    .select("message_count")
    .eq("id", sessionId)
    .maybeSingle();
  await db
    .from("sessions")
    .update({
      message_count: (current?.message_count ?? 0) + (messageCountDelta || 0),
      ended_at: new Date().toISOString(), // last-activity stamp (see note)
    })
    .eq("id", sessionId);
  await db
    .from("users")
    .update({ last_session_at: new Date().toISOString() })
    .eq("id", userId);
}
```

- [ ] **Step 6: Rewire `src/app/api/reid/route.ts`**
  1. Line ~411: `sessionBelongsTo(db, sessionId, userId)` → `sessionBelongsToAndOpen(db, sessionId, userId)` (import it). A closed session now falls into `creatingNewSession = true` — exactly the path that triggers summarise-at-next-start.
  2. Lines 564-578: delete the five inline cap constants; import them from `session-policy.ts` (values unchanged — behaviour-neutral refactor, single source of truth).
  3. Line ~831 (the non-close per-turn path): `endSession(db, resolvedSessionId, { userId, messageCountDelta, bumpUserCounters: false })` → `recordTurnActivity(db, resolvedSessionId, userId, newTurnMessages.length)`.
  4. Lines 864-880 (dead cap): replace the `alreadyEnded` guard:
```ts
let sessionEnded = !!parsed.sessionComplete;
if (mode === "chat" && !sessionEnded) {
  const { data: postRow } = await db
    .from("sessions")
    .select("message_count")
    .eq("id", resolvedSessionId)
    .maybeSingle();
  const postMessageCount = (postRow?.message_count as number | null) ?? 0;
  if (postMessageCount >= SESSION_HARD_CAP) {
    // No DB write needed: closure is derived from message_count (and
    // recordTurnActivity already stamped last-activity). We only need to
    // tell the client so it renders the recap.
    sessionEnded = true;
  }
}
```

- [ ] **Step 7: Client — clear the session on recap close** (`src/app/(app)/chat/page.tsx:707-718`). Without this, the next send would POST the ENTIRE old transcript into a brand-new session row (the server treats all client messages of a new session as new-turn messages). Clear both the stored id and the on-screen conversation, then let Reid open the next session:

```tsx
{endedSessionId && (
  <SessionRecapOverlay
    sessionId={endedSessionId}
    onClose={() => {
      setEndedSessionId(null);
      // The session is over: drop the stored id (server now refuses closed
      // sessions anyway), clear the transcript, and let Reid speak first in
      // the NEXT session with the just-written summary in its context.
      clearChatSessionId();
      setSessionId(null);
      setMessages([]);
      setOpeningState("streaming");
      setIsStreaming(true);
      setStreamingText("");
      void streamOpeningLine();
      void refresh();
    }}
  />
)}
```
(`clearChatSessionId` is already exported from `@/lib/session` — add it to the existing import.)

- [ ] **Step 8: Run gates** — `npm test`, `npx tsc --noEmit`, `npm run lint` → all green.

- [ ] **Step 9: Commit** via git-commit-smart (expect `fix(sessions): derive closure, refuse resuming closed sessions, revive 20-cap`).

**Behaviour notes (for review, deliberate):**
- (a) Tab-switch / internal navigation does NOT close a live conversation: the unmount keepalive refuses sessions with activity in the last 10 minutes (Task 3), so quick away-and-back resumes seamlessly. A session left idle >60 minutes is treated as closed by `sessionBelongsToAndOpen`; the next request mints a fresh session and summarise-at-next-start writes the prior one's memory. Truly abandoned tabs whose keepalive fires after ≥10 min idle get keepalive-summarised (≥4 messages only) — also closed.
- (b) **Mid-conversation idle-closure cannot duplicate history**: verified at route.ts:701-715 — only the trailing user message + assistant reply are persisted per turn (`newTurnMessages`), so when the server silently mints a new session for a stale client, the new row gets exactly one turn; the model still sees the full client-sent history in-context, giving conversational continuity across the seam.
- (c) `ended_at` continues to be stamped per turn — it is, and stays, the last-activity timestamp (no `updated_at` column exists in prod; adding one is DDL we don't need since closure is fully derived). The name is a documented wart, not a flag. `/api/reid/opening` days-gap (`ended_at ?? started_at`) keeps working unchanged.
- (d) Historical rows (all of which have `ended_at` from the old stamping) behave correctly under derived closure: anything idle >60 min — i.e. every pre-deploy session — is closed and will summarise at next start. The founder's stuck 4-message session from 2026-06-10 gets its summary on his first post-deploy visit.

---

### Task 2: Duplicate-POST — verdict + idempotency guard

**Files:** Modify: `src/app/(app)/chat/page.tsx` (opening guard). Document in: `diagnostics/b1-verification.md` (Task 9).

**Verdict (already verified, read-only prod SQL 2026-06-11):** No duplicate request evidence in production. Query: grouped `messages` by (session_id, role, content) excluding phaseb accounts; only hits are user messages repeated 3-15 minutes apart (genuine re-asks, e.g. "you" ×3 in `0930e723`). A doubled `/api/reid` POST would insert paired rows within seconds — none exist. Dev-only explanation: Next dev runs React StrictMode (no `reactStrictMode: false` in `next.config.ts`); the mount→unmount→mount cycle fires the `[]`-deps keepalive cleanup (`chat/page.tsx:422-441`) and remount effects, which is exactly the doubled `/api/sessions/summarise`, `/opening`, `/session-recap` Phase B saw. `handleSend` is event-driven and guarded by `isStreaming` — not StrictMode-affected. **NOT a P0 cost issue.**

- [ ] **Step 1: Add an in-flight guard to the opening fetch** (belt-and-braces for remount races; the summarise route is already idempotent server-side). In `chat/page.tsx`, next to `initialized`:

```ts
const openingInFlight = useRef(false);
```
and at the top of `streamOpeningLine`:
```ts
if (openingInFlight.current) return;
openingInFlight.current = true;
```
with `openingInFlight.current = false;` before each of the three existing returns/catch exits (failed, empty, done).

- [ ] **Step 2: Gates** — `npm test`, `npx tsc --noEmit`, `npm run lint` → green.
- [ ] **Step 3: Commit** (`fix(chat): guard opening-line fetch against remount double-fire`).

---

### Task 3: Unify summary writers — all three emit commitments/key_points

**Files:** Modify: `src/lib/session-server.ts` (`endSession` options), `src/app/api/sessions/summarise/route.ts:118-162`, `src/app/api/reid/route.ts` (sentinel-close branch ~824-856).

- [ ] **Step 1: Extend `endSession` options** (`session-server.ts:75-109`) with structured fields:

```ts
options: {
  userId: string;
  summary?: string | null;
  taskSet?: string | null;
  commitments?: string[] | null;
  keyPoints?: string[] | null;
  messageCountDelta?: number;
  bumpUserCounters?: boolean;
},
```
and in the update construction:
```ts
if (commitments && commitments.length > 0) sessionUpdate.commitments = commitments;
if (keyPoints && keyPoints.length > 0) sessionUpdate.key_points = keyPoints;
```

- [ ] **Step 2: Keepalive writer — recent-activity refusal first** (`sessions/summarise/route.ts`). Before the model call (right after the session row is loaded and ownership-verified), refuse live conversations (Theo's amendment — a tab-switch or internal navigation must never close one). The route already loads the session row and the messages; use the freshest signal available:

```ts
import { KEEPALIVE_MIN_IDLE_MS } from "@/lib/session-policy";
// after `messages` are loaded (they are ordered ascending):
const lastMessageAt = messages.length
  ? Date.parse(
      (messageRows![messageRows!.length - 1] as { created_at?: string }).created_at ?? "",
    )
  : NaN;
// fall back to the session's last-activity stamp if created_at wasn't selected
const lastActivity = Number.isNaN(lastMessageAt)
  ? Date.parse((sessionRow.ended_at as string | null) ?? (sessionRow.started_at as string))
  : lastMessageAt;
if (!Number.isNaN(lastActivity) && Date.now() - lastActivity < KEEPALIVE_MIN_IDLE_MS) {
  return Response.json({ ok: true, skipped: "recent_activity" });
}
```
(Executor: add `created_at` to the route's messages select — currently `select("role, content")` at line 95-99 — OR rely on the session-row fallback; selecting `created_at` is the precise option, take it. Adjust variable names to the route's actuals.) Side benefit: this also neutralises the dev StrictMode keepalive double-fire (Task 2) — a freshly mounted session always has recent activity.

- [ ] **Step 2b: Replace the writer** — swap the inline Sonnet call (lines 118-138, `SUMMARISE_SYSTEM_PROMPT` + `REID_MODEL`) with the existing structured Haiku summariser:

```ts
import { generateSessionSummary } from "@/lib/reid-summary";
// ...
const result = await generateSessionSummary(messages);
const summary = result.summary;
```
Keep the existing `startingPoint` duplicate check against `summary`. Then:
```ts
await endSession(db, sessionId, {
  userId,
  summary,
  commitments: result.commitments,
  keyPoints: result.key_points,
  bumpUserCounters: false,
});
```
Delete the now-unused `SUMMARISE_SYSTEM_PROMPT` and `REID_MODEL`/`anthropic` imports if nothing else in the file uses them. (Side benefit: this path moves from Sonnet to Haiku — cheaper, and consistent with the other writers.)

- [ ] **Step 3: Sentinel writer** (`/api/reid` route, sentinel-close branch): after `processSentinels` when `parsed.sessionComplete` is truthy (inside the existing `else` branch at ~836-856, after the message-count delta update), add a best-effort structured pass. Keep Reid's own inline `summary="..."` (already written by processSentinels → endSession) — only fill the structured fields:

```ts
// Structured memory pass (B1.3): the sentinel close writes Reid's one-line
// summary but no commitments/key_points. Fill them from the transcript so
// every writer produces the structured layer B2 will inject.
try {
  const structured = await generateSessionSummary([
    ...messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "assistant" as const, content: cleanedAssistantText },
  ]);
  await db
    .from("sessions")
    .update({
      commitments: structured.commitments,
      key_points: structured.key_points,
    })
    .eq("id", resolvedSessionId);
} catch {
  // Best-effort: never fail the turn over memory enrichment.
}
```
(`generateSessionSummary` is already imported by the route for the onboarding force-complete path — verify, else import from `@/lib/reid-summary`.)

- [ ] **Step 4: Gates** — `npm test`, `npx tsc --noEmit`, `npm run lint` → green.
- [ ] **Step 5: Commit** (`fix(memory): all three summary writers emit commitments/key_points`).

**Expected persona-rerun flip (Task 9):** P2's session rows have non-null `commitments`/`key_points` regardless of which writer fires.

---

### Task 4: Onboarding-stuck conversion — ladder on TOTAL + session persistence

**Files:** Modify: `src/app/api/reid/route.ts` (ladder inputs ~579-606, force-complete ~799-816), `src/app/onboarding/OnboardingClient.tsx` (~135, 167, completion routing), `src/lib/session.ts` (signOut list).

- [ ] **Step 1: Ladder counts accumulated onboarding messages, not per-session.** In the route, after `preTurnMessageCount` is read (~579-585), add for onboarding mode a TOTAL across all the user's onboarding sessions (fragmented users carry their history forward; a stuck user returning gets the FINAL directive on their first message back):

```ts
let onboardingPreTurnTotal = preTurnMessageCount;
if (mode === "onboarding") {
  const { data: obSessions } = await db
    .from("sessions")
    .select("message_count")
    .eq("user_id", userId)
    .eq("mode", "onboarding");
  onboardingPreTurnTotal = (obSessions ?? []).reduce(
    (sum, s) => sum + ((s.message_count as number | null) ?? 0),
    0,
  );
}
```
Then switch the two onboarding ladder branches (lines ~593-606) and the hard-cap synthesis condition (line ~799-803: `preTurnMessageCount + newTurnMessages.length >= ONBOARDING_HARD_CAP`) to use `onboardingPreTurnTotal` instead of `preTurnMessageCount`. The chat branch keeps the per-session count.

- [ ] **Step 2: Force-complete transcript from accumulated history.** The synthesis at ~804-807 currently summarises only the client-sent `messages` (current session). For rescued fragmented users that's 1-2 turns of signal. Replace the input with the user's recent onboarding history from the DB:

```ts
const { data: historyRows } = await db
  .from("messages")
  .select("role, content, created_at, sessions!inner(mode)")
  .eq("user_id", userId)
  .eq("sessions.mode", "onboarding")
  .order("created_at", { ascending: true })
  .limit(60);
const historyMsgs = (historyRows ?? []).map((r) => ({
  role: r.role as "user" | "assistant",
  content: r.content as string,
}));
const generated = await generateSessionSummary(
  historyMsgs.length >= 4
    ? [...historyMsgs, { role: "assistant" as const, content: cleanedAssistantText }]
    : [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "assistant" as const, content: cleanedAssistantText },
      ],
);
```
(If the join syntax fights RLS/types at execution time, fall back to two queries: session ids first, then `messages.in("session_id", ids)` — same result, keep the 60-row cap.)

- [ ] **Step 3: Persist the onboarding session id across reloads** (`OnboardingClient.tsx`). Mirror the chat pattern: on session id receipt (~167-171), also `localStorage.setItem("reid:onboardingSessionId", id)`; on mount, seed `sessionIdRef.current` from that key; on completion routing (wherever the client routes to /home after `[ONBOARDING_COMPLETE]`), remove the key. Add `"reid:onboardingSessionId"` to the signOut removal list in `src/lib/session.ts:161-167`. Note: `sessionBelongsToAndOpen` (Task 1) already refuses closed onboarding sessions, so a restored id can never resurrect a finished onboarding.

- [ ] **Step 4: Stuck-user verification (read-only).** Record in `diagnostics/b1-verification.md`: before-count 13/23 (queried 2026-06-11). After-count is measured at Theo's checkpoint after deploy — these users convert on their next visit (FINAL directive fires on accumulated total ≥ 22; server synthesis at ≥ 26). State this explicitly: no prod write happens in B1; conversion requires the user (or Theo visiting their flow) post-deploy.

- [ ] **Step 5: Unit test** the only new pure logic if extracted — otherwise rely on existing onboarding tests: run `npm test` and confirm `onboarding-voice.test.ts` still green (the ladder constants now come from `session-policy.ts`; values unchanged).

- [ ] **Step 6: Gates + commit** (`fix(onboarding): close ladder counts accumulated history; persist onboarding session id`).

---

### Task 5: `/api/reid-take` sentinel leak

**Files:** Modify: `src/lib/anthropic.ts` (~304-314), `src/app/api/reid-take/route.ts:70`, `src/app/api/tasks/complete/route.ts` (same pattern, ~81-94), `src/lib/reid-sentinels.ts` (new export). Test: extend an existing pure-helper test file or create `src/lib/__tests__/reid-sentinels.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../anthropic.ts";
import { stripSentinelTags } from "../reid-sentinels.ts";

test("buildSystemPrompt omits sentinel instructions when sentinels:false", () => {
  const p = buildSystemPrompt("", { sentinels: false });
  assert.equal(p.includes("[SESSION_COMPLETE]"), false);
  assert.equal(p.includes("[OBSERVATION]"), false);
});

test("stripSentinelTags removes leaked sentinel lines from generated text", () => {
  const dirty = `Real insight here.\n[OBSERVATION] confidence="high" text="leaked"\nMore text.`;
  const clean = stripSentinelTags(dirty);
  assert.equal(clean.includes("[OBSERVATION]"), false);
  assert.equal(clean.includes("Real insight here."), true);
});
```
NOTE for the executor: `anthropic.ts` instantiates the SDK client at module load with `process.env.ANTHROPIC_API_KEY!` — if importing it in a test fails without a key, set a dummy env var in the test (`process.env.ANTHROPIC_API_KEY ??= "test-key"` BEFORE the import via dynamic `await import`), matching how other tests handle module-level side effects (check `reid-summary.test.ts` for the existing pattern — `generateSessionSummary` lazily imports the client for exactly this reason).

- [ ] **Step 2: Run to verify failure**, then implement:

`anthropic.ts`:
```ts
export function buildSystemPrompt(
  context: string,
  opts: { sentinels?: boolean } = {},
): string {
  const { sentinels = true } = opts;
  const parts: string[] = [];
  if (context && context.trim().length > 0) parts.push(context);
  parts.push(REID_VOICE);
  if (sentinels) parts.push(REID_SENTINEL_INSTRUCTIONS);
  return parts.join("\n\n");
}
```
(Preserve the EXACT existing assembly/joining — read lines 300-320 first and change only the conditional; the snippet above is the shape, not a licence to reorder.)

`reid-sentinels.ts` (alongside the existing regexes — reuse them, don't duplicate patterns):
```ts
/** Removes any line that begins with a known sentinel tag. Defensive net for
 *  non-streaming surfaces (reid-take, task-complete ack) where the stream
 *  stripper never runs. */
export function stripSentinelTags(text: string): string {
  return text
    .split("\n")
    .filter(
      (line) =>
        !/^\s*\[(?:SESSION_COMPLETE|ONBOARDING_COMPLETE|OBSERVATION|GOAL_UPDATE|NAME_CAPTURED|EMAIL_CAPTURED)\]/.test(
          line,
        ),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```
(Check the sentinel tag list against the actual regexes at the top of `reid-sentinels.ts` — include every tag defined there, the list above is from the audit.)

Call sites: `reid-take/route.ts:70` → `system: buildSystemPrompt("", { sentinels: false })` and wrap the result: `generated = stripSentinelTags(generated.trim())`. Same two changes in `tasks/complete/route.ts` (it appends a SYSTEM NOTE to `buildSystemPrompt("")` — keep the note, add the option + strip).

- [ ] **Step 3: Gates + commit** (`fix(reid-take): no sentinel instructions on non-streaming surfaces, defensive strip`).

---

### Task 6: Name pipeline — placeholder names + signup-name race

**Files:** Modify: `src/lib/reid-summary.ts` (NAME_STOPLIST, ~123-148), `src/lib/ensure-user-row.ts:40-45`. Test: `src/lib/__tests__/reid-summary.test.ts` (extend).

- [ ] **Step 1: Failing tests**

```ts
test("placeholder pseudo-names are not plausible first names", () => {
  for (const bad of ["Unknown", "unknown", "Founder", "User", "Anonymous", "Unnamed", "Nobody", "Someone", "Anon"]) {
    assert.equal(isPlausibleFirstName(bad), false, bad);
  }
});

test("real names still pass", () => {
  for (const good of ["Theo", "Maya", "Noah", "O'Brien", "Mary-Jane"]) {
    assert.equal(isPlausibleFirstName(good), true, good);
  }
});
```

- [ ] **Step 2: Implement** — add to `NAME_STOPLIST` (in the existing categorised block, new category comment `// placeholder pseudo-names the model emits when it never learned a name`): `"unknown", "founder", "user", "anonymous", "anon", "unnamed", "none", "nobody", "someone", "unclear", "na",`. This guards ALL three name write sites at once (route extractName, NAME_CAPTURED sentinel, onboarding-complete path) since they all gate on `isPlausibleFirstName`.

- [ ] **Step 3: Fix the `ensureUserRow` insert race** (`ensure-user-row.ts:40-45`). The insert error is currently unchecked; if the `on_auth_user_created` trigger creates the row between the `byAuth` check and the insert, the insert fails on the unique constraint and the signup name is silently lost (the observed phaseb-p1/p2 state — name empty until the model later wrote "Unknown"):

```ts
const { error: insertError } = await admin.from("users").insert({
  auth_id: authId,
  email,
  name: cleanName,
  onboarding_complete: false,
});
if (insertError && cleanName) {
  // Likely lost the race against the on_auth_user_created trigger: the row
  // now exists without our name. Re-apply the name iff still empty.
  const { data: raced } = await admin
    .from("users")
    .select("id, name")
    .eq("auth_id", authId)
    .maybeSingle();
  if (raced && !raced.name) {
    await admin.from("users").update({ name: cleanName }).eq("id", raced.id);
  }
}
```

- [ ] **Step 4: Repair the three damaged rows?** NO — phaseb accounts get deleted after the persona re-run (Theo's cleanup directive). No prod writes.

- [ ] **Step 5: Gates + commit** (`fix(name): reject placeholder names, survive signup insert race`).

---

### Task 7: Opener quote-wrapping

**Files:** Modify: `src/lib/reid-summary.ts` (new pure helper + test), `src/app/api/reid/opening/route.ts:165-219`, `src/app/api/reid/route.ts` (first-assistant-message persistence).

- [ ] **Step 1: Failing tests** (`reid-summary.test.ts`):

```ts
test("stripWrappingQuotes removes a fully wrapping quote pair only", () => {
  assert.equal(stripWrappingQuotes('"I\'ve been waiting. What are you building?"'), "I've been waiting. What are you building?");
  assert.equal(stripWrappingQuotes("“Smart quotes too.”"), "Smart quotes too.");
  assert.equal(stripWrappingQuotes('He said "this" yesterday.'), 'He said "this" yesterday.');
  assert.equal(stripWrappingQuotes('"Unbalanced opener'), '"Unbalanced opener');
});
```

- [ ] **Step 2: Implement** in `reid-summary.ts` (pure-helpers section):

```ts
/** Strips ONE fully-wrapping straight/smart quote pair. The model sometimes
 *  recites its scripted opener inside literal quotes despite the "No quotes"
 *  rule (5/20 recent prod openers, Sprint 13 audit). Inner quotes are kept. */
export function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  const pairs: Array<[string, string]> = [['"', '"'], ["“", "”"], ["'", "'"]];
  for (const [open, close] of pairs) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
      return t.slice(open.length, t.length - close.length).trim();
    }
  }
  return t;
}
```

- [ ] **Step 3: `/api/reid/opening` — buffer, strip, send once.** The opener is ≤80 tokens / one line; buffering costs <1s and makes the strip trivial. Replace the manual ReadableStream plumbing (lines 177-210) with:

```ts
let line = "";
try {
  const finalMsg = await aStream.finalMessage();
  line = finalMsg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
} catch {
  return new Response(null, { status: 204 });
}
line = stripWrappingQuotes(line);
if (!line) return new Response(null, { status: 204 });
return new Response(line, {
  headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  },
});
```
The client (`streamOpeningLine`) already reads the body incrementally and trims — a single-chunk body needs no client change.

- [ ] **Step 4: First assistant message of a session — strip at persistence** (`/api/reid` end-handler). Where `cleanedAssistantText` is finalised before `appendMessages` (locate the exact spot in the end handler; it's upstream of the persistence + sentinel processing), add:

```ts
const persistedAssistantText =
  preTurnMessageCount === 0
    ? stripWrappingQuotes(cleanedAssistantText)
    : cleanedAssistantText;
```
and use `persistedAssistantText` for the message insert + legacy `conversations` insert. (The streamed display can still show the quoted version transiently — cosmetic, accepted for B1; the prompt-level fix belongs to B3.)

- [ ] **Step 5: Gates + commit** (`fix(opener): strip wrapping quotes server-side`).

---

### Task 8: Voice flag from web clients

**Files:** Modify: `src/lib/reid.ts` (request type + body), `src/app/(app)/chat/page.tsx` (`streamWithRetry`, `runReidTurn`), `src/app/onboarding/OnboardingClient.tsx` (voice-mode turns).

- [ ] **Step 1:** In `src/lib/reid.ts`, add `voice?: boolean` to the request interface that `streamReid` serialises (`body: JSON.stringify(req)` already passes it through once it's on the type — `validation.ts:21` accepts it server-side).

- [ ] **Step 2:** `chat/page.tsx`: give `streamWithRetry` a third parameter `voice = false`, included in the `streamReid` call object (`voice`), and pass `true` from `runReidTurn` (line ~531) — text `handleSend` stays default `false`.

- [ ] **Step 3:** `OnboardingClient.tsx`: in its `streamReid` call (~163-171), pass `voice: <true when the turn came from the voice input mode>` — read the component's existing input-mode state to source the flag (it has one; locate it at execution).

- [ ] **Step 4: Verify server effect:** route.ts:533-535 sets `sessions.voice_used = true` when the flag arrives — no server change needed.

- [ ] **Step 5: Gates + commit** (`fix(voice): web clients send voice flag so voice_used entitlement counting works`).

---

### Task 9: Full gate run, Playwright smoke, verification report

**Files:** Create: `diagnostics/b1-verification.md`.

- [ ] **Step 1: Full gates in Theo's order:** Impeccable (UI-touching surfaces: chat recap-close behaviour — run the impeccable design check against the chat surface), `npx tsc --noEmit`, `npm run lint`, `npm test`, secret-scanner skill over the diff, then commits are already in place per-task.
- [ ] **Step 2: Playwright smoke on chat surface** (local dev): sign in with an existing test account, send 2 messages, trigger a session close (wrap-up), confirm: recap shows → closing it clears the conversation → a NEW opener streams → DB shows the closed session summarised with non-null `commitments` (read-only SQL). Confirm a restored stale localStorage id does NOT resume a closed session.
- [ ] **Step 3: Write `diagnostics/b1-verification.md`:** duplicate-POST verdict (prod SQL evidence + StrictMode explanation), stuck-user before-count (13/23), per-task fix → evidence table, gate outputs, list of expected persona-rerun flips for the B2 gate (P2 commitments NOT NULL; natural-return no longer resumes; opener no pre-deadline failure assertion — note this one mostly lands with B2's status-aware commitments, B1 only stops the resume side).
- [ ] **Step 4: STOP.** Do not start B2 until Theo has seen the B1 verification report (his explicit sequencing: plan → approval → code applies per build; B2 additionally has the migration dry-run gate).

---

## Self-review notes (done)
- **Theo amendment (2026-06-11, time-dimension closure) incorporated:** `KEEPALIVE_MIN_IDLE_MS` (10 min) and `SESSION_IDLE_TIMEOUT_MS` (60 min) live in `session-policy.ts` with boundary tests; keepalive route refuses recent activity (Task 3 Step 2); `sessionBelongsToAndOpen` treats unsummarised-but-idle sessions as closed (Task 1). Activity timestamp: `sessions.updated_at` does NOT exist (prod schema verified) — `ended_at` keeps its per-turn stamp and is documented as last-activity; no DDL.
- Spec coverage: blueprint 4.1 items (resume defect ✓ T1, duplicate POSTs ✓ T2, writer unification ✓ T3, onboarding hardening ✓ T4) + Theo's additions (reid-take leak ✓ T5, name bug ✓ T6, quote-wrap ✓ T7, voice flag ✓ T8, prod duplicate verification ✓ T2 pre-verified, stuck-user read-only verification ✓ T4/T9). Legacy `conversations` migration: deliberately ABSENT — it's B2-gated by Theo's amendment.
- Onboarding-summary backfill for the 14 users missing one (blueprint 4.1): handled organically by Task 4 (their next visit force-completes from accumulated history). No offline backfill script in B1 — it would be a prod write, which stays gated.
- Type consistency: `isSessionClosed` signature used identically in Tasks 1/4; `endSession` option names (`commitments`/`keyPoints`) match Task 3's call sites; cap constants imported from `session-policy.ts` in both route branches.
- Line numbers are from the 2026-06-11 investigation reads; executor must re-verify each anchor before editing (the file may shift under earlier tasks in this very plan — especially route.ts, edited by Tasks 1, 3, 4, 7).
