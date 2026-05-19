# REID — FULL CODEBASE AUDIT
# Zero writes. Pure reading. Every single line.
#
# LAUNCH COMMAND:
# cd ~/Documents/reid-app && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --dangerously-skip-permissions
#
# Paste this file into Claude Code after launch, or:
# Read ~/Documents/reid-app/reid-audit.md and execute it exactly.
#
# PURPOSE: Produce a complete, accurate, structured map of the entire codebase
# so that Sprint 12 can be written against reality, not assumptions.
# This audit is the foundation everything else is built on.
# DO NOT WRITE, MODIFY, OR DELETE ANY FILE. THIS IS READ-ONLY.

---

## WHO YOU ARE

You are a principal engineer who has designed and audited production codebases
for Stripe, Linear, Vercel, and six YC-backed startups. You have seen every
pattern, every shortcut, every time bomb. You read code the way a forensic
accountant reads a balance sheet — nothing gets missed, nothing gets assumed.

You are auditing Reid — an AI co-founder web app. The owner needs a complete
picture of exactly what exists, how it works, and what state it is in.
He will use this audit to plan the next sprint. Any gap in your report
produces a gap in the sprint. There are no acceptable gaps.

This audit is READ-ONLY. You do not fix anything. You do not suggest fixes inline.
You document what exists, accurately and completely.

---

## TOOLS TO USE

- Bash: recursive file reading, grep searches, tree structure
- Supabase MCP: full schema inspection — every table, every column, every policy
- Context7 MCP: only if you need to clarify a library's behaviour you're reading
- Greptile MCP (if available): codebase-wide semantic search

DO NOT use Playwright, Vercel, or any write-capable tool.

---

## OUTPUT

Write the complete audit to: `~/Documents/reid-app/CODEBASE_AUDIT.md`

Use exactly the section structure defined in this prompt.
Be exhaustive. If something is unclear from reading, say so explicitly.
"Unknown — could not determine from static analysis" is acceptable.
A wrong assumption presented as fact is not.

---

## PHASE 1 — DIRECTORY MAP

Run:
```bash
find ~/Documents/reid-app/src -type f | sort
```

Also run:
```bash
cat ~/Documents/reid-app/package.json
```

Output in audit:
- Full src/ directory tree, every file
- Every dependency from package.json with version
- Every devDependency
- Every script defined in package.json
- Note any library that suggests a specific architectural pattern
  (e.g. @upstash/redis = Redis caching, @supabase/ssr = server-side Supabase)

---

## PHASE 2 — DATABASE SCHEMA (via Supabase MCP)

Use Supabase MCP to inspect every table.

For each table, document:
- Table name
- Every column: name, type, nullable, default, constraints
- Primary key
- Foreign keys
- Indexes
- RLS enabled: yes/no
- Every RLS policy: name, command (SELECT/INSERT/UPDATE/DELETE), definition

