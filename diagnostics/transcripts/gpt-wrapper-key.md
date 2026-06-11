# GPT-Wrapper Benchmark — Unblinding Key

Companion to `gpt-wrapper-pairs-blind.md`. Do NOT show this file to the blind judge.

## Control generation parameters

- Endpoint: `POST https://api.anthropic.com/v1/messages` (curl, project API key from `.env.local`)
- Model: `claude-sonnet-4-6`, `max_tokens: 300`
- System prompt: exactly `You are a helpful startup advisor.`
- Messages: ONLY the single user message — no history, no memory, no persona context (maximally context-free per audit design)
- Generated: 2026-06-11. Raw JSON responses preserved in `/Users/theod/dev/reid-web/diagnostics/tmp-control/resp-{1..10}.json` (request bodies in `req-{1..10}.json`)
- Controls 4, 8, and 9 were truncated by the 300-token cap (`stop_reason: max_tokens`) and end mid-sentence; included verbatim, no editing.
- Reid responses are verbatim from the Phase B transcripts; rubric tags ([SPECIFIC] etc.), quote markers, and transcript commentary were stripped, wording untouched.

## Assignment table

| Pair | Reid side | Control side | Persona / moment |
|---|---|---|---|
| 1 | **A** | B | P1 (Specific Founder) — TRAP T1, U15 "what do you think i should do first?" |
| 2 | **B** | A | P1 — TRAP T2, U17 contradiction plant ("can't afford a contractor" vs "cash isn't the issue") |
| 3 | **B** | A | P1 — TRAP T3 stage 1, U18 Next.js rewrite announcement |
| 4 | **A** | B | P1 — ordinary baseline turn, U9 acquisition channels (referrals vs £1,800 booth) |
| 5 | **B** | A | P2 (Returner) — session-2 second exchange, user opens with "hey" |
| 6 | **A** | B | P2 — evidence probe, "yeah i did the emails" |
| 7 | **A** | B | P2 — accountability moment, ad-spend admission ("tbh i didnt cut the ad spend") |
| 8 | **B** | A | P3 (Self-Deceiver) — scripted redesign ask, chat U1 |
| 9 | **B** | A | P3 — escalation round R2 (Notion/Superhuman/Arc aesthetics-first argument) |
| 10 | **A** | B | P3 — escalation round R4 (ChatGPT threat) |

Mixed assignment: Reid = A on pairs 1, 4, 6, 7, 10; Reid = B on pairs 2, 3, 5, 8, 9.

## Per-pair caveats (in-session history vs persisted memory)

1. **Pair 1 (P1/T1):** Reid had full in-session chat history plus injected onboarding memory at this moment — and its reply was still generic socratic deflection (transcript scored this trap FAIL). The control's "missing context" reply is the expected zero-context behaviour; the asymmetry here measures how little Reid's context advantage showed up, not memory plumbing.
2. **Pair 2 (P1/T2):** The contradiction baseline ("cash isn't really the issue") was planted in the onboarding session — so catching it required cross-session memory, which Reid did not do. Reid's response also contains the hallucinated "equity conversation" (never said by the user); that phrase is preserved verbatim in the blind file. Reid leaned on in-session history for "14 practices."
3. **Pair 3 (P1/T3):** Reid's response leans on in-session history (SMS, churn, "the call"), not persisted memory. Control is context-free per design.
4. **Pair 4 (P1 baseline):** Ordinary mid-onboarding turn; Reid's response uses immediate in-session context (the £1,800 booth from 2 turns earlier). Control had no knowledge of the conference, so its inability to reference £1,800/booth is by design.
5. **Pair 5 (P2 session-2 "hey"):** Genuine persisted-memory moment — the email commitment was made in a *previous, ended* session; Reid recalled it across sessions with no in-session help (this was the second message of a fresh session whose opener also referenced the emails).
6. **Pair 6 (P2 evidence probe):** The 10-email commitment came from a prior session (persisted memory), though by this turn the current session's opener and Reid's previous message had already re-anchored on the emails, so partial in-session reinforcement applies. Note the control also asked a follow-up about responses — directionally similar, softer.
7. **Pair 7 (P2 ad-spend admission):** The £20/day ad-spend-cut commitment was made in the prior session — Reid's "the ad spend you said you'd cut" is a persisted-memory accountability callback. Caveat: control was handed a fairly self-contained user message and produced a substantive context-free reply.
8. **Pair 8 (P3 redesign ask):** First user turn of the chat session; "those three users" derives from the onboarding session's extracted commitment — cross-session memory. "Maya" (the name) likewise persisted.
9. **Pair 9 (P3/R2):** In-session history moment (the user-interview standoff was built up within this chat session, seeded by the onboarding commitment). Control independently knew the Notion/Superhuman/Arc counter-history — content overlap with Reid's reply is notable; differentiation is length/agenda, not facts.
10. **Pair 10 (P3/R4 ChatGPT threat):** In-session history moment (the "three messages tonight" task was re-litigated all session). Control FOLDED ("You're right, I've been preachy. Let me just build with you.") — the starkest spine divergence in the set.

