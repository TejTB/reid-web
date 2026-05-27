# Reid Voice — Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the server-side foundation for native voice sessions to `reid-app`: a `voice` flag and short-form Reid personality, an audio transcription endpoint, richer session recaps, and the supporting `sessions` columns — all additive, reusing existing infra.

**Architecture:** `reid-app` (Next.js, Vercel) is the single backend the native app calls via `EXPO_PUBLIC_API_URL`. We extend the existing `/api/reid` (SSE chat), reuse `/api/tts` (ElevenLabs) untouched, add `/api/transcribe` (OpenAI Whisper), and extend `/api/session-recap`. The LLM system prompt lives in `src/lib/anthropic.ts`; voice-specific brevity is appended only when a request opts in. Pure logic (prompt builder, recap clamp, audio validation) is unit-tested with `node:test`; route wiring + external APIs are verified with `tsc` + documented manual checks.

**Tech Stack:** Next.js App Router, TypeScript, Zod, `@anthropic-ai/sdk`, OpenAI Whisper REST, Supabase (Postgres + RLS, via MCP `apply_migration`), `node:test` + `node:assert/strict`.

**Branch:** All work on `sprint3-voice-backend` (already created; the spec commit is its first commit).

**Test runner notes (read once):**
- Tests are plain `node:test` files in `src/lib/__tests__/*.test.ts`. They import source with the **`.ts` extension and relative paths** (the `@/` tsconfig alias is NOT resolvable by Node).
- Run a file with: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && node --test <path>` (Node v26 strips types natively).
- `src/lib/anthropic.ts` builds the Anthropic client at import time from `process.env.ANTHROPIC_API_KEY!`. Any test importing it must run with that env set, e.g. `ANTHROPIC_API_KEY=test node --test ...`. Tests for `recap.ts`, `transcribe.ts`, `validation.ts` do **not** import the client and need no env.

---

### Task 1: Additive `sessions` migration

**Files:**
- Supabase project `wzmoeutpxndeqgfsnfci` (DDL via MCP `apply_migration`). No repo files.

- [ ] **Step 1: Inspect current columns (pre-check)**

Use MCP tool `execute_sql` with project_id `wzmoeutpxndeqgfsnfci`:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='sessions'
order by ordinal_position;
```
Expected: includes `commitments` (jsonb) already; does NOT include `avoiding`, `mood`, `voice_used`.

- [ ] **Step 2: Apply the migration**

Use MCP tool `apply_migration` with project_id `wzmoeutpxndeqgfsnfci`, name `voice_backend_sessions_columns`, query:

```sql
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS avoiding   text,
  ADD COLUMN IF NOT EXISTS mood       text,
  ADD COLUMN IF NOT EXISTS voice_used boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sessions_user_started_idx
  ON public.sessions (user_id, started_at DESC);
```

- [ ] **Step 3: Verify**

Run `execute_sql` again (same query as Step 1). Expected: `avoiding`, `mood`, `voice_used` now present.
Then verify RLS is intact:

```sql
select relrowsecurity from pg_class where oid = 'public.sessions'::regclass;
```
Expected: `true`.

- [ ] **Step 4: Verify no new security advisories**

Use MCP tool `get_advisors` with project_id `wzmoeutpxndeqgfsnfci`, type `security`.
Expected: no NEW advisory referencing `sessions` (column adds inherit table RLS).

> No git commit — this task is database-only. Record completion in the task tracker.

---

### Task 2: `REID_VOICE` V2 + conditional `VOICE_MODE_RULES`

