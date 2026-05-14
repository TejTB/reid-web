"use client";
import { useEffect, useState } from "react";
import LogoMark from "./LogoMark";

type Props = { onDone: () => void };

// This overlay is mounted by OnboardingClient 700ms after isCompleting flips,
// which is the moment the chat + input have finished fading out. The overlay
// therefore picks up at step 3 of the spec — 300ms empty navy hold, then the
// logo enters.
//
// Inside-overlay timeline (t=0 is overlay mount):
//   0–300ms     empty navy hold
//   300–800ms   logo fades in (opacity 0→1, 500ms)
//   300–900ms   logo scales 60px → 120px (600ms ease-out)
//   500–900ms   wordmark fades in below logo (400ms)
//   800–1100ms  tagline fades in (300ms)
//   900–2500ms  red glow pulses exactly twice (2 × 800ms via @keyframes)
//   2500–3700ms hold (1200ms)
//   3700–4300ms whole overlay fades to bg (600ms)
//   4300ms      onDone() → router.push("/home")

type Phase =
  | "hold"
  | "logo-in"
  | "wordmark-in"
  | "tagline-in"
  | "pulsing"
  | "settled"
  | "fade-out";

export default function OnboardingComplete({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("hold");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase("logo-in"), 300));
    timers.push(setTimeout(() => setPhase("wordmark-in"), 500));
    timers.push(setTimeout(() => setPhase("tagline-in"), 800));
    timers.push(setTimeout(() => setPhase("pulsing"), 900));
    timers.push(setTimeout(() => setPhase("settled"), 2500));
    timers.push(setTimeout(() => setPhase("fade-out"), 3700));
    timers.push(setTimeout(() => onDone(), 4300));
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [onDone]);

  const overlayOpacity = phase === "fade-out" ? 0 : 1;
  const logoIn = phase !== "hold";
  const wordmarkIn =
    phase === "wordmark-in" ||
    phase === "tagline-in" ||
    phase === "pulsing" ||
    phase === "settled" ||
    phase === "fade-out";
  const taglineIn =
    phase === "tagline-in" ||
    phase === "pulsing" ||
    phase === "settled" ||
    phase === "fade-out";
  const pulsing = phase === "pulsing";

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: "#0A1628",
        zIndex: 9999,
        opacity: overlayOpacity,
        transition: "opacity 600ms ease",
      }}
    >
      {/* Logo: scales 60→120 and fades 0→1 in parallel. Pulses run after. */}
      <div
        style={{
          opacity: logoIn ? 1 : 0,
          transform: logoIn ? "scale(1)" : "scale(0.5)",
          transition:
            "opacity 500ms ease, transform 600ms cubic-bezier(0.2, 0.7, 0.2, 1)",
          willChange: "transform, opacity",
        }}
      >
        <div className={pulsing ? "animate-reid-pulse" : ""}>
          <LogoMark size={120} glow />
        </div>
      </div>

      {/* "Reid" wordmark below logo. */}
      <p
        className="font-serif"
        style={{
          marginTop: 24,
          fontSize: 28,
          color: "#F2EDE3",
          letterSpacing: "-0.02em",
          opacity: wordmarkIn ? 1 : 0,
          transform: wordmarkIn ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 400ms ease, transform 400ms ease",
        }}
      >
        Reid
      </p>

      <p
        className="font-sans"
        style={{
          marginTop: 12,
          fontSize: 14,
          color: "#7A90A8",
          opacity: taglineIn ? 1 : 0,
          transform: taglineIn ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 300ms ease, transform 300ms ease",
        }}
      >
        Your co-founder is ready.
      </p>
    </div>
  );
}
