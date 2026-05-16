"use client";
import { useEffect, useState } from "react";
import LogoMark from "./LogoMark";

// First surface a brand-new founder sees after sign-in (when
// users.onboarding_complete is still false). Mirrors the /login fade-in
// choreography — logomark first, wordmark next, body + CTA last — so the
// app's identity establishes itself before Reid starts asking questions.
//
// onBegin() flips OnboardingClient from `stage: "intro"` to `stage: "chat"`
// and triggers Reid's first stream. The 200ms exit transition is owned by
// OnboardingClient, not this component.
export default function OnboardingIntro({
  onBegin,
  exiting = false,
}: {
  onBegin: () => void;
  exiting?: boolean;
}) {
  // CTA disables itself after the first click so a double-tap can't fire two
  // simultaneous streams. OnboardingClient unmounts us shortly after.
  const [pressed, setPressed] = useState(false);

  function handleBegin() {
    if (pressed) return;
    setPressed(true);
    onBegin();
  }

  // Allow Enter / Space anywhere on the screen to act as the CTA — common
  // pattern for "press any key to start" intros, and keeps keyboard users
  // out of needing to tab through.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pressed) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBegin();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressed]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{
        background: "#0A1628",
        opacity: exiting ? 0 : 1,
        transition: "opacity 300ms ease",
      }}
    >
      <div
        className="w-full flex flex-col items-center"
        style={{ maxWidth: 360 }}
      >
        <div className="onboarding-intro-mark">
          <LogoMark size={48} />
        </div>

        <h1
          className="font-serif text-text-primary text-center onboarding-intro-title"
          style={{
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            marginTop: 20,
          }}
        >
          Reid
        </h1>

        <div
          className="w-full flex flex-col items-center onboarding-intro-body"
          style={{ marginTop: 28, gap: 22 }}
        >
          <p
            className="font-serif italic text-text-primary text-center"
            style={{
              fontSize: 20,
              lineHeight: 1.5,
              maxWidth: 320,
            }}
          >
            I&apos;m Reid. I help founders cut the noise.
          </p>
          <p
            className="font-sans text-center"
            style={{
              fontSize: 14,
              color: "#7A90A8",
              lineHeight: 1.6,
              maxWidth: 320,
            }}
          >
            Ten questions. Then we get to work.
          </p>

          <button
            type="button"
            onClick={handleBegin}
            disabled={pressed}
            className="cta-shadow font-sans text-text-primary"
            style={{
              marginTop: 6,
              height: 46,
              minWidth: 180,
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.04em",
              background: "#B91C1C",
              border: "none",
              cursor: pressed ? "default" : "pointer",
              opacity: pressed ? 0.6 : 1,
              transition: "opacity 200ms ease, transform 200ms ease",
              padding: "0 24px",
            }}
          >
            Ready →
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes onboarding-intro-mark-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes onboarding-intro-title-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes onboarding-intro-body-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .onboarding-intro-mark {
          opacity: 0;
          animation: onboarding-intro-mark-in 500ms ease-out both;
        }
        .onboarding-intro-title {
          opacity: 0;
          animation: onboarding-intro-title-in 300ms ease-out 500ms both;
        }
        .onboarding-intro-body {
          opacity: 0;
          animation: onboarding-intro-body-in 400ms ease-out 800ms both;
        }
      `}</style>
    </div>
  );
}
