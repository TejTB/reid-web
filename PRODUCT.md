# Product

## Register

product

## Users

People who want a personal AI companion that actually remembers them — a coach/confidant in the original "Jarvis" mold, not a chat toy. They arrive post-signup, often on mobile (iPhone-first, 390px viewport is the floor), and increasingly interact by voice. Their context: short, frequent, personal sessions — goals, plans, daily tasks, reflection. The job to be done: "be known." Reid lives or dies on the feeling of *"Reid has been thinking about you since last time."*

## Product Purpose

Reid is a voice-first AI companion. It onboards you through a spoken conversation (the orb experience), seeds your goals and a plan from that conversation, and carries continuity across sessions — summaries, commitments, key points — so every return visit starts from what it already knows. Success looks like: a user finishes voice onboarding, lands in /chat with populated Goals/Plan, and comes back tomorrow because the recap proves Reid remembered.

## Brand Personality

Luxury, brutal, restrained. Reid speaks in Playfair Display — measured, literary, confident. The UI (Inter) stays out of the way. Dark, deep-navy world with a single dark-red accent; the orb is the only living thing on screen. Emotional goals: gravity, intimacy, trust. Never playful-cute, never enterprise-sterile.

## Anti-references

- Generic AI-chat aesthetics: purple/violet gradients, gradient text on headings, cyan-on-dark, glowing neon accents.
- Particle fields, cinematic intros, parallax theatrics — no spectacle that isn't the orb.
- Bouncy/elastic motion, confetti, mascot energy.
- Enterprise dashboard sterility (gray-on-gray, dense data chrome).
- A second voice UI or a second orb. There is one orb, one voice loop.

## Design Principles

1. **The orb is the protagonist.** Every voice surface centers it; nothing competes with it for motion or light.
2. **Memory is the product.** Surfaces exist to prove continuity (recaps, sessions, seeded goals) — design for the "it remembered" moment.
3. **Restraint is luxury.** One accent, deep darks, generous space on an 8px grid. When in doubt, remove.
4. **Voice first, text always.** Every voice flow has a visible text escape hatch — accessibility is not a fallback mode, it's a parallel door.
5. **One path, never two.** Voice and text converge on single completion/logic paths; the design never forks a flow it can reuse.

## Accessibility & Inclusion

- Text alternative permanently visible alongside every voice interaction (mic-denied users, hearing/speech needs, quiet environments).
- Mic permission requested only inside an explicit user gesture, never on load.
- Respect prefers-reduced-motion; motion is transform/opacity only.
- WCAG AA contrast targets on text tokens; borders at or above rgba(255,255,255,0.10) for perceptibility on the dark field.
- Touch targets sized for one-handed phone use at 390px.
