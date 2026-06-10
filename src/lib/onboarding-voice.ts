// Sprint 13 Build 1 — pure decision logic for the voice-first onboarding shell.
//
// The shell (OnboardingClient) composes the existing voice stack (useVoiceLoop,
// ReidWebOrb, fetchAndPlay) around the existing onboarding stream. These three
// helpers are the seams where that composition makes decisions, extracted pure
// so node:test covers them without a DOM, audio, or network:
//
//   - deriveOrbStatus: who owns the orb visual — the cold open or the FSM.
//   - toReidTurnOutcome: onboarding stream result → the voice FSM's contract.
//   - shouldRedirectAfterCompletion: when the /home handoff may fire, so
//     Reid's final spoken line is never cut off mid-playback.
//
// No React, no audio APIs — keep it that way (the audio-grep gate applies).

import type { ReidTurnOutcome } from "@/lib/useVoiceLoop";
import type { VoiceStatus } from "@/lib/voice-loop-fsm";

/** Lifecycle of the cold open (Reid speaks first, before any recording):
 *  pending → the invite surface, nothing has run; streaming → the opener
 *  turn is streaming from /api/reid; speaking → the opener is playing
 *  through TTS; done → the cold open is over, the voice FSM owns the loop. */
export type ColdOpenPhase = "pending" | "streaming" | "speaking" | "done";

/** What the onboarding stream runner reports for one turn. `rateLimited` is
 *  carried separately from `ok` so the text path can show the countdown
 *  notice while the voice path degrades to a recoverable FSM error. */
export interface OnboardingStreamResult {
  ok: boolean;
  /** Final assistant text (sentinel-stripped, opener-quote-stripped). */
  text: string;
  rateLimited: boolean;
}

/** The orb visual is owned by the cold open until it's done, then by the FSM
 *  1:1 (mirroring /chat). During the opener stream the orb reads `thinking` —
 *  the same truthful-onset rule the FSM uses: `speaking` only when audio is
 *  actually playing. */
export function deriveOrbStatus(
  coldOpen: ColdOpenPhase,
  fsmStatus: VoiceStatus,
): VoiceStatus {
  switch (coldOpen) {
    case "pending":
      return "idle";
    case "streaming":
      return "thinking";
    case "speaking":
      return "speaking";
    case "done":
      return fsmStatus;
  }
}

/** Maps one onboarding turn's stream result to the voice FSM's contract.
 *  `walled` is ALWAYS false: /api/reid's 402 session gate applies only to
 *  mode:"chat" (onboarding is the founder's free hook), so the FSM must read
 *  any failure — including a 429 burst — as a recoverable error, never a
 *  paywall. */
export function toReidTurnOutcome(r: OnboardingStreamResult): ReidTurnOutcome {
  if (!r.ok) return { replyText: "", walled: false, failed: true };
  return { replyText: r.text, walled: false, failed: false };
}

/** Whether the post-completion /home redirect may fire NOW. Completion is
 *  detected mid-turn (refresh() flips me.onboarding_complete while the FSM is
 *  still thinking/speaking Reid's final line), so the redirect holds until
 *  no playback is in flight or owed: FSM out of thinking/speaking AND the
 *  cold open out of streaming/speaking. Error states redirect immediately —
 *  a TTS failure must never strand a completed founder on /onboarding. */
export function shouldRedirectAfterCompletion(opts: {
  completionPending: boolean;
  coldOpen: ColdOpenPhase;
  fsmStatus: VoiceStatus;
}): boolean {
  if (!opts.completionPending) return false;
  if (opts.coldOpen === "streaming" || opts.coldOpen === "speaking") return false;
  if (opts.fsmStatus === "thinking" || opts.fsmStatus === "speaking") return false;
  return true;
}
