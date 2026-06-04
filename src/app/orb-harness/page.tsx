"use client";

// Sprint 12 Build 2b — RUNNABLE orb harness (dev/review only, NOT linked in nav).
//
// Renders the orb in all six FSM states for a LIVE motion review (feel + 60fps,
// not just static paint) and for screenshot capture (desktop + iPhone viewport).
// Also exposes ?state=<status> to isolate one state full-bleed for a clean shot,
// and ?cycle=1 to auto-advance through states so a screen recording captures the
// transitions. ?web=1 swaps the CSS <ReidOrb> for the WebGL <ReidWebOrb>
// (Sprint 12 voice revamp) — same prop interface, so every control still works.
// Delete-safe: nothing else imports this route.

import { useEffect, useState } from "react";
import ReidOrb from "@/components/ReidOrb";
import ReidWebOrb from "@/components/ReidWebOrb";
import type { VoiceStatus } from "@/lib/voice-loop-fsm";

const STATES: VoiceStatus[] = [
  "idle",
  "recording",
  "transcribing",
  "thinking",
  "speaking",
  "error",
];

export default function OrbHarnessPage() {
  const [cycleIdx, setCycleIdx] = useState(0);
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const single = params?.get("state") as VoiceStatus | null;
  const cycle = params?.get("cycle") === "1";
  const Orb = params?.get("web") === "1" ? ReidWebOrb : ReidOrb;

  useEffect(() => {
    if (!cycle) return;
    const id = setInterval(() => setCycleIdx((i) => (i + 1) % STATES.length), 2500);
    return () => clearInterval(id);
  }, [cycle]);

  if (single && STATES.includes(single)) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0A1628",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Orb status={single} size={280} />
      </main>
    );
  }

  if (cycle) {
    const s = STATES[cycleIdx];
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0A1628",
          display: "grid",
          placeItems: "center",
          gap: 24,
        }}
      >
        <Orb status={s} size={280} />
        <div
          style={{
            color: "#F2EDE3",
            fontFamily: "var(--font-sans), Inter, sans-serif",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontSize: 13,
            opacity: 0.6,
          }}
        >
          {s}
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0A1628", padding: "48px 24px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 32,
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        {STATES.map((s) => (
          <div
            key={s}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              padding: 24,
              borderRadius: 16,
              border: "1px solid rgba(242,237,232,0.08)",
            }}
          >
            <Orb status={s} size={200} />
            <span
              style={{
                color: "#F2EDE3",
                fontFamily: "var(--font-sans), Inter, sans-serif",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontSize: 12,
                opacity: 0.6,
              }}
            >
              {s}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