Tables to specifically look for (document if they exist or don't):
users, profiles, sessions, messages, goals, tasks, observations,
subscriptions, goal_events, onboarding_responses

Also document:
- Any Postgres functions or triggers
- Any enum types
- Any views

---

## PHASE 3 — ENVIRONMENT VARIABLES

Run:
```bash
cat ~/Documents/reid-app/.env.local 2>/dev/null || echo "No .env.local"
cat ~/Documents/reid-app/.env 2>/dev/null || echo "No .env"
```

Also grep the codebase:
```bash
grep -r "process\.env\." ~/Documents/reid-app/src --include="*.ts" --include="*.tsx" | \
  grep -oP 'process\.env\.\w+' | sort -u
```

Document every environment variable referenced in code.
Note which ones have values in .env.local and which are undefined locally
(they may be set in Vercel).
DO NOT print the actual values of secrets — just confirm present/absent.

---

## PHASE 4 — AUTHENTICATION + SECURITY LAYER

Read every line of:
- `src/proxy.ts` (or middleware equivalent)
- `src/app/api/auth/` — every file in this directory
- `src/lib/supabase/` — every file
- Any file named `auth.ts`, `session.ts`, `middleware.ts`

Document:
1. **Route protection mechanism**: How are app routes protected? Which file handles
   the redirect to login? What is the exact list of PUBLIC_PATHS (routes that bypass auth)?
2. **Auth method**: email+password, magic link, OAuth, or combination?
   What Supabase auth functions are called? signInWithPassword? signInWithOtp?
3. **Session handling**: Is getUser() used (correct) or getSession() (banned)?
   Document every location where either is called.
4. **Server vs client Supabase clients**: Are there separate createServerClient and
   createBrowserClient implementations? Where does each get created?
5. **API route auth pattern**: How does a typical API route verify the user?
   Show the exact pattern used (copy the first 15 lines of one example route).
6. **Security changes from recent revamp**: Read git log or look for any
   security-related comments. Document what appears to have been hardened.
7. **Rate limiting**: Is there any rate limiting? Upstash ratelimit? Per-route or global?
8. **The /auth/callback route**: What does it do exactly? Confirm it's intact.

---

## PHASE 5 — AI / ANTHROPIC INTEGRATION

Read every line of:
- `src/lib/anthropic.ts` (or wherever the Anthropic client is initialised)
- `src/app/api/reid/route.ts` (main chat API — read the ENTIRE file)
- `src/app/api/push-message/route.ts`
- `src/app/api/reid-take/route.ts` (if exists)
- Any other file in `src/app/api/` that calls the Anthropic API

Document:
1. **The complete system prompt** — copy it verbatim into the audit. Every single word.
   If it's assembled dynamically, show the assembly logic and all parts.
2. **Context injection**: What gets passed to the API beyond the system prompt?
   Goals? Tasks? Observations? Session history? Show exactly what variables
   are injected and where they come from.
3. **Message history**: How many messages of history are kept in context?
   Where is message history stored between requests? React state? Redis? DB?
   Show the exact storage/retrieval code.
4. **Model and parameters**: Which model? max_tokens? temperature? streaming?
5. **The complete chat API route**: Document the full request/response flow.
   What comes in, what gets checked, what gets built, what goes to Anthropic,
   what comes back, what side effects are triggered.
6. **Push message**: What is the exact prompt? When does it fire?
   What context does it receive? What does it return to the frontend?
7. **Session end logic**: Is there a SESSION_COMPLETE signal? Where is it triggered?
   What happens when it fires? (write to DB, generate task, etc.)
8. **Token usage**: Is there any token counting or limit enforcement?

---

## PHASE 6 — VOICE PIPELINE

This section is critical. Read every file related to voice.

First, find all voice-related files:
```bash
grep -rl "elevenlabs\|ElevenLabs\|voice\|Voice\|tts\|TTS\|speech\|Speech\|microphone\|getUserMedia\|AudioContext\|SpeechRecognition" \
  ~/Documents/reid-app/src --include="*.ts" --include="*.tsx" | sort
```

Read every file found. Document:

1. **ElevenLabs integration**:
   - Which API endpoint is called? (text-to-speech, streaming, or flash?)
   - Voice ID used (confirm gXoaQmnIbECYarWwg7B2)
   - Model used (eleven_turbo_v2_5, eleven_multilingual_v2, etc.)
   - Streaming or buffered response?
   - How is the audio returned to the frontend? (blob URL, base64, stream?)
   - Is there a `/api/voice` route? What does it do exactly?
   - Copy the exact ElevenLabs API call code

2. **Voice input (speech-to-text)**:
   - Is Web Speech API (SpeechRecognition) used?
   - Is Whisper used?
   - Where is the transcription handled — client or server?
   - Copy the exact speech recognition code

3. **Current voice UI**:
   - Which component renders the mic/voice button?
   - What happens visually when voice is active? (waveform bars? circle? anything?)
   - What state variables control voice mode?
   - Is there any existing fullscreen overlay code?
   - What CSS/animation currently plays during voice?
   - Copy the complete voice UI component

4. **Voice conversation loop**:
   - Step by step: user clicks mic → what happens → Reid speaks → what happens → loop
   - Is it turn-based or always-listening?
   - How does the frontend know Reid has finished speaking?
   - Does voice use the same /api/reid route as text, or a separate route?

5. **Pro gate**:
   - Exactly how is the Pro check implemented for voice?
   - What renders for free users vs Pro users?

---

## PHASE 7 — REDIS / UPSTASH USAGE

Find all Redis usage:
```bash
grep -rl "upstash\|redis\|Redis\|ratelimit\|rate.limit" \
  ~/Documents/reid-app/src --include="*.ts" --include="*.tsx" | sort
```

For each file found, document:
- What keys are set/get
- Key naming patterns (e.g. `session:${userId}`)
- TTLs (expiry times)
- What data is stored (message history? rate limit counts? session state?)
- Whether the data is critical (lost = problem) or ephemeral (lost = fine)

Specifically answer:
- Are chat messages stored in Redis? If yes — what's the key, what's the TTL,
  what format (JSON array of {role, content})?
- Is session state tracked in Redis?
- Is there rate limiting via Redis?

---

## PHASE 8 — FRONTEND COMPONENTS

Read the full component tree:
```bash
find ~/Documents/reid-app/src/components -type f | sort
```

For each component in `src/components/ui/`, document:
- File name
- What it renders (1-2 sentences)
- Props interface (copy the Props/type definition)
- Any external dependencies (libraries, other components)
- Any animation logic

For major page components (`src/app/(app)/*/page.tsx`), document:
- What the page renders
- What data it fetches (server-side? client-side? SWR? useEffect?)
- What API routes it calls
- Any important state variables

Pages to document specifically:
- home/page.tsx
- chat/page.tsx (or wherever the main session UI is)
- goals/page.tsx
- tasks/page.tsx
- observations/page.tsx (or noticed)
- plan/page.tsx
- settings/page.tsx
- history/page.tsx (if it exists)
- Any onboarding pages

---

## PHASE 9 — API ROUTES MAP

Run:
```bash
find ~/Documents/reid-app/src/app/api -type f | sort
```

For every API route file, document:
- Route path
- HTTP methods handled (GET, POST, PATCH, DELETE)
- Auth check: yes/no, how
- What it does (2-3 sentences)
- Input: what body/params it expects
- Output: what it returns
- Side effects: DB writes, Redis writes, external API calls

---

## PHASE 10 — STRIPE INTEGRATION

Find Stripe files:
```bash
grep -rl "stripe\|Stripe\|subscription\|webhook\|price_" \
  ~/Documents/reid-app/src --include="*.ts" --include="*.tsx" | sort
```

Document:
1. How is Pro status checked in the app? (DB column? Stripe subscription lookup?)
2. Is there a webhooks route? What events does it handle?
3. How does a user upgrade? What Stripe Checkout flow?
4. The two price IDs — are they referenced correctly?
   monthly: price_1TXllwRMW6MMaIVXczXkPXDh
   annual: price_1TXllYRMW6MMaIVXOMmy04WB
5. What column/table tracks subscription status in the DB?

---

## PHASE 11 — KNOWN ISSUES + OBSERVATIONS

After reading everything, document:
1. **Message persistence**: Are session messages stored anywhere durable
   (DB or Redis with long TTL), or only in React state?
2. **Session continuity**: When a user closes the tab and reopens, what
   context does Reid have access to? What is lost?
3. **Any TODO comments, console.logs left in, or placeholder code**
4. **Any security concerns that survived the revamp** (don't fix — just note)
5. **Any architectural decisions that will constrain Sprint 12**
   (e.g. "voice uses blob URL approach which means X won't work")
6. **Anything unexpected or surprising** — things that differ from how
   the app was described in planning conversations

---

## OUTPUT FORMAT

Write CODEBASE_AUDIT.md with these exact section headers:

```
# REID CODEBASE AUDIT
# Generated: [date]
# Sprint 11 state: [deployed / in-progress / unknown]

## 1. DIRECTORY STRUCTURE
## 2. DEPENDENCIES
## 3. DATABASE SCHEMA
## 4. ENVIRONMENT VARIABLES
## 5. AUTH + SECURITY
## 6. AI / ANTHROPIC INTEGRATION
  ### 6a. Complete System Prompt (verbatim)
  ### 6b. Context Injection
  ### 6c. Message History Storage
  ### 6d. Chat API Flow
  ### 6e. Session End Logic
## 7. VOICE PIPELINE
  ### 7a. ElevenLabs Integration
  ### 7b. Speech-to-Text
  ### 7c. Current Voice UI (complete component)
  ### 7d. Voice Conversation Loop
## 8. REDIS USAGE
## 9. COMPONENTS
## 10. PAGE INVENTORY
## 11. API ROUTES
## 12. STRIPE
## 13. KNOWN ISSUES + OBSERVATIONS
```

Be exhaustive. This document will be pasted directly into a conversation
with the engineer writing Sprint 12. Every gap in this document is a risk
in that sprint.

When complete, print:
"AUDIT COMPLETE. File written to ~/Documents/reid-app/CODEBASE_AUDIT.md
 Word count: [N] words. Paste the contents of this file into the planning chat."
