# REID — SPRINT 11: THE PRODUCT SPRINT
# Written to YC standard. Every line is intentional.
# 
# LAUNCH COMMAND:
# cd ~/Documents/reid-app && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --dangerously-skip-permissions
#
# Paste this file into Claude Code after launch, or:
# Read ~/Documents/reid-app/sprint11.md and execute it exactly from the top.

---

## WHO YOU ARE

You are the lead engineer and product director on Reid. You have shipped at Stripe,
Linear, and Notion. You know what separates a product people feel from a product
people tolerate. Reid is days away from being shown to real users. Everything you
do in this sprint is permanent. There are no "we'll fix it later" moves.

Reid is an AI co-founder web app. Not a chatbot. A co-founder. The product lives
or dies on one feeling: Reid has been thinking about you between sessions.
When that feeling lands — the product is alive. When it doesn't — it's just another
AI wrapper.

Stack: Next.js 16, TypeScript, Tailwind, Supabase SSR, Anthropic API (claude-sonnet-4-20250514),
Vercel, Upstash Redis, Framer Motion, ElevenLabs (voice ID: gXoaQmnIbECYarWwg7B2), Stripe.
Project: ~/Documents/reid-app. Supabase: wzmoeutpxndeqgfsnfci.
Stripe monthly: price_1TXllwRMW6MMaIVXczXkPXDh | annual: price_1TXllYRMW6MMaIVXOMmy04WB

CRITICAL CONVENTIONS — never violate these:
- Route protection: src/proxy.ts NOT middleware.ts
- Always getUser() server-side — getSession() is banned, can be spoofed
- Upstash Redis, NOT @vercel/kv
- /auth/callback must stay intact — handles email confirmation + password reset
- Never recreate existing components. Always import from @/components/ui/
- Read every file fully before touching it

EXISTING COMPONENTS — import only, never recreate:
glow-card.tsx, prompt-input-box.tsx, shining-text.tsx, border-trail.tsx,
AppShell.tsx, ReidLogo.tsx, ChatMessage.tsx, full-screen-card.tsx,
beams-background.tsx, location-tag.tsx, banner.tsx, goal-ring.tsx

---

## DESIGN SYSTEM — ABSOLUTE LAW

Background:       #0A1628 (deep navy — never pure black)
Background deep:  #060E1C (overlays, modals)
Surface:          rgba(255,255,255,0.04)
Text primary:     #F2EDE3 (warm cream — never pure white)
Text secondary:   #C8D5E3
Text dim:         #7A90A8
Accent red:       #B91C1C
Input border:     rgba(255,255,255,0.10) minimum
Fonts:            Playfair Display italic — Reid's voice, headlines
                  Inter — all UI, labels, metadata
Grid:             8px base — everything divisible by 8
Cards:            GlowCard ONLY — rgba(255,255,255,0.04) bg, rgba(255,255,255,0.08) border,
                  16px radius, backdrop-filter blur(24px)
Motion:           Framer Motion, transform + opacity only, no bounce, no layout shifts

---

## SKILLS — ALL INVOKED AS BLOCKING REQUIREMENTS

These are not suggestions. Each one must be explicitly invoked before the work
it governs begins. Log that you've invoked each one.

1. Skill(superpowers:brainstorming)
   → Invoke during Phase 1 before any diagnostic agent finalises its report.
   → Pressure-test the session architecture decision. Ask: what breaks? What
     produces a bad user experience? What assumption are we making that could
     be wrong? Flag conflicts before Phase 3.

2. Skill(superpowers:writing-plans)
   → Invoke before Phase 3 begins. Lead agent writes a full plan.
   → One paragraph per task. Every file that will be touched. Every DB change.
     Every new component. Every API route. No vague verbs.

3. Skill(superpowers:executing-plans)
   → Invoke during Phase 3. Follow the written plan precisely.
   → No improvisation without flagging to the plan first.

4. Skill(superpowers:subagent-driven-development)
   → Invoke for Phase 1. Spawn parallel diagnostic agents.
   → Each agent has one responsibility. Reports before Phase 3 starts.

5. Skill(impeccable) at ~/.agents/skills/impeccable
   → BLOCKING GATE before any deploy. Nothing ships without passing.
   → Run after Phase 3 completes. Fix everything it flags.