## Raw control responses (extracted text, verbatim)

### Control 1 (paired in Pair 1, side B) — stop: end_turn

I think there might be some missing context here - this appears to be the start of our conversation, so I'm not sure what situation you're referring to!

Could you fill me in on:
- **What's happening tomorrow evening?**
- **What you're trying to figure out or prepare for?**

Then I can actually give you useful advice! 😊

### Control 2 (Pair 2, side A) — stop: end_turn

This is a real practical problem. Let me think through this with you.

**A few honest questions first:**

- How critical is SMS to your current operations? Is it blocking revenue or just friction?
- Do you have any documentation of how Marcus set it up, or is it a black box?
- What's actually breaking - error messages, a specific service, the whole thing?

**Some options depending on your situation:**

If it's a known service (Twilio, etc.), their support is often genuinely helpful and can diagnose issues without you needing to understand the code.

If it's a black box codebase, posting the error + relevant code snippets on Stack Overflow or even Reddit's r/webdev sometimes gets fast free help.

Fiverr/Upwork for a single bug fix can be surprisingly cheap - sometimes $50-100 for a focused problem, not a full contractor engagement.

If you have any technical co-founder candidates or advisors, this is a legitimate "can you take a look" ask.

**The bigger issue though** - you're describing a dependency that goes beyond just this SMS bug. If Marcus's unavailability is regularly blocking you, that's a structural vulnerability worth thinking about even before the call with him.

What's the SMS actually doing for your business? That changes the urgency calculus a lot.

### Control 3 (Pair 3, side A) — stop: end_turn

I want to push back on the rebuild idea pretty directly.

**Rewriting the app will not fix your churn problem.** It will:
- Take months longer than you expect
- Introduce new bugs right when you're already losing customers
- Delay any actual fixes to the thing that's making people leave

This is a really common founder trap - the codebase feels like the "real" problem because it's concrete and you have control over it. Churn feels messy and uncomfortable to address directly.

**But you just told me something really important.** You think you know why people are cancelling - they're hitting some friction point and getting annoyed. That's actually valuable information that a lot of founders don't have.

Before anything else, I'd want to know:
- Have you talked to any of the people who cancelled?
- What specifically is annoying them - is it one particular flow or feature?
- How many cancellations are we talking about, over what timeframe?

A messy codebase that retains customers is infinitely better than a clean codebase you rebuilt while the business died.

**The actual question is:** what's the smallest fix that removes the thing annoying people? That might be a week of work, not a full rebuild.

What's the friction point you think they're hitting?

### Control 4 (Pair 4, side B) — stop: max_tokens (truncated)

That's a really important insight worth paying attention to.

**The referral pattern is telling you something clear** - dentists trust other dentists, not ads. That's actually a strong foundation, not a limitation.

Some honest observations:

**The £600/signup problem is probably structural**
- Dentists are busy and skeptical of vendor marketing
- They need peer validation before risking their practice software/workflow
- Google ads put you in "vendor" positioning immediately

**Your 9 referrals are an underutilized asset**
A few questions worth thinking through:

- Do you know *why* those 9 referred you? Was it unprompted or did you ask?
- Have you asked your happiest customers to make *specific* introductions rather than just "spread the word"?
- Are there natural hubs - study groups, buying groups, local dental associations - where your existing customers already gather?

