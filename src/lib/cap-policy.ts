// Pure cap-exemption policy — decides who is exempt from the message caps
// (/api/reid: daily + per-minute) and the voice burst cap (/api/transcribe).
// Dependency-free on purpose so the decision is unit-testable without Redis or
// Supabase. The exemptions here are abuse-prevention, NOT authorization — the
// session wall is always the server 402 via getEntitlement.

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