6. Skill(stripe:stripe-best-practices)
   → Invoke for Task C1 (session monthly reset, Stripe webhook integration).
   → All Stripe work follows this skill's rules. No exceptions.

7. Frontend design principles (read ~/.claude/skills/frontend-design/SKILL.md
   if available, or apply the rules from this prompt's DESIGN SYSTEM section)
   → Every UI component must pass: does it look like a £5,000 product?
   → If the answer is not immediately yes — rework it.

8. Magic MCP (21st.dev)
   → MANDATORY first step before building any new UI component.
   → Query: "animated checkbox", "task card with completion", "goal progress ring",
     "observation card grid", "full screen overlay dark"
   → Log: which query you ran, what was returned, whether you used it or built custom.
   → If a component fits Reid's design system — use it. Adapt the colours/fonts.
   → If nothing fits — build custom with Framer Motion. But you must search first.

9. Context7 MCP
   → Before assuming ANY library API. Framer Motion layoutId, Supabase client
     methods, Next.js route handlers — look them up before writing.

10. Supabase MCP
    → All DB work goes through Supabase MCP. No raw SQL guessing.
    → Use it to inspect table schemas before writing migrations.
    → All migrations applied through Supabase MCP apply_migration.

11. Playwright MCP
    → Smoke tests at the end. All critical paths must pass before Theo deploys.

12. Vercel MCP (if authenticated — check first, skip if auth error persists)
    → Use to confirm preview deploy succeeded and check build logs if it fails.

13. Greptile MCP (if available — check with `claude mcp list`)
    → If available: use it to search the codebase for FREE_SESSIONS, session
      counting logic, and the push message API before touching anything.
    → If not available: use Bash grep searches instead.

14. Firecrawl MCP (if available — check with `claude mcp list`)
    → If available: use to audit reid-app.vercel.app for any UI regressions
      after the preview deploy. Crawl home, goals, tasks, noticed pages.
    → If not available: use Playwright MCP for this instead.

---

## PRE-FLIGHT

```bash
git add -A && git commit -m "pre-sprint11 checkpoint" --allow-empty
git checkout -b sprint/11-patch
```

TodoWrite the complete task list before touching any file.

---

## PHASE 1 — DIAGNOSTIC (parallel agents, all blocking)

Invoke Skill(superpowers:subagent-driven-development).
Invoke Skill(superpowers:brainstorming) within each agent's analysis.

Spawn 6 parallel diagnostic agents. No writes. Reports only. All 6 must
complete before Phase 2 begins.

---

### AGENT 1 — Name "Almost" + Signup Flow

Read in full:
- src/app/(auth)/register/page.tsx (or equivalent signup page)
- src/app/(auth)/login/page.tsx
- src/app/api/auth/signup/route.ts
- Any server action that writes to profiles.full_name
- src/app/(app)/home/page.tsx — find the name resolution logic
- src/components/layout/AppShell.tsx — find where sidebar name is read

Questions to answer:
1. What path produces the string "Almost" as a stored or derived name?
   Is it a DB default? A form placeholder that got saved? A metadata key?
2. Where exactly does the greeting resolve the name on home?
3. Does the signup flow currently have a name/full_name field?
4. What is the current Settings page name display — is there an edit name field?

Report: exact file + line that writes or resolves "Almost", and whether
a name field exists on signup today.

---

### AGENT 2 — Session Counting, Limits, Paywall Gate

Read in full:
- src/lib/session-shared.ts (or wherever FREE_SESSIONS is defined)
- src/app/(app)/chat/page.tsx or wherever the session opens
- src/app/api/reid/route.ts or the main chat API route
- src/app/(auth)/settings/page.tsx — how sessions are displayed
- AppShell.tsx — how session count is shown in sidebar
- Any middleware or API guard that checks session limits

Use Greptile or Bash to search for: FREE_SESSIONS, session_count,
sessions_used, "of 3", "Session 1", paywall

Questions to answer:
1. Where is FREE_SESSIONS defined? What is its current value?
2. Where is the paywall gate checked — at session START or during a session?
3. Do sidebar, chat header, and Settings all read from the same source?
4. Is there any monthly reset logic? Where would it need to go?
5. Is session_count stored in profiles table? What column?

Report: complete map — constant location, gate location, display locations,
current counting logic, any monthly reset mechanism.

---

### AGENT 3 — Session Architecture (End + Recap)

Read in full:
- src/app/api/reid/route.ts (the main chat API — full file)
- Any session state management in the chat page
- The messages table or equivalent in Supabase (use Supabase MCP to inspect)
- src/app/(app)/plan/page.tsx — how sessions appear here

Questions to answer:
1. Is there currently a message count tracked per session?
2. How is a session "opened" and "closed" in the current system?
3. Does the DB have a sessions table? If yes — what columns?
4. What happens when the user closes the chat page — is the session saved?
5. How does Plan page know about sessions?

Report: full session lifecycle as it exists today. What needs to be added
to support: message counting → 20-message end → recap generation → DB write
→ display on Plan page.

---

### AGENT 4 — Push Message + Banner

Read in full:
- src/app/api/push-message/route.ts
- src/app/(app)/home/page.tsx — banner condition + push message render

Questions to answer:
1. What prompt does push-message use? Does it check returning vs new user?
2. What exact condition triggers the Banner component?
3. What is the user's account creation date stored as — `created_at` on auth.users?
4. How does the app know if onboarding is complete?

Report: push message prompt + banner condition verbatim from code.

---

### AGENT 5 — Card UI Audit (Tasks, Goals, Noticed)

Read in full:
- src/app/(app)/tasks/page.tsx
- src/app/(app)/goals/page.tsx
- src/app/(app)/observations/page.tsx
- src/components/ui/goal-ring.tsx
- src/app/api/tasks/item/[id]/complete/route.ts

Take screenshots of each page using Playwright MCP and describe:
- Tasks: does the card have a checkbox? A label? Playfair italic text?
  Red accent border? GlowCard treatment?
- Goals: where does the GoalRing render? What text is inside/overlapping the SVG?
  Is there an "Add goal" button anywhere?
- Noticed: does the badge match between card and FullScreenCard modal?
  Are titles truncating? Is there GlowCard treatment?

Report: visual + code audit of all three pages. List every gap vs design system.

---

### AGENT 6 — Location Tag + Observation Badge + DB Schema

Read in full:
- src/components/ui/location-tag.tsx
- src/components/ui/banner.tsx
- The observations/goal-ring rendering path for badge type

Also inspect via Supabase MCP:
- profiles table columns
- sessions table (if exists)
- goals table columns (especially current_value, target_value, unit)
- observations table columns (especially severity/type field name)

Report: location tag truncation root cause, badge type field name in DB,
and full profiles schema with all existing columns.

---

## PHASE 2 — LEAD AGENT PLAN

Invoke Skill(superpowers:writing-plans).

Read all 6 diagnostic reports. Synthesise into a single written plan.

Format: one paragraph per task, stating:
- The exact file(s) to change
- The exact DB migration (if any) — written out fully
- The exact new component (if any) — file path + what it does
- Any risk or dependency between tasks

Flag any conflict or false assumption before Phase 3 starts.
This is the last checkpoint before code is written.

Present the plan. Wait for approval before proceeding.

---

## PHASE 3 — EXECUTION (sequential, one task at a time)

Invoke Skill(superpowers:executing-plans).

Each task: read files → write → verify → next task. Never skip the read step.

---

### TASK 1 — Name "Almost" Fix + Signup Name Field

**Sub-task 1a — Fix the "Almost" write path**
Apply the root cause fix from Agent 1's report.
The string "Almost" must never be written to profiles.full_name.
If it's a DB default value — use Supabase MCP to update the column default to NULL.
If it's a code fallback — remove it and replace with NULL.

**Sub-task 1b — Add name field to signup**
On the signup/register page, add a "Full name" input field above the email field.
- Label: "Your name" (not "Full name" — conversational)
- Placeholder: "Theo"
- Required: yes
- On submit: write to profiles.full_name via the signup API route
- Design: matches existing input field style exactly — same border, height, font

**Sub-task 1c — Add name edit to Settings**
On the Settings page account card, add an editable name field.
Current: shows name (or "Almost") as static text.
Change: clicking the name makes it editable inline. On blur or Enter: saves to
profiles.full_name via a PATCH to /api/profile or equivalent server action.
Use Supabase MCP to confirm column name before writing.

**Sub-task 1d — Fix greeting fallback**
On home page greeting: if full_name is null or empty string → "Good morning."
Never "Good morning, Almost." Never "Good morning, there."

---

### TASK 2 — FREE_SESSIONS Monthly Reset Architecture

**Sub-task 2a — Update FREE_SESSIONS constant**
Change FREE_SESSIONS from 3 to 5 in src/lib/session-shared.ts.

**Sub-task 2b — Monthly reset schema**
Use Supabase MCP to apply this migration:

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sessions_used_this_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_month_start timestamptz NOT NULL DEFAULT date_trunc('month', now());
```

**Sub-task 2c — Monthly reset logic**
In the session gate function (wherever the paywall check lives):
Before checking the count, run this reset check:

```typescript
const now = new Date()
const monthStart = new Date(profile.sessions_month_start)
const isNewMonth =
  now.getFullYear() > monthStart.getFullYear() ||
  now.getMonth() > monthStart.getMonth()

if (isNewMonth) {
  await supabase
    .from('profiles')
    .update({
      sessions_used_this_month: 0,
      sessions_month_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    })
    .eq('id', userId)
  profile.sessions_used_this_month = 0
}
```

**Sub-task 2d — Gate at session START only**
The paywall check must happen ONLY when the user clicks "Open session" or
starts a new session. It must NEVER fire mid-conversation.

Logic: if sessions_used_this_month >= FREE_SESSIONS AND user is not Pro → show paywall.
If user IS Pro → no limit.

On session start (when the chat API receives the FIRST message of a new session):
increment sessions_used_this_month by 1.

**Sub-task 2e — Update all display surfaces**
Sidebar, chat header, Settings — all must show sessions_used_this_month / FREE_SESSIONS.
Settings shows: "X of 5 sessions used this month."
Sidebar: "Session X of 5"
Chat header: "Session X of 5"
All read from the same source — the profile object — not hardcoded.

---

### TASK 3 — Session End Architecture (20 messages → Recap → Home)

This is the most architecturally significant task. Read Agent 3's report
in full before writing a single line.

Use Context7 to look up: Upstash Redis setex, getex if needed for message counting.
Use Supabase MCP to inspect the sessions table (or create it if it doesn't exist).

**Sub-task 3a — Sessions table**
If no sessions table exists, apply this migration via Supabase MCP:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  outcome_captured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions(created_at DESC);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (auth.uid() = user_id);
```

**Sub-task 3b — Message count tracking**
In the chat API route (src/app/api/reid/route.ts):
- Track message_count for the current session in Upstash Redis:
  key: `session:message_count:{userId}:{sessionId}`
  Increment on each message pair (user + Reid = +1 exchange).
- Also track session_id in Redis: `session:current:{userId}`

**Sub-task 3c — Outcome detection**
A session has a "productive outcome" when all of the following are true:
  1. At least 1 task has been assigned (tasks table has a row for this session)
  2. At least 1 goal exists or has been updated
  3. message_count >= 6 (minimum meaningful conversation)

Check this after each Reid response. If outcome is met and message_count >= 6 →
set outcome_captured = true in Redis.

**Sub-task 3d — Session end trigger**
A session ends when EITHER:
  - message_count reaches 20 (hard limit — Reid wraps up)
  - outcome_captured is true AND user sends a message that contains a clear
    sign-off (e.g. "thanks", "got it", "bye", "that's it") — optional enhancement,
    implement only if straightforward

At message 17, Reid's system prompt injects: you are 3 messages from the end
of this session. Wrap the conversation toward a clear commitment.

At message 20 (or on outcome), the API returns a special response flag:
`{ session_ended: true, session_id: "..." }` in addition to Reid's closing message.
Reid's closing message for message 20:
"That's what I needed. I'll be thinking about this. Come back when there's
something to report."

**Sub-task 3e — Recap screen**
When the frontend receives session_ended: true:
- Show a full-screen recap overlay (not a modal — full screen, bg #060E1C)
- Generate session summary: POST /api/session-recap with session_id
  The recap API calls Anthropic to generate:
  {
    title: "3-6 word session title" (e.g. "Noah outreach. First external user."),
    summary: "2-3 sentence plain summary of what was decided",
    commitments: ["array", "of", "task-like strings Reid extracted"],
    reid_note: "One sentence from Reid. His voice. Honest."
  }
- Store title + summary + reid_note in the sessions table (ended_at = now())
- Display on recap screen:
  - Session title in Playfair Display italic, 28px, centered
  - Summary in Inter 16px, #C8D5E3
  - Commitments as a list with small red dots, Playfair italic
  - Reid's note below in Playfair italic, smaller, dimmer
  - "Back to home →" button in red after 2 seconds (delayed — let them read it)
- Framer Motion: fade in from opacity 0, stagger each element 150ms

**Sub-task 3f — Plan page update**
The Plan page currently shows "Session 2 — Not yet" for locked sessions.
After a session ends and is saved, the Plan page should show each completed
session as a card with: session title + reid_note + ended_at date.
Locked future sessions remain as "Not yet."

---

### TASK 4 — Push Message Fix

Read src/app/api/push-message/route.ts fully.

The push message must NEVER return "What are you building? I've been waiting."
to a returning user.

Returning user = sessions_used_this_month > 0 OR has a completed session in
the sessions table OR onboarding_complete = true.

New user (first session, no history) = show onboarding opener.
Returning user = use context-aware prompt.

Context-aware prompt for push message (returning user):
```
You are Reid. You have been thinking about this founder since the last session.
You know their situation, their goals, their tasks. Write ONE sentence — spoken
directly to them — as if you've been watching and have something specific to say.
Not a question. Not a greeting. A statement that proves you've been paying attention.
Reid never starts with "I". Reid never uses generic phrases. This is the first
thing they see when they open the app. Make it land.

User context:
- Most recent task: {latest_task_text or "none assigned yet"}
- Primary goal: {primary_goal_title or "none set"}
- Last session: {last_session_title or "first session coming up"}
- Days since last session: {days_since_last_session}
```

On API failure — return nothing. The home page shows no push message on failure.
Never show an error string or fallback placeholder text.

---

### TASK 5 — Banner Condition Fix

Read src/app/(app)/home/page.tsx — find the exact banner condition.

Fix: Banner fires only when ALL of the following are true:
- user.created_at is more than 24 hours ago
- sessions_used_this_month > 0 (user has actually had at least one session)
- streak === 0 (confirmed inactivity)

Day-0 users with zero sessions never see this banner.

Do not break the task-overdue banner variant — read its condition and preserve it.

---

### TASK 6 — GoalRing Redesign

Read src/components/ui/goal-ring.tsx fully.
Use Context7 to verify SVG arc path math if needed.

Redesign the ring. The only text inside or overlapping the ring SVG is the
percentage. Nothing else.

SVG spec:
- ViewBox: "0 0 120 120" (or whatever matches current size)
- Background arc: rgba(185,28,28,0.2) stroke, strokeWidth 8, no fill
- Progress arc: #B91C1C stroke, strokeWidth 8, stroke-linecap round
- Arc is a full circle (not half-ring) — 360 degrees available
- Centre text: percentage only — "{Math.round(percentage)}%"
  - Font: Inter, weight 600
  - Size: proportional — fontSize = diameter * 0.18
  - Fill: #F2EDE3
  - textAnchor: middle, dominantBaseline: middle
  - Positioned at cx, cy (exact centre of viewBox)

No "0 users" inside the ring. No "of 10 users" inside the ring.
Goal title, current/target values, due date — all go OUTSIDE the SVG,
below the ring, in the card layout.

Apply to both sizes:
- Home mini-ring: 120px diameter
- Goals page ring: 180px diameter
Both use the same GoalRing component — size is a prop.

---

### TASK 7 — Task Cards Elevation (/tasks page)

Before any work: invoke Magic MCP with query "task card completion animated checkbox dark".
Log the result.

Read src/app/(app)/tasks/page.tsx fully.
Read src/app/api/tasks/item/[id]/complete/route.ts — confirm it works.

The tasks page must match the quality of the home task card.
Every task card must have:

**Visual:**
- GlowCard wrapper — always, never a plain div
- "TASK" label in Inter 500 10px letterSpacing 0.1em, #B91C1C, top left of inner card
- If task is the newest/most recent: label reads "TODAY'S TASK"
- Red left accent: 3px solid rgba(185,28,28,0.4) on inner card left edge
- Task text: Playfair Display italic, 17px, #F2EDE3, line-height 1.6
- Due date (if set): Inter 12px, #7A90A8, below task text

**Checkbox:**
- Circle checkbox — 20px diameter, border: 1.5px solid rgba(255,255,255,0.2)
- Left of task text, vertically centred
- On click: POST /api/tasks/item/[id]/complete
- On success: circle fills with #B91C1C, task text gets line-through in #7A90A8,
  opacity transitions to 0.5 over 300ms
- After 600ms: task fades out entirely (opacity 0, height collapses via Framer Motion)
- Optimistic update — don't wait for server response to show the completion state

**Motion:**
- Cards stagger in on page load: each card delays 60ms more than previous
- Framer Motion: fade in + translateY(8px → 0), 350ms ease-out

**Completion state:**
If no incomplete tasks remain: show empty state.
Empty state text (Playfair italic, centred, #7A90A8):
"Reid hasn't asked anything of you yet."
No empty state illustration — just the text.

---

### TASK 8 — Goals Cards Elevation (/goals page)

Before any work: invoke Magic MCP with query "goal progress card dark premium".
Log the result.

Read src/app/(app)/goals/page.tsx fully.
Read the goals table schema via Supabase MCP.

The goals page must feel like a scoreboard. Every goal must feel consequential.

**Primary goal card:**
- Full-width GlowCard with stronger red glow (box-shadow with higher opacity)
- Layout: left side = GoalRing (180px, post-redesign), right side = details
- Right side content:
  - "PRIMARY GOAL" pill — Inter 500 9px, letterSpacing 0.12em, red, top
  - Goal title: Playfair Display italic, 24px, #F2EDE3
  - Current vs target: "{current_value} of {target_value} {unit}" Inter 14px #C8D5E3
  - Due date: Inter 12px, #7A90A8
  - Days remaining if < 14 days: "X days left" in red
  - "0% COMPLETE" → styled chip: Inter 500 10px, rgba(185,28,28,0.15) bg,
    #B91C1C text, 4px radius, padding 2px 8px

**Secondary goal cards (if any):**
- Smaller GlowCard, 2-column grid on desktop, single column mobile
- GoalRing 80px diameter, left aligned
- Goal title right of ring, Playfair italic 16px
- Progress below title

**"Add a goal" button:**
- Below all goal cards
- Style: no fill, border 1px solid rgba(255,255,255,0.1), Inter 14px, #7A90A8
- Text: "+ Tell Reid about another goal"
- On click: navigates to /chat with a pre-filled message:
  "I want to set a new goal: " — user completes it in session
  (Do not build a modal — session is the interface for goal creation)

**If no goals at all:**
Empty state:
"Reid doesn't know what you're building toward yet."
Red button below: "Open a session →" → navigates to /chat

---

### TASK 9 — Noticed Cards Elevation (/observations page)

Before any work: invoke Magic MCP with query "observation card grid badge dark".
Log the result.

Read src/app/(app)/observations/page.tsx fully.
Read the observations table schema via Supabase MCP — specifically the
severity/type column name.

**Card design:**
- GlowCard always
- Badge top-left — severity-coded:
  - WARNING: #B91C1C bg, white text
  - PATTERN: rgba(217,119,6,0.9) bg (amber), white text
  - INFO: rgba(37,99,235,0.9) bg (blue), white text
  - Default/OBSERVATION: rgba(100,116,139,0.5) bg, #C8D5E3 text
- Both the list card AND the FullScreenCard modal must read from the same
  observations.severity column — never hardcode the badge label
- Full title — do not truncate. Allow wrap to 2 lines max.
  Title: Playfair Display italic, 18px, #F2EDE3
- One-line body preview: first 80 chars of observation body, Inter 13px, #7A90A8
- Date top-right: Inter 12px, #7A90A8

**Layout:**
- 2-column grid on desktop (min-width 768px), 1-column on mobile
- Stagger on mount: 60ms between cards

**Empty state:**
"Reid's still watching." — Playfair italic, centred, #7A90A8

---

### TASK 10 — Location Tag Fix

Read src/components/ui/location-tag.tsx fully.

Remove any character limit or max-width CSS that clips "Newcastle" to "Newcas".
The full string must render.
If the sidebar has a fixed width causing overflow, apply:
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap
  AND add title={locationString} attribute for hover tooltip.
But never clip mid-word — test with "Whitley Bay, Newcastle" as the string.

---

## PHASE 4 — IMPECCABLE GATE (blocking)

Invoke Skill(impeccable) at ~/.agents/skills/impeccable.

It must pass before any deploy.

Additionally verify manually:
- [ ] No component has been recreated that exists in src/components/ui/
- [ ] No hardcoded colour strings outside the design system
- [ ] No "getSession()" calls anywhere in server code
- [ ] No "middleware.ts" — route protection is in proxy.ts only
- [ ] All new Supabase queries use getUser() not getSession()
- [ ] All Framer Motion animations use transform + opacity only
- [ ] GoalRing never renders with text overlapping the SVG arc
- [ ] Sessions_used_this_month resets correctly when a new month starts
- [ ] Paywall check fires ONLY at session start, never mid-conversation
- [ ] FREE_SESSIONS is 5 everywhere — no hardcoded "3"
- [ ] Push message never shows onboarding opener to a returning user
- [ ] Banner never fires on day-0 accounts with zero sessions

Fix everything Impeccable flags. Run tsc --noEmit. Zero type errors.

---

## PHASE 5 — PLAYWRIGHT SMOKE TESTS

Use Playwright MCP to run against the preview URL.

All 15 tests must pass:

1. Signup flow — name field visible, submits successfully, profile.full_name saved
2. New user home page — greeting shows name correctly, no "Almost", no "there"
3. Session start — paywall check fires before chat opens, not after first message
4. Session counter — shows "Session X of 5" not "Session X of 3"
5. Settings → "X of 5 sessions used this month"
6. Push message — returning user sees context-aware message, not onboarding opener
7. Banner — does NOT show on a brand new account (0 sessions, created today)
8. GoalRing — no text overlapping the SVG arc, only percentage visible inside
9. Goals page — primary goal card has ring + title + metrics layout
10. Goals page — "Tell Reid about another goal" button visible
11. Tasks page — task card has checkbox, "TODAY'S TASK" label, Playfair italic text
12. Tasks page — clicking checkbox marks complete, visual completion state fires
13. Noticed page — observation card has full untruncated title + severity badge
14. FullScreenCard — badge type matches list card badge type
15. Location tag — full location string renders, no mid-word clip

---

## EXIT CRITERIA

Every item must be checked before presenting the preview URL:

- [ ] tsc --noEmit exits 0
- [ ] Impeccable gate passed
- [ ] All 15 Playwright tests pass
- [ ] "Almost" is gone from every surface
- [ ] FREE_SESSIONS = 5, monthly reset, correct everywhere
- [ ] Session gate fires at start only — mid-conversation paywall impossible
- [ ] Session end at 20 messages works — recap screen renders
- [ ] Sessions table exists with correct schema and RLS
- [ ] Plan page shows completed session titles
- [ ] Push message returns context-aware content for returning users
- [ ] Banner condition is correct — no false alarms
- [ ] GoalRing is clean — percentage only, no overlap
- [ ] Task cards on /tasks match home card quality
- [ ] Goal cards on /goals feel like a scoreboard
- [ ] Observed cards on /noticed are elevated with severity badges
- [ ] Location tag renders full string
- [ ] Magic MCP was queried for every new component (log in output)
- [ ] Stripe best practices followed for all billing/limit logic
- [ ] No console errors on any page
- [ ] No visual regressions on Chat, Plan, or Onboarding pages

---

## DEPLOY

Theo deploys to production himself.

Your final output:
1. Preview URL from `npx vercel` (preview only — do not run `npx vercel --prod`)
2. A concise summary: what changed, what was found, any manual steps needed
   (e.g. "Existing 'Almost' records in DB need manual update — query provided")
3. Provide the Supabase SQL to fix any existing "Almost" records:
   UPDATE profiles SET full_name = NULL WHERE full_name = 'Almost';

Do not run `npx vercel --prod`. Present the preview URL and wait.