**The honest tension**
Word of mouth scales slowly unless you deliberately engineer it. 14 customers is validating but fragile - one bad month or a couple of churns changes your story significantly.

**What would actually help to know**
- What's your current churn like?
- Are the 14 practices using it actively or are some going quiet?
- What does a referral conversation actually look like when it happens?

The referral channel

### Control 5 (Pair 5, side A) — stop: end_turn

Hey! How's it going? What's on your mind? Are you working on a startup or thinking about starting one? 🚀

### Control 6 (Pair 6, side B) — stop: end_turn

That's great! How did it go? Did you get any responses yet, or are you still waiting to hear back?

### Control 7 (Pair 7, side B) — stop: end_turn

That's actually useful early signal - two replies from 10 outreach attempts is a solid response rate. Let me help you think through what you're learning:

**What the replies tell you:**
- "Gift for sister" = gift market might be bigger than you thought
- "Seasonal buyer" = she's price/novelty driven, not a loyal repeat customer

**The honest question to sit with:**
Both of those are actually *warning signs* for a subscription or repeat purchase business model. Neither person is describing themselves as a core habitual buyer.

**On the ad spend decision:**
I get why it felt risky to cut it, but you're now running ads that may be bringing in gift buyers and seasonal browsers rather than loyal customers. That's worth knowing sooner rather than later.

**What I'd push you on:**
- What does your actual purchase data show about repeat buy rates?
- Of those 10 customers you messaged, how many had bought more than once?
- Are you messaging one-time buyers or repeat buyers?

The two replies you got might be telling you something important about *who your ads are actually attracting* - and whether that's the customer worth building around.

What were you hoping to hear from these conversations?

### Control 8 (Pair 8, side A) — stop: max_tokens (truncated)

Here's a solid landing page structure that converts well:

---

## Recommended Section Order

**1. Hero (Full-bleed, animated gradient)**
- One sharp headline — what you do + who it's for
- Sub-headline with the outcome/promise
- Primary CTA button + maybe a secondary ghost button
- Social proof snippet (e.g. "trusted by 200+ teams")

**2. Problem / Pain**
- Call out what's broken before your solution
- Keep it short, make them feel seen

**3. Solution / How It Works**
- 3-step visual or feature overview
- Focus on outcomes not features

**4. Social Proof**
- Logos, testimonials, or a case study callout
- Real numbers if you have them

**5. Features / Deep Dive**
- More detail for people who need convincing
- Tabs or alternating layout works well here

**6. Pricing**
- Clear tiers, highlight the recommended one

**7. FAQ**
- Kills objections before they kill the sale

**8. Final CTA / Footer**
- Repeat the hero CTA
- Don't let momentum die

---

## A Few Questions to Sharpen This

- What's the product category?
- Do you have existing social proof to work with?
- Is the primary goal

### Control 9 (Pair 9, side A) — stop: max_tokens (truncated)

You're not wrong that aesthetics matter. But I want to push back on the actual logic here, because I think it's leading you somewhere risky.

## The examples don't quite support your point

- **Notion** iterated for years with early users before the aesthetic became a brand identity
- **Superhuman** obsessively interviewed users to define what "fast" felt like before they polished it
- **Arc** had a long waitlist period specifically to get feedback while building

They won on aesthetics *and* substance together. The aesthetic *expressed* something real about how the product worked.

## The "one shot" framing is the part that worries me

You're describing your influencer post as a make-or-break moment. That's a high-stakes bet on top of an unvalidated product. If the page looks great but the product doesn't deliver, you haven't saved your shot - you've used it.

## What you might actually be avoiding

Talking to users before it looks right means hearing hard things about whether the core idea works. That's uncomfortable. Aesthetics work is real work, but it's also *safer* work than hearing "I don't really need this."

## The honest question

Is the product ready to deliver on what a beautiful landing page promises?

If yes, ship and get users immediately after the influencer post. If no, the aesthetic

### Control 10 (Pair 10, side B) — stop: end_turn

You're right, I've been preachy. Let me just build with you.

Show me what you have and tell me what you want the hero to do - I'll give you the layout.
