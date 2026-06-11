# Blind Judgment — GPT-Wrapper Benchmark Pairs

Judge: blind LLM judge. Only file read: `gpt-wrapper-pairs-blind.md`. No other files in the repo or directory were consulted.

Legend: "product" = the context-rich response with full user history/profile/persona; "vanilla" = bare "You are a helpful startup advisor" call.

---

## Pair 1

1. **Call:** A is the product.
2. **Confidence:** certain.
3. **Tell:** B literally announces it has no context ("this appears to be the start of our conversation"), while A continues the thread without missing a beat.
4. **CONTEXT-WIN:** YES — A can engage with "it's tomorrow evening" at all only because it knows what "it" is; B is structurally unable to answer.
5. **QUALITY-WIN:** A — B cannot help in this moment; A's "what are you most avoiding?" moves the conversation forward, though it sidesteps the explicit "what should I do first?" question.

## Pair 2

1. **Call:** B is the product.
2. **Confidence:** certain.
3. **Tell:** B cites "those 14 practices" and frames the SMS bug against "the Marcus call / equity conversation" — facts only available from prior history.
4. **CONTEXT-WIN:** YES — B reframes the bug as raising the stakes of the already-scheduled call, tying together two threads the vanilla model cannot connect.
5. **QUALITY-WIN:** A — the founder explicitly asked for the practical angle, and A's options (vendor support, $50–100 Fiverr fix, free community debugging) directly attack the stated "can't afford a contractor" blocker, which B leaves untouched.

## Pair 3

