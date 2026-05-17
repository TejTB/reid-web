"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { FREE_SESSIONS, signOut } from "@/lib/session";

// Cap shown for free-tier session count, matched to FREE_SESSIONS so the
// number can never visually exceed the quota.
function clampFreeUsage(used: number): number {
  if (used <= 0) return 0;
  if (used >= FREE_SESSIONS) return FREE_SESSIONS;
  return used;
}

// "May 14, 2026" — used for "Member since". Locale-stable: the app is shipped
// in English and we don't want Intl drift between locales.
const JOIN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatJoinDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${JOIN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function openPaywall(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("reid:open-paywall"));
}

export default function SettingsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [portalPending, setPortalPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!me) router.replace("/login");
  }, [authLoading, me, router]);

  const onManageBilling = useCallback(async () => {
    if (portalPending) return;
    setPortalPending(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setBillingError(
          body.error === "no_customer"
            ? "No billing account yet."
            : "Couldn't open the billing portal. Try again.",
        );
        setPortalPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setBillingError("Couldn't open the billing portal. Try again.");
      setPortalPending(false);
    }
  }, [portalPending]);

  const onSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    router.replace("/");
    router.refresh();
  }, [router, signingOut]);

  if (authLoading || !me) {
    return (
      <div
        className="mx-auto w-full max-w-[560px] px-6"
        style={{ paddingTop: 56, paddingBottom: 40 }}
      >
        <div className="flex flex-col gap-6">
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 120 }}
          />
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 140, animationDelay: "100ms" }}
          />
        </div>
      </div>
    );
  }

  const isPro = me.subscription_status === "pro";
  const usedSessions = clampFreeUsage(me.session_count ?? 0);
  const joinDate = formatJoinDate(me.created_at);

  return (
    <div
      className="mx-auto w-full max-w-[560px] px-6"
      style={{ paddingTop: 56, paddingBottom: 96 }}
    >
      <header style={{ marginBottom: 40 }}>
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          Settings
        </h1>
        <p
          className="font-sans"
          style={{ color: "#7A90A8", fontSize: 15, marginTop: 8 }}
        >
          Account, plan, session.
        </p>
      </header>

      <div className="flex flex-col" style={{ gap: 20 }}>
        <SettingsCard label="Account">
          <Row label="Email" value={me.email ?? "—"} />
          {joinDate && <Row label="Member since" value={joinDate} />}
        </SettingsCard>

        <SettingsCard label="Plan">
          <div className="flex items-start justify-between" style={{ gap: 16 }}>
            <div className="min-w-0">
              <p
                className="font-serif text-text-primary"
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: "-0.015em",
                }}
              >
                {isPro ? "Reid Pro" : "Free"}
              </p>
              <p
                className="font-sans"
                style={{
                  fontSize: 13,
                  color: "#7A90A8",
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {isPro
                  ? "Unlimited sessions."
                  : `${usedSessions} of ${FREE_SESSIONS} sessions used.`}
              </p>
            </div>
            {isPro ? (
              <button
                type="button"
                onClick={onManageBilling}
                disabled={portalPending}
                className="font-sans cta-shadow shrink-0"
                style={{
                  fontSize: 13,
                  color: "#F2EDE3",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 8,
                  padding: "9px 16px",
                  cursor: portalPending ? "default" : "pointer",
                  opacity: portalPending ? 0.6 : 1,
                  transition: "border-color 150ms ease, background 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (portalPending) return;
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
                }}
                onMouseLeave={(e) => {
                  if (portalPending) return;
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
                }}
              >
                {portalPending ? "Opening…" : "Manage billing →"}
              </button>
            ) : (
              <button
                type="button"
                onClick={openPaywall}
                className="font-sans cta-shadow shrink-0"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  color: "#F2EDE3",
                  background: "#B91C1C",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 18px",
                  cursor: "pointer",
                  transition: "background 150ms ease, transform 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#991818";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#B91C1C";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Upgrade to Pro
              </button>
            )}
          </div>
          {billingError && (
            <p
              className="font-sans"
              style={{
                fontSize: 12,
                color: "#F87171",
                marginTop: 14,
              }}
              role="alert"
            >
              {billingError}
            </p>
          )}
        </SettingsCard>

        <div className="flex justify-center" style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="font-sans"
            style={{
              fontSize: 13,
              color: "rgba(242,237,227,0.45)",
              background: "transparent",
              border: "none",
              padding: "10px 14px",
              cursor: signingOut ? "default" : "pointer",
              opacity: signingOut ? 0.5 : 1,
              transition: "color 150ms ease",
            }}
            onMouseEnter={(e) => {
              if (signingOut) return;
              e.currentTarget.style.color = "#F2EDE3";
            }}
            onMouseLeave={(e) => {
              if (signingOut) return;
              e.currentTarget.style.color = "rgba(242,237,227,0.45)";
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "#0F1E35",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "20px 22px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      <p
        className="font-sans"
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(242,237,227,0.45)",
          marginBottom: 14,
        }}
      >
        {label}
      </p>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{
        gap: 16,
        paddingTop: 10,
        paddingBottom: 10,
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span
        className="font-sans"
        style={{ fontSize: 13, color: "#7A90A8" }}
      >
        {label}
      </span>
      <span
        className="font-sans text-text-primary truncate"
        style={{ fontSize: 14, maxWidth: "65%" }}
      >
        {value}
      </span>
    </div>
  );
}