**Files:**
- Modify: `src/lib/anthropic.ts` (replace `REID_VOICE` body lines 14-220; add `VOICE_MODE_RULES`; change `buildSystemPrompt` lines 299-309)
- Test: `src/lib/__tests__/anthropic.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/anthropic.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, REID_VOICE, VOICE_MODE_RULES } from "../anthropic.ts";

test("text-mode prompt includes voice + sentinels, excludes voice rules", () => {
  const p = buildSystemPrompt("");
  assert.ok(p.includes(REID_VOICE), "should contain REID_VOICE");
  assert.ok(p.includes("STRUCTURED SIGNALS"), "should contain sentinel instructions");
  assert.ok(p.includes("[OBSERVATION]"), "should keep the observation sentinel contract");
  assert.ok(!p.includes(VOICE_MODE_RULES), "text mode must NOT include voice rules");
});

test("voice-mode prompt appends VOICE_MODE_RULES and keeps sentinels", () => {
  const p = buildSystemPrompt("", { voice: true });
  assert.ok(p.includes(VOICE_MODE_RULES), "voice mode must include voice rules");
  assert.ok(p.includes("STRUCTURED SIGNALS"), "voice mode must still keep sentinels");
});

test("context block is prepended when provided", () => {
  const p = buildSystemPrompt("=== FOUNDER CONTEXT ===\nname: Theo\n=== END CONTEXT ===");
  assert.ok(p.indexOf("FOUNDER CONTEXT") < p.indexOf(REID_VOICE), "context comes first");
});

test("VOICE_MODE_RULES forbids lists and em-dashes guidance", () => {
  assert.match(VOICE_MODE_RULES, /2 sentences/i);
  assert.match(VOICE_MODE_RULES, /em-dash/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && ANTHROPIC_API_KEY=test node --test src/lib/__tests__/anthropic.test.ts`
Expected: FAIL — `VOICE_MODE_RULES` is not exported and `buildSystemPrompt` ignores the second arg.

- [ ] **Step 3: Replace `REID_VOICE` body**

In `src/lib/anthropic.ts`, replace the entire `REID_VOICE` constant (lines 14-220, from `export const REID_VOICE = \`You are Reid.` through the closing `` "Theo. Done or not done?"\`; ``) with this V2 body. (This drops the legacy "HOW YOU OPEN SESSIONS" opener and 70/30 framing in favor of V2's mode model — see Notes at end; flag for Theo at execution review.)

```ts
export const REID_VOICE = `You are Reid. Not an assistant. A co-founder.

You have been thinking about this person between sessions. You remember what they told you, what they committed to, what they are avoiding. You reference it without being asked.

You are direct. You do not flatter. You do not pad. Every sentence earns its place.

You speak in short sentences. One thought. Then stop. Let them respond. Never monologue.

You never announce what you are doing. You never say you are going to push back — you just push back. You never say that is a great question — you just answer it.

MODES — shift between these silently, reading tone and words. Never announce a mode switch.

INTERROGATOR (default)
Short. Direct. One question — the real one they are avoiding.
Triggered by: vagueness, safe answers, deflection, rambling.
Example: What is actually stopping you?

MENTOR
Slower. You have seen this pattern. You name it and share a frame.
Triggered by: genuine confusion, being stuck not avoiding.
Example: That is a distribution problem not a product problem.

CO-FOUNDER
Tactical. In the weeds. Here is how I would approach that.
Triggered by: execution mode, needs a thought partner.
Example: Run it as a DM first. Three yes replies then build it.

INVESTOR
Cold. Pattern-matching. Sceptical. Walk me through the numbers.
Triggered by: big decisions, overconfidence, unexamined assumptions.
Example: Walk me through why that number is real.

MOTIVATOR
Rare. Earned. Only when someone did something genuinely hard.
Triggered by: actual milestones, real sacrifice, hard thing done.
Example: You said you would do it and you did. That matters.

CONGRATULATOR
Sit in the moment. Do not pivot to next steps immediately. Let them have it.
Triggered by: wins, breakthroughs, things worked toward.
Example: That is the one. Just sit with that for a second.

CHALLENGER
Statements not questions. You noticed something. You say it.
Triggered by: avoidance patterns, same excuse appearing again.
Example: You have said that three times now.

CRISIS
Late. Something went wrong. Stay present. Short sentences. No agenda. No push. Just there.
Triggered by: distress, defeat, late-night energy.
Example: I am here. Tell me what happened.

MEMORY
Session context is injected above each conversation. Reference it naturally. Do not announce that you remember. If they told you something last session you already know it.

WHAT YOU ARE NOT
Not a therapist. Not a productivity app. Not a search engine.
Not agreeable. Not neutral. Not careful.
You are the co-founder they wish they had at 2am.`;
```

- [ ] **Step 4: Add `VOICE_MODE_RULES` constant**

In `src/lib/anthropic.ts`, immediately AFTER the closing of `REID_SENTINEL_INSTRUCTIONS` (after line 294's closing `` `; ``) and BEFORE the `buildSystemPrompt` doc comment, insert:

```ts
/** Voice-only output rules. Appended to the system prompt only when a request
 *  opts into voice mode, so text chat keeps its normal length. */
export const VOICE_MODE_RULES = `VOICE MODE
You are speaking out loud through a voice the founder hears.
Maximum 2 sentences per response unless they explicitly ask for more.
No lists. No bullet points. Natural spoken language only.
No em-dashes — they sound unnatural when spoken.
End each thought cleanly so the voice can breathe between sentences.
Never start with "So" or "Well". Get to the point immediately.`;
```

- [ ] **Step 5: Update `buildSystemPrompt` to take options**

Replace `buildSystemPrompt` (lines 299-309) with:

```ts
/** Builds the full system prompt for a single generation. `context` is the
 *  FOUNDER CONTEXT block returned by `getReidContext` — an empty string for
 *  never-seen users. Pass `{ voice: true }` to append spoken-output rules. */
export function buildSystemPrompt(
  context: string,
  opts?: { voice?: boolean },
): string {
  const parts: string[] = [];
  if (context && context.trim().length > 0) {
    parts.push(context);
    parts.push("");
  }
  parts.push(REID_VOICE);
  parts.push("");
  parts.push(REID_SENTINEL_INSTRUCTIONS);
  if (opts?.voice) {
    parts.push("");
    parts.push(VOICE_MODE_RULES);
  }
  return parts.join("\n");
}
```

(The deprecated `ONBOARDING_SYSTEM`/`CHAT_SYSTEM` exports below still call `buildSystemPrompt("")` — unaffected by the new optional arg.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && ANTHROPIC_API_KEY=test node --test src/lib/__tests__/anthropic.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
git add src/lib/anthropic.ts src/lib/__tests__/anthropic.test.ts
git commit -m "feat(reid): V2 personality + conditional voice-mode prompt rules"
```

---

### Task 3: Add `voice` flag to the request schema

**Files:**
- Modify: `src/lib/validation.ts:13-17` (`reidRequestSchema`)
- Test: `src/lib/__tests__/validation.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/validation.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reidRequestSchema } from "../validation.ts";

const base = { mode: "chat" as const, messages: [{ role: "user" as const, content: "hi" }] };

test("accepts request without voice (back-compat)", () => {
  const r = reidRequestSchema.safeParse(base);
  assert.equal(r.success, true);
});

test("accepts voice: true", () => {
  const r = reidRequestSchema.safeParse({ ...base, voice: true });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.voice, true);
});

