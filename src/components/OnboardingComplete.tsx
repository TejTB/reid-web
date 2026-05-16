"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// This overlay is mounted by OnboardingClient 700ms after isCompleting flips,
// which is the moment the chat + input have finished fading out. t=0 below is
// when this overlay first mounts.
//
// Inside-overlay timeline (per Sprint 3 spec):
//   0–300ms     overlay opacity 0 → 1 (hold-on)
//   300–800ms   logo opacity 0 → 1, scale 0.8 → 1, ease-out (500ms)
//   500–1200ms  logo grows scale 0.4 → 1 visually (the "48 → 120" beat)
//   1500–3100ms two pulses via @keyframes reid-pulse, 2 iterations × 800ms
//   2600–3100ms "Reid" wordmark fades in (Playfair, 32px, #F2EDE3)
//   3100–3500ms tagline fades in (Inter, 15px, #7A90A8)
//   3500–4500ms hold
//   4500–5100ms whole overlay fades to bg (opacity 1 → 0, 600ms)
//   5100ms      router.replace('/home') — replace, not push, so the back button
//               doesn't bounce the user back into the overlay route.

type Phase =
  | "pre"
  | "overlay-in"
  | "logo-in"
  | "logo-grown"
  | "pulsing"
  | "wordmark-in"
  | "tagline-in"
  | "settled"
  | "fade-out";

export default function OnboardingComplete() {
  const router = useRouter();
  // Start at "pre" so the overlay renders with opacity 0 on first frame,
  // then transitions to 1 over the next 300ms.
  const [phase, setPhase] = useState<Phase>("pre");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // 0ms: kick the overlay into fade-in (opacity 0 → 1 over 300ms via CSS).
    timers.push(setTimeout(() => setPhase("overlay-in"), 20));
    // 300ms: logo begins fading in + scaling from 0.4 to 1.
    timers.push(setTimeout(() => setPhase("logo-in"), 300));
    // 1200ms: logo has finished growing.
    timers.push(setTimeout(() => setPhase("logo-grown"), 1200));
    // 1500ms: pulse animation starts (2 iterations × 800ms = ends at 3100ms).
    timers.push(setTimeout(() => setPhase("pulsing"), 1500));
    // 2600ms: wordmark fades in (overlaps the tail of pulsing).
    timers.push(setTimeout(() => setPhase("wordmark-in"), 2600));
    // 3100ms: tagline fades in.
    timers.push(setTimeout(() => setPhase("tagline-in"), 3100));
    // 3500ms: settled hold.
    timers.push(setTimeout(() => setPhase("settled"), 3500));
    // 4500ms: overlay starts fading to bg (600ms transition).
    timers.push(setTimeout(() => setPhase("fade-out"), 4500));
    // 5100ms: navigate. router.replace so back button doesn't return here.
    timers.push(
      setTimeout(() => {
        router.replace("/home");
      }, 5100),
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [router]);

  const overlayVisible = phase !== "pre" && phase !== "fade-out";
  const overlayOpacity = overlayVisible ? 1 : 0;

  // Logo enters at "logo-in"; once it's grown we keep it at scale(1) and let
  // the pulse @keyframes handle the glow.
  const logoEntered =
    phase === "logo-in" ||
    phase === "logo-grown" ||
    phase === "pulsing" ||
    phase === "wordmark-in" ||
    phase === "tagline-in" ||
    phase === "settled" ||
    phase === "fade-out";

  const wordmarkIn =
    phase === "wordmark-in" ||
    phase === "tagline-in" ||
    phase === "settled" ||
    phase === "fade-out";

  const taglineIn =
    phase === "tagline-in" ||
    phase === "settled" ||
    phase === "fade-out";

  const pulsing =
    phase === "pulsing" ||
    phase === "wordmark-in" ||
    phase === "tagline-in" ||
    phase === "settled";

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: "#0A1628",
        zIndex: 9999,
        opacity: overlayOpacity,
        // 300ms in, 600ms out. The same property handles both directions; the
        // out direction (fade-out phase) dominates since it's the longer beat.
        transition: "opacity 600ms ease",
      }}
    >
      {/* Logo: scale 0.4 → 1 (visually 48 → 120 since the rendered size is
          120px). Opacity 0 → 1 in parallel. Pulse animation runs after grow. */}
      <div
        style={{
          opacity: logoEntered ? 1 : 0,
          transform: logoEntered ? "scale(1)" : "scale(0.4)",
          transition:
            "opacity 500ms ease-out, transform 700ms cubic-bezier(0.2, 0.7, 0.2, 1)",
          willChange: "transform, opacity",
        }}
      >
        <div className={pulsing ? "animate-reid-pulse" : ""}>
          <svg
            width={120}
            height={120}
            viewBox="0 0 30 30"
            fill="none"
            style={{
              filter:
                "drop-shadow(0 0 16px rgba(185,28,28,0.8)) drop-shadow(0 0 40px rgba(185,28,28,0.4))",
            }}
          >
            <rect width="30" height="30" rx="7" fill="#B91C1C" />
            <path
              d="M8.5 7.5H15a5 5 0 0 1 0 10H8.5V7.5Z"
              stroke="#F2EDE3"
              strokeWidth="1.7"
              fill="none"
              strokeLinejoin="round"
            />
            <line
              x1="8.5"
              y1="12.5"
              x2="17"
              y2="12.5"
              stroke="#F2EDE3"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <line
              x1="14.5"
              y1="17.5"
              x2="21.5"
              y2="23"
              stroke="#F2EDE3"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* "Reid" wordmark — Playfair 32px per spec. */}
      <p
        className="font-serif"
        style={{
          marginTop: 24,
          fontSize: 32,
          color: "#F2EDE3",
          letterSpacing: "-0.02em",
          opacity: wordmarkIn ? 1 : 0,
          transform: wordmarkIn ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 400ms ease, transform 400ms ease",
        }}
      >
        Reid
      </p>

      {/* Tagline — Inter 15px #7A90A8 per spec. */}
      <p
        className="font-sans"
        style={{
          marginTop: 12,
          fontSize: 15,
          color: "#7A90A8",
          opacity: taglineIn ? 1 : 0,
          transform: taglineIn ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 400ms ease, transform 400ms ease",
        }}
      >
        Your co-founder is ready.
      </p>
    </div>
  );
}
