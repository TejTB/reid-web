# REID — SPRINT 10: THE JARVISIFICATION
# This is the sprint that transforms Reid from a business tool into a life tool.
# The north star: Jarvis from Iron Man. A control centre. A system that knows you.
# Every decision in this sprint is made by someone who has built something real,
# lost sleep over it, and knows what it feels like when a product finally clicks.
#
# Launch with:
# cd ~/Documents/reid-app && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --dangerously-skip-permissions
# Then: Read ~/Documents/reid-app/sprint10.md and execute it exactly.

---

## THE VISION

Reid is not a dashboard. Reid is not a productivity tool.
Reid is the system running in the background of your life.
When you open it, you should feel like Tony Stark opening the workshop.
Everything you need. Nothing you don't. It knows where you are, what you owe yourself, and what you've been avoiding.

Every pixel in this sprint serves that feeling.
If a component doesn't make the product feel more alive, more intelligent, or more personal — it doesn't ship.

---

## SKILLS — ALL MANDATORY, INVOKE BEFORE ANY WORK

1. **Skill(superpowers:brainstorming)** — Phase 1. Pressure-test every approach. Find every failure mode before writing code.
2. **Skill(superpowers:writing-plans)** — Phase 2. Full written plan before Phase 3. No exceptions.
3. **Skill(superpowers:executing-plans)** — Phase 3. Follow the plan exactly. Flag deviations before making them.
4. **Skill(superpowers:subagent-driven-development)** — Spawn parallel diagnostic agents in Phase 1.
5. **Skill(impeccable)** at ~/.agents/skills/impeccable — BLOCKING gate before any deploy.
6. **Frontend design principles** — Every component must be production-grade, visually distinctive, and cohesive with Reid's identity. No generic aesthetics. No AI slop. Every page must feel like it was designed by someone who cares deeply about the product.
7. **Magic MCP** — Search before building custom. If a component exists and fits, use it.
8. **Context7 MCP** — Look up every library API before assuming. Framer Motion, recharts, Supabase client — all of them.
9. **Supabase MCP** — All DB work goes through Supabase MCP. No guessing schema.
10. **Playwright MCP** — Smoke test every critical path before flagging complete.

---

## DESIGN SYSTEM — ABSOLUTE LAW