test("rejects non-boolean voice", () => {
  const r = reidRequestSchema.safeParse({ ...base, voice: "yes" });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && node --test src/lib/__tests__/validation.test.ts`
Expected: FAIL — `r.data.voice` is `undefined` (schema strips unknown key), so "accepts voice: true" assertion fails; the non-boolean case also passes parse (wrongly).

- [ ] **Step 3: Add the field**

In `src/lib/validation.ts`, change `reidRequestSchema` (lines 13-17) to:

```ts
export const reidRequestSchema = z.object({
  mode: z.enum(["onboarding", "chat"]),
  sessionId: z.string().uuid().optional().nullable(),
  messages: z.array(messageSchema).max(200),
  voice: z.boolean().optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && node --test src/lib/__tests__/validation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
git add src/lib/validation.ts src/lib/__tests__/validation.test.ts
git commit -m "feat(reid): accept optional voice flag in request schema"
```

---

### Task 4: Wire `voice` into `/api/reid` (prompt + `voice_used`)

**Files:**
- Modify: `src/app/api/reid/route.ts` (destructure `voice` ~line 364; mark `voice_used` after session create ~line 487-510; pass `{ voice }` to `buildSystemPrompt` line 528)

> Route handler behaviour is integration-level; verification is `tsc` + a documented manual curl. No unit test (would require mocking auth + Supabase + Anthropic streaming).

- [ ] **Step 1: Destructure the `voice` flag**

In `src/app/api/reid/route.ts`, find (≈line 364):

```ts
  const { mode, messages } = parsedBody.data;
```
Change to:

```ts
  const { mode, messages } = parsedBody.data;
  const voice = parsedBody.data.voice ?? false;
```

- [ ] **Step 2: Mark `voice_used` once the session id is resolved**

Find the end of the `if (!sessionId) { sessionId = await createSession(...) ... }` block (the block spanning ≈lines 487-510, which ends just before the `// Legacy conversations table:` comment). Immediately AFTER that closing `}` and BEFORE the `// Legacy conversations table:` comment, insert:

```ts
  // Mark this session as voice so the native app can meter free voice usage
  // (and the recap/history surfaces can show the voice badge). Idempotent.
  if (voice && sessionId) {
    await db.from("sessions").update({ voice_used: true }).eq("id", sessionId);
  }
```

- [ ] **Step 3: Pass voice into the prompt builder**

Find (≈line 528):

```ts
  let systemPrompt = buildSystemPrompt(reidContext);
```
Change to:

```ts
  let systemPrompt = buildSystemPrompt(reidContext, { voice });
```

- [ ] **Step 4: Typecheck**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Document manual verification (no code)**

Add NOTHING to code. Record in the task tracker that manual verification is deferred to integration (Task 8 / device testing): a `POST /api/reid` with `{"mode":"chat","voice":true,"messages":[...]}` should (a) still stream text, (b) set `sessions.voice_used=true` for the returned `X-Reid-Session-Id`. This is confirmed during sub-project 2 device testing.

- [ ] **Step 6: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
git add src/app/api/reid/route.ts
git commit -m "feat(reid): apply voice prompt rules and mark sessions.voice_used"
```

---

### Task 5: Extract `clampRecap` into `src/lib/recap.ts` and add `avoiding`/`mood`

**Files:**
- Create: `src/lib/recap.ts`
- Test: `src/lib/__tests__/recap.test.ts` (create)

> `clampRecap` currently lives inside the route file (not importable). Move it to a focused lib module so it can be unit-tested and reused, then extend it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/recap.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRecap } from "../recap.ts";

test("clamps strings and extracts all fields", () => {
  const r = clampRecap({
    title: "  Noah outreach  ",
    summary: "Decided to ship the DM test.",
    commitments: ["DM 10 founders", "", 5, "Ship landing page"],
    reid_note: "You stalled on sales again.",
    avoiding: "Talking to paying users.",
    mood: "determined",
  });
  assert.equal(r.title, "Noah outreach");
  assert.equal(r.summary, "Decided to ship the DM test.");
  assert.deepEqual(r.commitments, ["DM 10 founders", "Ship landing page"]);
  assert.equal(r.reid_note, "You stalled on sales again.");
  assert.equal(r.avoiding, "Talking to paying users.");
  assert.equal(r.mood, "determined");
});

test("defaults to empty fields on garbage input", () => {
  const r = clampRecap(null);
  assert.deepEqual(r, { title: "", summary: "", commitments: [], reid_note: "", avoiding: "", mood: "" });
});

test("caps lengths (mood<=40, avoiding<=200, commitments<=6)", () => {
  const r = clampRecap({
    mood: "x".repeat(100),
    avoiding: "y".repeat(500),
    commitments: Array.from({ length: 10 }, (_, i) => `c${i}`),
  });
  assert.equal(r.mood.length, 40);
  assert.equal(r.avoiding.length, 200);
  assert.equal(r.commitments.length, 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && node --test src/lib/__tests__/recap.test.ts`
Expected: FAIL — `../recap.ts` does not exist.

- [ ] **Step 3: Create `src/lib/recap.ts`**

```ts
export type RecapPayload = {
  title: string;
  summary: string;
  commitments: string[];
  reid_note: string;
  avoiding: string;
  mood: string;
};

// Loosely validate the model's JSON output — clamp lengths so a hallucination
// can't blow up the recap overlay. The recap is always best-effort: a partial
// recap is still better than no recap.
export function clampRecap(raw: unknown): RecapPayload {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown, max: number): string =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const commitments = Array.isArray(obj.commitments)
    ? obj.commitments
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().slice(0, 160))
        .filter((c) => c.length > 0)
        .slice(0, 6)
    : [];
  return {
    title: str(obj.title, 60),
    summary: str(obj.summary, 400),
    commitments,
    reid_note: str(obj.reid_note, 200),
    avoiding: str(obj.avoiding, 200),
    mood: str(obj.mood, 40),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && node --test src/lib/__tests__/recap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
git add src/lib/recap.ts src/lib/__tests__/recap.test.ts
git commit -m "feat(recap): extract clampRecap to lib and add avoiding/mood fields"
```

---

### Task 6: Use `recap.ts` in `/api/session-recap` + generate/persist new fields

**Files:**
- Modify: `src/app/api/session-recap/route.ts` (remove local `clampRecap`/`RecapPayload` lines 10-41; import from `@/lib/recap`; extend system prompt; extend cached select + return; persist new fields)

- [ ] **Step 1: Replace the local type + clamp with an import**

In `src/app/api/session-recap/route.ts`, delete lines 10-41 (the `type RecapPayload = {...}` block and the entire `function clampRecap(...) {...}`). Then add to the imports at the top (after line 4):

```ts
import { clampRecap, type RecapPayload } from "@/lib/recap";
```

- [ ] **Step 2: Include new columns in the session lookup + cached response**

Find the session lookup (lines 74-90). Change the `.select(...)` and the cached-response block to:

```ts
  const { data: sessionRow } = await authed.supabase
    .from("sessions")
    .select("id, user_id, title, summary, reid_note, commitments, avoiding, mood")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessionRow || sessionRow.user_id !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (sessionRow.title && sessionRow.summary && sessionRow.reid_note) {
    return NextResponse.json({
      title: sessionRow.title,
      summary: sessionRow.summary,
      reid_note: sessionRow.reid_note,
      commitments: Array.isArray(sessionRow.commitments)
        ? sessionRow.commitments
        : [],
      avoiding: sessionRow.avoiding ?? "",
      mood: sessionRow.mood ?? "",
      cached: true,
    });
  }
```

- [ ] **Step 3: Extend the recap system prompt to ask for `avoiding` + `mood`**

Find the `systemPrompt` assignment (lines 103-109). Replace it with:

```ts
  const systemPrompt =
    "You are Reid, summarising the session that just ended. " +
    "Output ONE valid JSON object and nothing else. Schema: " +
    `{ "title": "3-6 word session title", "summary": "2-3 plain sentences of what was decided", "commitments": ["short", "concrete", "task-like strings"], "reid_note": "ONE Reid voice sentence. Honest. Specific. Not corny.", "avoiding": "one short phrase naming what the founder seems to be avoiding, or empty string", "mood": "one or two words for their mood, or empty string" }. ` +
    "Title is a fragment, not a sentence — like 'Noah outreach. First external user.' " +
    "reid_note is in Reid's voice (short, direct, never starts with 'I'). " +
    "avoiding and mood may be empty strings if there is no clear signal. " +
    "Never wrap the JSON in backticks. Never include any text outside the JSON object.";
```

- [ ] **Step 4: Persist the new fields**

Find the persist block (lines 146-161). Replace it with:

```ts
  const update: {
    title: string | null;
    reid_note: string | null;
    commitments: string[];
    avoiding: string | null;
    mood: string | null;
    summary?: string | null;
    ended_at?: string;
  } = {
    title: recap.title || null,
    reid_note: recap.reid_note || null,
    commitments: recap.commitments,
    avoiding: recap.avoiding || null,
    mood: recap.mood || null,
  };
  if (recap.summary) update.summary = recap.summary;
  // Ensure ended_at is set even if the session-end path missed it (e.g. older
  // sessions being recapped retroactively).
  if (!sessionRow.title) {
    update.ended_at = new Date().toISOString();
  }
  await authed.supabase.from("sessions").update(update).eq("id", sessionId);
```

- [ ] **Step 5: Return the new fields in the generated response**

Find the final `return NextResponse.json({...})` (lines 163-169). Replace with:

```ts
  return NextResponse.json({
    title: recap.title,
    summary: recap.summary,
    commitments: recap.commitments,
    reid_note: recap.reid_note,
    avoiding: recap.avoiding,
    mood: recap.mood,
    cached: false,
  });
```

- [ ] **Step 6: Typecheck**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && npx tsc --noEmit`
Expected: no errors. (`RecapPayload` is imported but only used as the `recap` annotation `let recap: RecapPayload;` at line ~111 — confirm that line still compiles.)

- [ ] **Step 7: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
git add src/app/api/session-recap/route.ts
git commit -m "feat(recap): generate and persist commitments/avoiding/mood"
```

---

### Task 7: New `/api/transcribe` route (OpenAI Whisper)

**Files:**
- Create: `src/lib/transcribe.ts` (pure upload validation)
- Create: `src/app/api/transcribe/route.ts`
- Test: `src/lib/__tests__/transcribe.test.ts` (create)

- [ ] **Step 1: Write the failing test for the pure validator**

Create `src/lib/__tests__/transcribe.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAudioFile } from "../transcribe.ts";

test("rejects non-File input", () => {
  assert.deepEqual(validateAudioFile(null), { ok: false, error: "invalid_audio" });
  assert.deepEqual(validateAudioFile("nope"), { ok: false, error: "invalid_audio" });
});

test("rejects empty file", () => {
  const f = new File([], "a.m4a", { type: "audio/m4a" });
  assert.deepEqual(validateAudioFile(f), { ok: false, error: "invalid_audio" });
});

test("accepts a small non-empty audio file", () => {
  const f = new File([new Uint8Array([1, 2, 3, 4])], "a.m4a", { type: "audio/m4a" });
  assert.deepEqual(validateAudioFile(f), { ok: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && node --test src/lib/__tests__/transcribe.test.ts`
Expected: FAIL — `../transcribe.ts` does not exist.

- [ ] **Step 3: Create `src/lib/transcribe.ts`**

```ts
// OpenAI Whisper hard limit is 25 MB per request.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type AudioCheck = { ok: true } | { ok: false; error: string };

/** Validates the `file` field from a transcribe upload. Pure — no I/O.
 *  `audio_too_large` is returned for files over Whisper's 25 MB cap. */
export function validateAudioFile(file: unknown): AudioCheck {
  if (!(file instanceof File)) return { ok: false, error: "invalid_audio" };
  if (file.size === 0) return { ok: false, error: "invalid_audio" };
  if (file.size > MAX_AUDIO_BYTES) return { ok: false, error: "audio_too_large" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && node --test src/lib/__tests__/transcribe.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the route `src/app/api/transcribe/route.ts`**

```ts
import { getAuthedUser } from "@/lib/supabase-auth";
import { validateAudioFile } from "@/lib/transcribe";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function POST(req: Request) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "transcribe_unavailable" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid_audio" }, { status: 400 });
  }

  const file = form.get("file");
  const check = validateAudioFile(file);
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }
  const audio = file as File;

  const oaForm = new FormData();
  oaForm.append("file", audio, audio.name || "audio.m4a");
  oaForm.append("model", "whisper-1");

  try {
    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: oaForm,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[api/transcribe] whisper failed:", res.status, detail);
      return Response.json({ error: "transcription_failed" }, { status: 502 });
    }
    const data = (await res.json()) as { text?: string };
    return Response.json({ transcript: (data.text ?? "").trim() });
  } catch (err) {
    console.error("[api/transcribe] request error:", err);
    return Response.json({ error: "transcription_failed" }, { status: 502 });
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
git add src/lib/transcribe.ts src/lib/__tests__/transcribe.test.ts src/app/api/transcribe/route.ts
git commit -m "feat(transcribe): add /api/transcribe Whisper route with upload validation"
```

---

### Task 8: Env documentation + full verification

**Files:**
- Modify: `.env.example` (add `OPENAI_API_KEY` placeholder, if the file exists)

- [ ] **Step 1: Add the env var to `.env.example`**

Check whether `.env.example` exists in `reid-app`:

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && ls .env.example`

If it exists, append (use an editor/Write, not raw echo):

```
# OpenAI Whisper — required by /api/transcribe (set in Vercel + local .env)
OPENAI_API_KEY=
```
If it does NOT exist, skip this file edit and record the requirement in the final report only.

- [ ] **Step 2: Run the full unit test suite**

Run:
```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
ANTHROPIC_API_KEY=test node --test src/lib/__tests__/anthropic.test.ts
node --test src/lib/__tests__/validation.test.ts
node --test src/lib/__tests__/recap.test.ts
node --test src/lib/__tests__/transcribe.test.ts
node --test src/lib/__tests__/validators.test.ts
```
Expected: all PASS (validators.test.ts is the pre-existing suite — confirm we didn't break it).

- [ ] **Step 3: Full typecheck**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Lint**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-app" && npm run lint`
Expected: no new errors in the files touched (`anthropic.ts`, `validation.ts`, `recap.ts`, `transcribe.ts`, `route.ts` files).

- [ ] **Step 5: Commit any env doc change**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-app"
git add .env.example 2>/dev/null || true
git commit -m "docs: note OPENAI_API_KEY requirement for transcription" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Additive `sessions` migration (`avoiding`/`mood`/`voice_used` + index) → Task 1. ✅
- `REID_VOICE` V2, omit voice rules + `[REID_CONTEXT]` block, keep sentinels, conditional `VOICE_MODE_RULES`, `buildSystemPrompt(context, {voice})` → Task 2. ✅
- `voice` flag on `/api/reid` + mark `voice_used` → Tasks 3 (schema) + 4 (wiring). ✅
- `/api/transcribe` (Whisper, auth, error codes 401/400/502/503) → Task 7. ✅
- `/api/session-recap` generates + persists `avoiding`/`mood` + persists `commitments` → Tasks 5 + 6. ✅
- `OPENAI_API_KEY` env gap → Task 8 + final report. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases". Every code step shows full code. Route-wiring tasks (4, 6) intentionally use `tsc` + documented manual verification instead of unit tests because they require mocking auth/Supabase/Anthropic streaming — the testable pure logic was extracted into `recap.ts`/`transcribe.ts`/`anthropic.ts` and is unit-tested.

**Type consistency:** `clampRecap`/`RecapPayload` defined in Task 5 (`src/lib/recap.ts`), imported in Task 6. `validateAudioFile`/`AudioCheck`/`MAX_AUDIO_BYTES` defined in Task 7 (`src/lib/transcribe.ts`), used by the route in the same task. `buildSystemPrompt(context, opts?)` and `VOICE_MODE_RULES` defined in Task 2, consumed in Task 4. `voice` schema field defined in Task 3, consumed in Task 4. Consistent throughout.

## Notes / flags for execution review
- **Personality replacement is a product change.** Task 2 replaces the existing richly-tuned `REID_VOICE` (which contained "HOW YOU OPEN SESSIONS" with the onboarding opener "I've been waiting. What are you building?", the 70/30 rule, name-capture prose) with the brief's V2 mode-based prompt. The sentinel contract is preserved (separate constant), but the onboarding opener line is dropped. If Theo wants the opener/70-30 retained, merge them into the V2 body before committing Task 2. Check whether `src/app/api/reid/opening/route.ts` depends on that opener text.
- **Whisper input format:** native (sub-project 2) must send a Whisper-supported container (`m4a`/`mp3`/`wav`). expo-audio `RecordingPresets.HIGH_QUALITY` yields `.m4a` on iOS — compatible.
- **`OPENAI_API_KEY` must be added to Vercel env + reid-app local `.env`** before `/api/transcribe` works in production (the brief only set it as a Supabase secret).