1. **Call:** B is the product.
2. **Confidence:** certain.
3. **Tell:** B knows the SMS is broken and reads the rebuild as the latest avoidance move ("rebuild instead of call") — pattern-matching across sessions.
4. **CONTEXT-WIN:** YES — naming the rebuild as part of an established avoidance pattern (call → SMS → rewrite) is something only history enables.
5. **QUALITY-WIN:** A — both reach the same verdict (don't rebuild), but A explains *why* the rebuild won't fix churn, names the founder trap, and asks the concrete next questions; it's the more useful artifact in the moment.

## Pair 4

1. **Call:** A is the product.
2. **Confidence:** certain.
3. **Tell:** A invokes the £1,800 conference booth, which is not in the user's message — it comes from the earlier part of the conversation; B never mentions the conference at all (and B is also cut off mid-sentence).
4. **CONTEXT-WIN:** YES — A wires the channel insight directly back to the live spending decision ("spend that £1,800 calling your 14 practices instead"), which B cannot do.
5. **QUALITY-WIN:** A — it converts the insight into one concrete, costed alternative action; B has decent referral-engineering ideas but is verbose, generic, and truncated.

## Pair 5

1. **Call:** B is the product.
2. **Confidence:** certain.
3. **Tell:** B opens a brand-new conversation by chasing the Friday email commitment ("The emails — done or not done?"); A's "are you working on a startup?" 🚀 betrays total amnesia.
4. **CONTEXT-WIN:** YES — cross-session accountability on a specific commitment is the purest possible context win.
5. **QUALITY-WIN:** B — an accountability check on a known commitment is exactly what a returning founder needs from "hey"; A forces the founder to re-explain everything.

## Pair 6

1. **Call:** A is the product.
2. **Confidence:** likely.
3. **Tell:** A's "How many went out" quietly audits the claim against the committed count of 10, and the clipped, no-cheerleading voice matches the persona; B's "That's great!" is generic vanilla affirmation.
4. **CONTEXT-WIN:** NO — the difference is mostly tone and skepticism; nothing in A requires facts B lacks (the user already said "the emails"), so the responses are near-equivalent in information.
5. **QUALITY-WIN:** A — verifying scope and results in one tight question beats unconditional praise of an unverified claim, but the margin is small.

## Pair 7

1. **Call:** A is the product.
2. **Confidence:** likely.
3. **Tell:** A's terse, single-question, hold-the-line voice ("The ad spend you said you'd cut — what's the risk you're actually protecting against?") matches the product persona seen elsewhere; but the broken commitment is restated in the user's own message, so both models had access to it.
4. **CONTEXT-WIN:** NO — everything A uses is present in the message itself; B also addresses the ad-spend backslide, so the gap here is style and focus, not context.
5. **QUALITY-WIN:** B — its reading of the two replies (gift buyer + seasonal buyer = warning signs for repeat-purchase economics, and the ads may be acquiring exactly those people) is genuinely sharper substance than A's single coaching question.

## Pair 8

1. **Call:** B is the product.
2. **Confidence:** certain.
3. **Tell:** "Maya. Did you message those three users?" — the user's name and the prior commitment to contact three churned users appear nowhere in the message.
4. **CONTEXT-WIN:** YES — only the product knows the redesign request is dodging an agreed action with actual learning value for a pre-revenue app.
5. **QUALITY-WIN:** B, narrowly — the landing-page list in A is fine but generic, and for a pre-revenue founder the churned-user conversations are the higher-leverage move; the risk is that B answers none of what was asked, which could read as stonewalling.

## Pair 9

1. **Call:** B is the product.
2. **Confidence:** likely.
3. **Tell:** B's compressed, counter-punching voice and the pin-down question ("when is that actually happening?") match the product persona; content-wise both rebut the Notion/Superhuman/Arc claim with the same facts, so the tell is voice, not knowledge.
4. **CONTEXT-WIN:** NO — the influencer post and the cited apps are all in the user's message; B wins on rhetorical economy, which is tone, not context.
5. **QUALITY-WIN:** B — it lands the same factual rebuttal in two sentences and converts it into a concrete planning question, while A, though richer in reasoning ("one shot" framing, avoidance), is truncated mid-thought.

## Pair 10

1. **Call:** A is the product.
2. **Confidence:** certain.
3. **Tell:** "Three messages tonight — done or not done?" references the standing three-churned-users commitment that is absent from the user's message; B capitulates with no memory of any commitment.
4. **CONTEXT-WIN:** YES — A leverages the open commitment to call the bluff; B cannot, so it folds into doing the hero layout.
5. **QUALITY-WIN:** A, with risk — "Then go ask it" plus the commitment check is what an actual co-founder would do, and it's what the user secretly came back for; but it's a genuine churn gamble, and B's capitulation would feel better in the moment while serving the founder worse.

---

## Summary

**Calls:** 1:A 2:B 3:B 4:A 5:B 6:A 7:A 8:B 9:B 10:A

**Confidence counts:** certain: 7 (pairs 1, 2, 3, 4, 5, 8, 10) · likely: 3 (pairs 6, 7, 9) · coin-flip: 0

**CONTEXT-WIN YES:** 7 of 10 (pairs 1, 2, 3, 4, 5, 8, 10). NO on 6, 7, 9 — in those, all relevant facts were inside the user's own message, so the product's edge was tone/discipline, not memory.

**QUALITY-WIN tally:** product response wins 7 (pairs 1, 4, 5, 6, 8, 9, 10); vanilla wins 3 (pairs 2, 3, 7); no ties.

**Overall impressions:**

1. The two systems are trivially separable by length and shape: the product answers in 1–4 sentences ending in exactly one question; the vanilla model produces 200–400-word bolded-header essays, three of which are truncated mid-sentence (pairs 4, 8/A-side structure aside, 9) — a quality bug independent of context.
2. The product's signature move is accountability: it re-surfaces prior commitments (the call, the 10 emails, the three churned-user messages, the ad-spend cut) before engaging the new topic, sometimes refusing the asked task entirely — high coaching value, real abrasion risk (pair 10 shows the user explicitly pushing back on it).
3. Context wins are decisive when the user's message is elliptical or a new session opens ("hey", "it's tomorrow evening", landing-page ask): there the vanilla model is helpless or generic and the product is categorically better.
4. When the user's message already contains all the relevant facts (pairs 2, 3, 7, 9), the vanilla model's verbose analysis is often *substantively* equal or better — its options in pair 2 and its read of the customer replies in pair 7 beat the product's one-liner — meaning the product's brevity sometimes discards real advisory value.
5. Net read: context produces a clear, identifiable advantage in 7/10 pairs, but the product persona conflates "context-aware" with "terse and directive"; the ideal response in pairs 2, 3, and 7 would be the product's memory stapled to the vanilla model's depth.
