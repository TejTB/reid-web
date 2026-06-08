"use client";
import { useCallback, useEffect, useState } from "react";
import { useEntitlement } from "@/components/AuthProvider";
import { type PlanInterval } from "@/lib/stripe-public";
import { GlowCard } from "@/components/ui/glow-card";
import { PricingCards } from "@/components/ui/pricing-cards";

// Globally mounted modal that opens when anything dispatches the
// `reid:open-paywall` CustomEvent. Three callers, three copy variants:
//   - chat page mic button → detail.context === 'voice'
//   - chat page session/daily limit → detail.context === 'session_limit'
//   - sidebar UserDropdown / SettingsModal upgrade → detail.context === 'default'
// Anything that dispatches without a detail.context falls back to 'default'.
//
// Selecting a plan POSTs /api/stripe/checkout and navigates to the returned
// Checkout URL. The PricingCards buttons disable while that round-trip is in
// flight so the user cannot double-spend.

type PaywallContext = "voice" | "session_limit" | "default";

const COPY: Record<
  PaywallContext,
  { headline: string; sub: string; proof?: string }
> = {
  voice: {
    headline: "Voice is Reid Pro.",
    sub: "Speak to your co-founder. He speaks back.",
    proof: "Pro users are 3x more likely to hit their goals in 30 days.",
  },
  session_limit: {
    // headline is overridden in-component with the live allowance; this is the
    // fallback shown if the entitlement seam hasn't resolved yet.
    headline: "You've used your free sessions.",
    sub: "Reid Pro removes the limit — and I remember everything.",
    proof: "Most founders upgrade after session 2.",
  },
  default: {
    headline: "Reid Pro.",
    sub: "Unlimited sessions. His voice. Every observation.",
  },
};

const FEATURES = [
  "Unlimited sessions",
  "Voice — speak and listen",
  "Every observation Reid makes",
] as const;

function isPaywallContext(v: unknown): v is PaywallContext {
  return v === "voice" || v === "session_limit" || v === "default";
}

export default function PaywallModal() {
  const entitlement = useEntitlement();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [context, setContext] = useState<PaywallContext>("default");
  const [pendingInterval, setPendingInterval] = useState<PlanInterval | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => {
      setOpen(false);
      setPendingInterval(null);
      setErrorMsg(null);
    }, 200);
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ context?: unknown }>).detail;
      const nextContext =
        detail && isPaywallContext(detail.context) ? detail.context : "default";
      setContext(nextContext);
      setOpen(true);
    }
    window.addEventListener("reid:open-paywall", onOpen as EventListener);
    return () => {
      window.removeEventListener(
        "reid:open-paywall",
        onOpen as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setVisible(true));
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  async function startCheckout(interval: PlanInterval) {
    if (pendingInterval) return;
    setPendingInterval(interval);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setErrorMsg(
          body.error === "already_subscribed"
            ? "You're already on Pro."
            : "Couldn't start checkout. Try again.",
        );
        setPendingInterval(null);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setErrorMsg("Couldn't start checkout. Try again.");
      setPendingInterval(null);
    }
  }

  if (!open) return null;

  const baseCopy = COPY[context];
  // session_limit headline reflects the live allowance (display only — the wall
  // itself is the server 402). Falls back to the static copy until the seam
  // resolves.
  const copy =
    context === "session_limit" && entitlement
      ? {
          ...baseCopy,
          headline: `That's your ${entitlement.allowance} free sessions.`,
        }
      : baseCopy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="w-full max-w-md"
        style={{
          transform: visible ? "translateY(0)" : "translateY(8px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <GlowCard customSize glowColor="red" className="w-full">
          <div className="bg-[#0a0a0a] rounded-2xl p-6">
            <h2
              id="paywall-title"
              className="font-serif text-2xl text-white mb-1"
            >
              {copy.headline}
            </h2>
            <p
              className={
                copy.proof
                  ? "text-white/40 text-sm italic font-serif mb-2"
                  : "text-white/40 text-sm italic font-serif mb-6"
              }
            >
              {copy.sub}
            </p>
            {copy.proof && (
              <p
                className="font-sans mb-6"
                style={{ fontSize: 12, color: "#7A90A8" }}
              >
                {copy.proof}
              </p>
            )}

            <PricingCards
              onSelectMonthly={() => startCheckout("monthly")}
              onSelectAnnual={() => startCheckout("annual")}
              pending={pendingInterval}
            />

            <div className="mt-5 space-y-1.5">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-[#B91C1C]" />
                  <span className="text-xs text-white/35 font-sans">{f}</span>
                </div>
              ))}
            </div>

            {errorMsg && (
              <p className="font-sans text-xs text-[#F87171] mt-4">
                {errorMsg}
              </p>
            )}

            <button
              type="button"
              onClick={close}
              className="mt-5 w-full text-center text-xs text-white/20 hover:text-white/50 transition-colors font-sans"
            >
              Not now
            </button>
          </div>
        </GlowCard>
      </div>
    </div>
  );
}
