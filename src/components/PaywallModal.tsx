"use client";
import { useCallback, useEffect, useState } from "react";
import { FREE_SESSIONS } from "@/lib/session";
import { PLAN_ANNUAL, PLAN_MONTHLY, type PlanInterval } from "@/lib/stripe-public";
import { GlowCard } from "@/components/ui/glow-card";

// Globally mounted modal that opens when anything dispatches the
// `reid:open-paywall` CustomEvent. The chat page fires it when /api/reid
// returns 429 daily_limit_exceeded; SettingsModal's Upgrade button fires it
// directly.
//
// Picking a plan POSTs /api/stripe/checkout and navigates to the returned
// Checkout URL. While that round-trip is in flight we lock both buttons so
// the user cannot double-spend.
export default function PaywallModal() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pendingInterval, setPendingInterval] =
    useState<PlanInterval | null>(null);
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
    function onOpen() {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="home-card"
        style={{
          width: "min(400px, calc(100vw - 32px))",
          padding: 32,
          transform: visible ? "translateY(0)" : "translateY(8px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="paywall-title"
          className="font-serif text-text-primary"
          style={{
            fontSize: 22,
            fontWeight: 500,
            marginBottom: 8,
            letterSpacing: "-0.02em",
          }}
        >
          That&apos;s your {FREE_SESSIONS} sessions. You&apos;ve had a start.
        </h2>
        <p
          className="font-serif italic"
          style={{
            fontSize: 15,
            color: "#C8D5E3",
            marginBottom: 24,
            lineHeight: 1.55,
          }}
        >
          Reid Pro removes the limit — and I remember everything.
        </p>

        <div className="flex flex-col" style={{ gap: 10 }}>
          <PaywallChoice
            plan={PLAN_MONTHLY}
            pending={pendingInterval === "monthly"}
            disabled={pendingInterval !== null}
            onSelect={() => startCheckout("monthly")}
          />
          <PaywallChoice
            plan={PLAN_ANNUAL}
            highlight
            pending={pendingInterval === "annual"}
            disabled={pendingInterval !== null}
            onSelect={() => startCheckout("annual")}
          />
        </div>

        {errorMsg && (
          <p
            className="font-sans"
            style={{
              fontSize: 13,
              color: "#F87171",
              marginTop: 14,
            }}
          >
            {errorMsg}
          </p>
        )}

        <button
          type="button"
          onClick={close}
          className="font-sans"
          style={{
            marginTop: 18,
            fontSize: 12,
            color: "#7A90A8",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

interface PaywallChoiceProps {
  plan: { interval: PlanInterval; label: string; priceLabel: string; cadence: string; caption: string };
  highlight?: boolean;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function PaywallChoice({
  plan,
  highlight,
  pending,
  disabled,
  onSelect,
}: PaywallChoiceProps) {
  return (
    <GlowCard customSize glowColor="red" className="w-full">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="cta-shadow font-sans"
        style={{
          textAlign: "left",
          padding: "16px 18px",
          borderRadius: 9,
          background: highlight ? "#B91C1C" : "rgba(255,255,255,0.04)",
          border: highlight
            ? "none"
            : "1px solid rgba(255,255,255,0.08)",
          color: "#F2EDE3",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled && !pending ? 0.5 : 1,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-baseline" style={{ gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{plan.label}</span>
            <span
              style={{
                fontSize: 12,
                color: highlight ? "rgba(255,255,255,0.7)" : "#7A90A8",
              }}
            >
              {plan.caption}
            </span>
          </div>
          <div className="flex items-baseline" style={{ gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 500 }}>
              {plan.priceLabel}
            </span>
            <span
              style={{
                fontSize: 12,
                color: highlight ? "rgba(255,255,255,0.7)" : "#7A90A8",
              }}
            >
              {plan.cadence}
            </span>
          </div>
        </div>
        {pending && (
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: highlight ? "rgba(255,255,255,0.85)" : "#C8D5E3",
            }}
          >
            Opening checkout…
          </p>
        )}
      </button>
    </GlowCard>
  );
}
