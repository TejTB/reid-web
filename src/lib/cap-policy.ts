// Pure request-gating policy — the rate-cap exemptions (/api/reid message caps
// and /api/transcribe voice cap) and the /api/tts voice entitlement wall.
// Dependency-free on purpose so each decision is unit-testable without Redis or
// Supabase. The cap exemptions are abuse-prevention, NOT authorization — the
// session/voice wall is always the server 402 via getEntitlement.

/** Whether the /api/reid daily + per-minute message caps apply to this request.
 *
 *  - Pro is always exempt.
 *  - Onboarding is exempt ONLY when the server flag and the request mode AGREE:
 *    `onboarding_complete === false` AND `mode === "onboarding"`. The AND is
 *    load-bearing in both directions:
 *      · onboarding_complete === true  → a completed user faking mode:"onboarding"
 *        is still capped (no spoof).
 *      · mode === "chat"               → an abandoned-onboarding user
 *        (onboarding_complete:false) hitting the chat API is still capped (no
 *        uncapped chat hole).
 */
export function messageCapsApply(opts: {
  isPro: boolean;
  onboardingComplete: boolean;
  mode: "onboarding" | "chat";
}): boolean {
  if (opts.isPro) return false;
  const onboardingExempt =
    opts.onboardingComplete === false && opts.mode === "onboarding";
  return !onboardingExempt;
}

/** Whether the /api/transcribe voice burst cap applies to this request.
 *
 *  - Pro is exempt.
 *  - An onboarding session is exempt.
 *  `sessionMode` is read from the real sessions row under RLS; it is null when
 *  the sessionId was missing, unparseable, or not owned by the caller — which
 *  MUST cap (never bypass).
 */
export function voiceCapApplies(opts: {
  isPro: boolean;
  sessionMode: string | null;
}): boolean {
  if (opts.isPro) return false;
  return opts.sessionMode !== "onboarding";
}

/** The /api/tts voice entitlement wall. A `preview` taste is ALWAYS served (its
 *  cost is absorbed by cache), so an exhausted free user still hears the nudge;
 *  otherwise an unentitled caller is walled with 402 — the SAME status as the
 *  /api/reid session wall, so the client paywall fires identically (the client
 *  branches on status, not the body string). Returns the status to send, or
 *  null to proceed to synthesis. */
export function ttsWallStatus(opts: {
  preview: boolean;
  entitled: boolean;
}): 402 | null {
  if (!opts.preview && !opts.entitled) return 402;
  return null;
}