Background: #0A1628
Background deep: #060E1C
Surface: rgba(255,255,255,0.04)
Text primary: #F2EDE3 (warm cream — never pure white)
Text secondary: #C8D5E3
Text dim: #7A90A8
Accent red: #B91C1C
Input border: rgba(255,255,255,0.10)
Fonts: Playfair Display italic (Reid's voice, headlines) + Inter (all UI)
Grid: 8px base — everything divisible by 8
Cards: GlowCard ONLY — import from @/components/ui/glow-card, never recreate
Motion: Framer Motion, transform + opacity only, no bounce, no layout shifts
Never recreate existing components. Always import.

---

## PRE-FLIGHT

```bash
git add -A && git commit -m "pre-sprint10 checkpoint"
```

Read these files in full before writing anything:
- src/app/(app)/home/page.tsx
- src/app/(app)/goals/page.tsx
- src/app/(app)/tasks/page.tsx
- src/app/(app)/noticed/page.tsx (or observations)
- src/components/ui/ — list every file
- src/app/api/ — list every route
- src/lib/anthropic.ts
- src/proxy.ts

Supabase MCP: read full schema for users, sessions, goals, tasks, observations tables.
Report column names before Phase 3.

TodoWrite the complete task list before touching anything.

---

## PHASE 1 — PARALLEL DIAGNOSTIC AGENTS

Invoke Skill(superpowers:subagent-driven-development) and Skill(superpowers:brainstorming).

### Agent 1A — Schema & Data Audit
Using Supabase MCP, read full schema for all tables.
Report exact columns on: users, sessions, goals, tasks, observations.
Identify what needs to be added:
- users.push_message TEXT (today's briefing from Reid)
- users.push_message_date DATE (to avoid regenerating)
- users.current_streak INTEGER DEFAULT 0
- users.last_session_date DATE
- users.avatar_url TEXT
Confirm whether Supabase Storage bucket "avatars" exists.
Report any migration risks. Do not execute yet.

### Agent 1B — Component & Page Audit
Read every file in src/components/ui/.
Read src/app/(app)/home/page.tsx, goals, tasks, noticed pages in full.
Report: what components exist, what's imported where, what custom CSS is leaking.
Specifically check: is BeamsBackground installed? Is GoalRing installed? Is LocationTag installed? Is Banner installed?
Identify every place GlowCard should be used but isn't.
Do not fix yet.

### Agent 1C — API Route Audit
List every route in src/app/api/.
Confirm: does /api/push-message exist? Does /api/avatar/upload exist?
Read /api/reid-take/route.ts fully — understand the pattern for new API routes.
Report what needs to be built. Do not build yet.

### Agent 1D — Streak Logic Design
Read the sessions table schema via Supabase MCP.
Design the streak calculation: consecutive calendar days where at least one session exists for this user.
Determine whether streak should be calculated at runtime or stored + updated on SESSION_COMPLETE.
Report the recommended approach with reasoning.
Brainstorm: what edge cases could break streak calculation? Timezone issues? Sessions spanning midnight? Report all.

---

## PHASE 2 — LEAD AGENT PLAN

Invoke Skill(superpowers:writing-plans).
Read all 4 diagnostic reports.
Write the full execution plan covering:
1. All DB migrations needed (exact SQL)
2. All new components to install (files to create)
3. All new API routes to build
4. Page-by-page rebuild plan with dependencies
5. Risk register
6. Task execution order

Present plan. Wait for approval before Phase 3.

---

## PHASE 3 — EXECUTION

Invoke Skill(superpowers:executing-plans).

---

### TASK 1 — Install New UI Components

Create these files exactly as specified. Do not modify logic — only adapt colours and styles to Reid's design system.

**CREATE src/components/ui/beams-background.tsx**
Adapt the BeamsBackground canvas animation component with these Reid-specific changes:
- Replace bg-neutral-950 with #0A1628
- Change beam hue to: `hue: Math.random() * 20` (deep reds, 0-20 range)
- Change opacity to: `opacity: 0.04 + Math.random() * 0.06` (very subtle)
- intensity prop defaults to "subtle"
- Export as BeamsBackground
This component is used ONLY on the home page as a full-bleed background layer.

**CREATE src/components/ui/location-tag.tsx**
Install the LocationTag component exactly as provided. Adapt colours:
- border-border/60 → border rgba(255,255,255,0.08)
- bg-secondary/50 → bg rgba(255,255,255,0.03)
- text-foreground → text #C8D5E3
- hover:border-foreground/20 → hover border rgba(255,255,255,0.15)
- emerald-500 pulse → keep as-is (it's a live indicator, green is correct)
Export as LocationTag.

**CREATE src/components/ui/banner.tsx**
Install the Banner component. Add one Reid-specific variant:
```
reid: 'bg-[rgba(185,28,28,0.08)] border-[rgba(185,28,28,0.20)] text-[#F2EDE3]'
```
Keep all other variants. Export as Banner.

**CREATE src/components/ui/goal-ring.tsx**
Extract and adapt the FinancialScoreHalfCircle from the financial score component.
Reid-specific adaptations:
- Remove all financial/score framing
- Props: `{ currentValue: number, targetValue: number, unit: string, unitPrefix: boolean, label: string, deadline?: string }`
- Colour logic based on progress percentage:
  - 0-30%: stroke #B91C1C (red — hasn't started)
  - 30-70%: stroke #D97706 (amber — in progress)  
  - 70-100%: stroke #16A34A (green — nearly there)
  - 100%+: stroke #16A34A with a subtle pulse
- Below the ring: large current value in Inter 700 48px #F2EDE3, target value in Inter 400 16px #7A90A8
- Label beneath in Inter 14px #C8D5E3
- Deadline in Inter 12px #7A90A8 if provided
- Animate stroke on mount (keep the existing animation logic)
- Export as GoalRing

---

### TASK 2 — Database Migrations

Using Supabase MCP, execute:

```sql
-- Push message (Reid's daily briefing)
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_message text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_message_date date;

-- Streak tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_session_date date;

-- Profile picture
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
```

Create Supabase Storage bucket "avatars" if it doesn't exist.
Set bucket to public.
Add RLS policy: users can only upload/read their own avatar (path: `{user_id}/avatar`).

Verify all migrations applied. Report confirmation.

---

### TASK 3 — Push Message API

Create: src/app/api/push-message/route.ts

Auth required — getAuthedUser pattern.

Logic:
1. Fetch user row: push_message, push_message_date, name, onboarding_summary
2. If push_message_date === today (UTC): return `{ message: push_message }`
3. If stale or null: fetch the last completed session summary from sessions table
4. Call Anthropic API:
   - model: REID_MODEL
   - max_tokens: 60
   - system: import REID_VOICE from @/lib/anthropic
   - user message:
     ```
     Generate a single push message for ${name || "this founder"} to show when they open Reid today.
     Maximum 12 words. In your voice — direct, specific, no filler.
     Like you've been thinking about them since the last session.
     Their situation: ${onboarding_summary}
     Last session: ${lastSessionSummary || "No sessions yet."}
     
     Examples of the right tone:
     "Louis still hasn't seen it. That's on you, not him."
     "You said this week. It's been four days."
     "Zero users. The product exists. What's actually stopping you?"
     
     Output ONLY the message. No quotes. No explanation.
     ```
5. Save generated message and today's date to users table
6. Return `{ message: generatedMessage }`

Error handling: if generation fails, return a fallback: `{ message: "Reid's watching. Open a session." }`

---

### TASK 4 — Streak Calculation & Update

Add streak calculation to the session completion flow.

In src/lib/session-server.ts (or wherever SESSION_COMPLETE is processed):
After a session ends, calculate and update the streak:

```typescript
async function updateStreak(db: SupabaseClient, userId: string) {
  const today = new Date().toISOString().split('T')[0]
  
  const { data: user } = await db
    .from('users')
    .select('last_session_date, current_streak')
    .eq('id', userId)
    .maybeSingle()
  
  if (!user) return
  
  const lastDate = user.last_session_date
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  
  let newStreak = 1
  if (lastDate === yesterdayStr) {
    newStreak = (user.current_streak || 0) + 1
  } else if (lastDate === today) {
    newStreak = user.current_streak || 1 // already updated today
    return // don't update if already done today
  }
  
  await db.from('users').update({
    current_streak: newStreak,
    last_session_date: today
  }).eq('id', userId)
}
```

Call updateStreak from the SESSION_COMPLETE handler. Read the existing handler fully before touching.

---

### TASK 5 — Avatar Upload

Create: src/app/api/avatar/upload/route.ts

Accepts POST with multipart/form-data containing the image file.
Auth required.
Validates: file is image/jpeg, image/png, or image/webp. Max 2MB.
Uploads to Supabase Storage: bucket "avatars", path `{userId}/avatar`.
Updates users.avatar_url with the public URL.
Returns `{ avatarUrl: string }`.

---

### TASK 6 — Sidebar Rebuild

Read the current sidebar/AppShell component fully before touching.

This is the system console. It should feel like JARVIS's status panel.

**STRUCTURE (top to bottom):**

Top section:
- Reid logo + "Reid" wordmark (existing, keep)
- Thin separator rgba(255,255,255,0.06)

Navigation (middle, flex-1):
- Home, Goals, Reid, Noticed, Plan, Tasks
- Active state: red left border (2px solid #B91C1C), bg rgba(185,28,28,0.06), text #F2EDE3
- Inactive: text #7A90A8, hover text #C8D5E3, hover bg rgba(255,255,255,0.03)
- Nav items: 40px height, 16px horizontal padding, 8px gap between icon and label
- Framer Motion on active indicator — layout animation so the red border slides between items

Stats strip (above bottom section):
- Two stats side by side
- Left: "🔥 {streak} day streak" — if streak is 0, show "Start your streak"
- Right: "Session {n} of 3" — show remaining sessions
- Inter 11px, #7A90A8, padding 12px 16px
- Thin top border rgba(255,255,255,0.06)

Bottom section:
- Profile picture: 32px circle. If avatar_url exists: show image. If null: show initials circle (bg rgba(185,28,28,0.15), text #B91C1C, Inter 600 12px)
- Clicking the profile area opens a minimal dropdown: "Upload photo" + "Sign out"
- Avatar upload: clicking "Upload photo" opens a hidden file input. On file select: POST to /api/avatar/upload. On success: update avatar display immediately.
- User name or email truncated beside the avatar
- LocationTag component below the profile — shows live location/time

All spacing on 8px grid. No layout shifts on load.

---

### TASK 7 — Home Page Rebuild

This is the control centre. The briefing room. The first thing you see when you sit down to work.

Read src/app/(app)/home/page.tsx fully before touching.

**FULL PAGE STRUCTURE:**

Background layer (absolute, full page, z-0):
- BeamsBackground component, intensity="subtle"
- This sits behind everything. Very subtle red beams drifting upward.

Content layer (relative, z-10, max-width 860px, centred, padding 48px 32px):

**1. PUSH MESSAGE (top of page)**
- On page load: POST to /api/push-message, show the returned message
- Loading state: single pulsing line placeholder
- Display: Playfair Display italic, 20px, #F2EDE3, line-height 1.6
- No label, no border, no card — just the message sitting above everything
- Framer Motion fade in after load, 0.4s ease-out
- This is Reid talking to you before you've said anything

**2. BANNER (contextual, conditional)**
- Show Banner component with variant="reid" ONLY when a condition is true:
  - If tasks exist and oldest incomplete task was assigned more than 3 days ago → "Still waiting on [task first 4 words]..."
  - If streak is 0 and user has completed onboarding → "Reid hasn't heard from you yet this week."
  - If no conditions: render nothing (no empty space)
- Banner is dismissible (closable=true), auto-hides after 8000ms

**3. PRIMARY GOAL MINI-RING**
- If user has a primary goal (is_primary=true): show GoalRing component
- Wrap in GlowCard, red glow
- Ring size: 120px diameter (not the full hero size — that's Goals page)
- Goal title in Playfair Display italic 16px beside or below the ring
- Current / target beneath
- Clicking navigates to /goals
- If no primary goal: show nothing (do not show empty state here)

**4. TODAY'S TASK**
- Existing TODAY'S TASK card — keep the content
- Elevate the design: task text in Playfair Display italic
- Subtle red left accent border (3px solid rgba(185,28,28,0.4))
- GlowCard with red glow

**5. CONTINUE / OPEN SESSION**
- Existing card — keep
- "Open session →" button stays red

**MOTION:**
All cards stagger in on page load:
- Push message: delay 0ms
- Banner: delay 100ms (if shown)
- Goal ring card: delay 150ms
- Task card: delay 200ms
- Continue card: delay 250ms
Each: fade in + translateY(12px → 0), 400ms ease-out

**GREETING:**
"Good morning/afternoon/evening, [name]." stays.
If name is null: "Good morning." — never "Good morning, there."

---

### TASK 8 — Goals Page Rebuild

The scoreboard. What you said you wanted. Reid's holding you to it.

Read src/app/(app)/goals/page.tsx fully.

**STRUCTURE:**

Page header:
- "Your Goals" in existing style
- "What you said you wanted. Reid's holding you to it." subtitle

Primary goal section (if is_primary goal exists):
- Full width, prominent
- GoalRing component — large (200px diameter)
- Centred on the page
- Below ring: goal title in Playfair Display italic 24px
- Current / target in large numbers
- Progress % label
- Deadline if set
- GlowCard wrapper, red glow, padding 40px
- Clicking opens FullScreenCard

Divider:
- If secondary goals exist: thin separator + "OTHER GOALS" label in Inter 11px uppercase #7A90A8

Secondary goals grid (2 columns on desktop, 1 on mobile):
- Each goal: GlowCard
- Title in Playfair Display italic
- Horizontal progress bar (6px height, #B91C1C fill)
- Current / target
- Deadline if set
- Clicking opens FullScreenCard

Empty state (no goals):
- Keep existing: "No goals yet. They'll appear after our first real session."

---

### TASK 9 — Tasks Page Rebuild

What Reid has asked you to do. Not a suggestion. An assignment.

Read src/app/(app)/tasks/page.tsx fully.

**STRUCTURE:**

Active tasks list:
- Each task: GlowCard
- Left accent border based on urgency:
  - Overdue (past due_date): 3px solid #B91C1C (red)
  - Due today: 3px solid #D97706 (amber)
  - No due date or future: 3px solid rgba(255,255,255,0.06) (subtle)
- Task description in Inter 15px #F2EDE3, max 2 lines then truncate
- Due date in Inter 12px #7A90A8 if set
- "Overdue" badge in red if past due
- Full card is clickable → FullScreenCard

Completed tasks section:
- Collapsed by default
- Toggle: "Show completed (n)" in Inter 12px #7A90A8
- Completed tasks: opacity 0.4, strikethrough on description

Empty state: keep existing copy.

Framer Motion stagger on list: each card fades in with 60ms delay between them.

---

### TASK 10 — Noticed Page

Almost there. Just needs the grid.

Read the noticed/observations page fully.

Changes only:
- On desktop (min-width 768px): 2-column grid for observation cards
- On mobile: single column
- Each card: GlowCard, amber OBSERVATION badge top-left, date top-right, headline in Playfair Display italic
- Framer Motion stagger on grid: 60ms between cards
- Empty state: keep "Reid's still watching." — do not touch

---

### TASK 11 — Impeccable Gate

Run Skill(impeccable) at ~/.agents/skills/impeccable.

Then:
```bash
npx tsc --noEmit
```
Must exit 0.

Check:
- No hardcoded colours outside design system
- No components recreated that exist (GlowCard, PromptInputBox, etc.)
- No console errors on any page
- BeamsBackground only renders on home page
- GoalRing only renders when goal data exists (never renders empty)
- All Framer Motion animations: transform + opacity only

---

### TASK 12 — Playwright Smoke Tests

Using Playwright MCP, test against preview URL:

1. Home page loads → push message appears (not loading state) → 3 cards visible
2. BeamsBackground renders without console errors
3. Sidebar shows streak counter and session count
4. Profile picture area renders — initials shown if no avatar
5. Goals page → primary goal ring renders if goal exists
6. Goals page → secondary goals grid renders 2 columns on desktop
7. Tasks page → overdue task has red left border
8. Noticed page → 2-column grid renders on desktop
9. Sidebar nav → clicking each item navigates correctly
10. FullScreenCard → opens on card click, ESC closes, full viewport coverage

All 10 must pass.

---

## EXIT CRITERIA

- [ ] npx tsc --noEmit exits 0
- [ ] Impeccable gate passed
- [ ] All 10 Playwright tests pass
- [ ] BeamsBackground on home page — subtle, red tinted, not distracting
- [ ] Push message loads and feels like Reid left a note
- [ ] Sidebar: profile picture (or initials), streak, session count, LocationTag
- [ ] Avatar upload works end to end
- [ ] Home: push message + goal ring + task + continue — control centre feel
- [ ] Goals: primary goal ring hero + secondary goals grid
- [ ] Tasks: urgency-coded left borders, correct empty state
- [ ] Noticed: 2-column grid on desktop
- [ ] No visual regressions on Plan, Chat, or Onboarding
- [ ] Every page feels like part of the same system
- [ ] Opening Reid feels like sitting down at a workstation that knows you

**Theo deploys: `npx vercel --prod`**
**Do not run this command. Present the preview URL and wait.**
