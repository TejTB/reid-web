"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import GlassCard from "@/components/GlassCard";
import {
  PLAN_ANNUAL,
  PLAN_MONTHLY,
  type PlanInterval,
} from "@/lib/stripe-public";

function PricingInner() {
  const router = useRouter();
  const search = useSearchParams();
  const status = search.get("status");
  const { me, loading, refresh } = useAuth();

  const [pendingInterval, setPendingInterval] =
    useState<PlanInterval | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // The success / cancelled banner copy is derived from the `status` search
  // param up front via the useState initializer, so React 19's
  // set-state-in-effect rule doesn't flag a sync setState. The polling
  // effect below can still update it once the webhook is slow.
  const [bannerCopy, setBannerCopy] = useState<string | null>(() => {
    if (status === "success") return "Subscription confirmed. Welcome to Pro.";
    if (status === "cancelled") return "Checkout cancelled. No charge.";
    return null;
  });

  const isPro = me?.subscription_status === "pro";
  const isPastDue = me?.subscription_status === "past_due";

  // Stripe redirects back to /pricing?status=success&session_id=... after
  // checkout. The webhook updates public.users asynchronously, so we poll
  // for the row to flip to `pro`. Falls back to a "still processing" copy
  // after ~10s.
  useEffect(() => {
    if (status !== "success") return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      await refresh();
      if (cancelled) return;
      if (tries >= 6) {
        setBannerCopy(
          "Payment received. We're updating your account — refresh in a moment.",
        );
        return;
      }
      window.setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [status, refresh]);

  const startCheckout = useCallback(
    async (interval: PlanInterval) => {
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
          if (body.error === "already_subscribed") {
            setErrorMsg("You're already on Pro.");
            void refresh();
          } else {
            setErrorMsg("Couldn't start checkout. Try again.");
          }
          setPendingInterval(null);
          return;
        }
        window.location.assign(body.url);
      } catch {
        setErrorMsg("Couldn't start checkout. Try again.");
        setPendingInterval(null);
      }
    },
    [pendingInterval, refresh],
  );

  const openPortal = useCallback(async () => {
    if (portalPending) return;
    setPortalPending(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setErrorMsg("Couldn't open the billing portal. Try again.");
        setPortalPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setErrorMsg("Couldn't open the billing portal. Try again.");
      setPortalPending(false);
    }
  }, [portalPending]);

  useEffect(() => {
    if (!loading && !me) {
      router.replace("/login?next=/pricing");
    }
  }, [loading, me, router]);

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 640, padding: "48px 24px 96px" }}
    >
      <h1
        className="font-serif text-text-primary text-center"
        style={{
          fontSize: 34,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          marginBottom: 12,
        }}
      >
        Reid Pro
      </h1>
      <p
        className="font-sans text-center"
        style={{
          fontSize: 14,
          color: "#7A90A8",
          lineHeight: 1.6,
          marginBottom: 32,
        }}
      >
        Unlimited sessions. Cancel anytime.
      </p>

      {bannerCopy && (
        <GlassCard className="mb-6" style={{ padding: "14px 18px" }}>
          <p
            className="font-sans"
            style={{ fontSize: 14, color: "#C8D5E3", lineHeight: 1.5 }}
          >
            {bannerCopy}
          </p>
        </GlassCard>
      )}

      {isPastDue && (
        <GlassCard
          className="mb-6"
          style={{
            padding: "14px 18px",
            borderColor: "rgba(248,113,113,0.3)",
          }}
        >
          <p
            className="font-sans"
            style={{ fontSize: 14, color: "#F87171", lineHeight: 1.5 }}
          >
            Your last payment didn&apos;t go through. Update your card to
            keep Pro active.
          </p>
        </GlassCard>
      )}

      {isPro ? (
        <GlassCard style={{ padding: 28 }}>
          <h2
            className="font-serif text-text-primary"
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              marginBottom: 6,
            }}
          >
            You&apos;re on Pro.
          </h2>
          <p
            className="font-sans"
            style={{
              fontSize: 14,
              color: "#7A90A8",
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            Manage your subscription, swap card, or cancel from the Stripe
            billing portal.
          </p>
          <button
            type="button"
            onClick={openPortal}
            disabled={portalPending}
            className="cta-shadow font-sans text-text-primary"
            style={{
              height: 46,
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.04em",
              background: "#B91C1C",
              border: "none",
              cursor: portalPending ? "default" : "pointer",
              opacity: portalPending ? 0.6 : 1,
              padding: "0 24px",
            }}
          >
            {portalPending ? "Opening portal…" : "Manage subscription"}
          </button>
        </GlassCard>
      ) : (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <PricingCard
            plan={PLAN_MONTHLY}
            pending={pendingInterval === "monthly"}
            disabled={pendingInterval !== null}
            onSelect={() => startCheckout("monthly")}
            features={[
              "Unlimited Reid sessions",
              "Daily review notifications",
              "Cancel anytime",
            ]}
          />
          <PricingCard
            plan={PLAN_ANNUAL}
            highlight
            pending={pendingInterval === "annual"}
            disabled={pendingInterval !== null}
            onSelect={() => startCheckout("annual")}
            features={[
              "Everything in Monthly",
              "Two months free vs. monthly",
              "Lock in £229/yr",
            ]}
          />
        </div>
      )}

      {errorMsg && (
        <p
          className="font-sans"
          style={{
            fontSize: 13,
            color: "#F87171",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  );
}

interface PricingCardProps {
  plan: { interval: PlanInterval; label: string; priceLabel: string; cadence: string; caption: string };
  highlight?: boolean;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
  features: string[];
}

function PricingCard({
  plan,
  highlight,
  pending,
  disabled,
  onSelect,
  features,
}: PricingCardProps) {
  return (
    <GlassCard
      style={{
        padding: 28,
        borderColor: highlight ? "rgba(185,28,28,0.5)" : undefined,
      }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ marginBottom: 14 }}
      >
        <div className="flex items-baseline" style={{ gap: 10 }}>
          <h2
            className="font-serif text-text-primary"
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            {plan.label}
          </h2>
          <span
            className="font-sans"
            style={{ fontSize: 12, color: "#7A90A8" }}
          >
            {plan.caption}
          </span>
        </div>
        <div className="flex items-baseline" style={{ gap: 6 }}>
          <span
            className="font-serif text-text-primary"
            style={{ fontSize: 22, fontWeight: 500 }}
          >
            {plan.priceLabel}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 12, color: "#7A90A8" }}
          >
            {plan.cadence}
          </span>
        </div>
      </div>
      <ul
        className="font-sans"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          marginBottom: 20,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {features.map((f) => (
          <li
            key={f}
            className="flex items-center"
            style={{ gap: 10, fontSize: 13, color: "#C8D5E3" }}
          >
            <Check size={14} strokeWidth={2} style={{ color: "#7A90A8" }} />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="cta-shadow font-sans text-text-primary"
        style={{
          width: "100%",
          height: 46,
          borderRadius: 9,
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.04em",
          background: highlight ? "#B91C1C" : "rgba(255,255,255,0.04)",
          border: highlight ? "none" : "1px solid rgba(255,255,255,0.1)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled && !pending ? 0.5 : 1,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
      >
        {pending ? "Opening checkout…" : `Subscribe → ${plan.priceLabel} ${plan.cadence}`}
      </button>
    </GlassCard>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div
            className="font-sans"
            style={{ fontSize: 13, color: "#7A90A8" }}
          >
            Loading…
          </div>
        </div>
      }
    >
      <PricingInner />
    </Suspense>
  );
}
