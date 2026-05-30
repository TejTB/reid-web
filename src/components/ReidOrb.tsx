"use client";

import type { VoiceStatus } from "@/lib/voice-loop-fsm";
import { BorderTrail } from "@/components/ui/border-trail";

// Sprint 12 Build 2b — the voice centerpiece.
//
// Pure presentational. Driven entirely by the voice FSM's VoiceStatus
// (idle | recording | transcribing | thinking | speaking | error). All visual
// behaviour (layered glow, per-state motion, reduced-motion, the speaking
// pulse, the thinking BorderTrail accent) is keyed off `data-orb-state` in
// globals.css (.reid-orb) — this component just composes the layers and sets
// the attribute. No state, no audio, no data: the chat page (Build 2c) feeds
// it the FSM status, and `speaking` is only ever set when the audio element is
// actually playing (truthful onset, enforced in useVoiceLoop/lib/voice).
//
// `status` is the SINGLE source of truth — there is no separate `speaking`
// boolean (it would be redundant with status === "speaking").

export interface ReidOrbProps {
  status: VoiceStatus;
  /** Pixel diameter. Defaults to 240. */
  size?: number;
  className?: string;
  /** Optional accessible label override. */
  ariaLabel?: string;
}

const STATE_LABEL: Record<VoiceStatus, string> = {
  idle: "Reid is ready",
  recording: "Listening",
  transcribing: "Processing your words",
  thinking: "Reid is thinking",
  speaking: "Reid is speaking",
  error: "Voice is unavailable",
};

export default function ReidOrb({
  status,
  size = 240,
  className,
  ariaLabel,
}: ReidOrbProps) {
  return (
    <div
      className={`reid-orb${className ? ` ${className}` : ""}`}
      data-orb-state={status}
      style={{ ["--orb-size" as string]: `${size}px` }}
      role="img"
      aria-label={ariaLabel ?? STATE_LABEL[status]}
    >
      {/* Voice-first a11y: the orb IS the primary feedback, but changing an
          aria-label on role="img" is not reliably announced. A visually-hidden
          polite live region mirrors the state so screen-reader users hear each
          transition (listening → thinking → speaking). */}
      <span
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {STATE_LABEL[status]}
      </span>

      {/* Layer order: atmosphere (widest, behind) → halo → core → highlight →
          noise (front, masked). Each is a radial-gradient animated at a
          coprime duration so the composite never visibly loops. */}
      <span className="reid-orb__layer reid-orb__atmosphere" aria-hidden />
      <span className="reid-orb__layer reid-orb__halo" aria-hidden />
      <span className="reid-orb__layer reid-orb__core" aria-hidden />
      <span className="reid-orb__layer reid-orb__highlight" aria-hidden />
      <span className="reid-orb__layer reid-orb__noise" aria-hidden />

      {/* Thinking-only edge accent — reuses the brand BorderTrail. Rendered
          only in `thinking` so other states stay clean. */}
      {status === "thinking" && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: "10%",
            borderRadius: "50%",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <BorderTrail />
        </span>
      )}
    </div>
  );
}
