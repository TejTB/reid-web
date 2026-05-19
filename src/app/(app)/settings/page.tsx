"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import SettingsCard from "@/components/SettingsCard";
import { FREE_SESSIONS, signOut } from "@/lib/session";
import { supabase } from "@/lib/supabase";

function clampFreeUsage(used: number): number {
  if (used <= 0) return 0;
  if (used >= FREE_SESSIONS) return FREE_SESSIONS;
  return used;
}

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

function formatRenewDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${JOIN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function openPaywall(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("reid:open-paywall"));
}

type ResetState = "idle" | "sending" | "sent" | "error";

export default function SettingsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [portalPending, setPortalPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [resetState, setResetState] = useState<ResetState>("idle");

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
            : "Billing portal won't open. Try again.",
        );
        setPortalPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setBillingError("Billing portal won't open. Try again.");
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

  const onChangePassword = useCallback(async () => {
    if (!me?.email || resetState === "sending") return;
    setResetState("sending");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(me.email, {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/reset-password`
            : undefined,
      });
      setResetState(error ? "error" : "sent");
    } catch {
      setResetState("error");
    }
  }, [me, resetState]);

  if (authLoading || !me) {
    return (
      <div
        className="mx-auto w-full max-w-[620px] px-6"
        style={{ paddingTop: 56, paddingBottom: 40 }}
      >
        <div className="flex flex-col" style={{ gap: 20 }}>
          <div
            className="rounded-[14px] animate-skeleton"
            style={{ height: 160, background: "rgba(255,255,255,0.04)" }}
          />
          <div
            className="rounded-[14px] animate-skeleton"
            style={{
              height: 140,
              background: "rgba(255,255,255,0.04)",
              animationDelay: "100ms",
            }}
          />
        </div>
      </div>
    );
  }

  const isPro = me.subscription_status === "pro";
  const usedSessions = clampFreeUsage(me.session_count ?? 0);
  const joinDate = formatJoinDate(me.created_at);
  const renewDate = formatRenewDate(me.subscription_period_end);
  const name = me.name?.trim() || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-[620px] px-6"
      style={{ paddingTop: 56, paddingBottom: 96 }}
    >
      <header style={{ marginBottom: 40 }}>
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 40,
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

      <div className="flex flex-col" style={{ gap: 24 }}>
        <SettingsCard label="ACCOUNT">
          {name && (
            <p
              className="font-serif italic text-text-primary"
              style={{
                fontSize: 20,
                fontWeight: 400,
                letterSpacing: "-0.01em",
                marginBottom: 10,
              }}
            >
              {name}
            </p>
          )}
          <p
            className="font-sans text-text-secondary"
            style={{ fontSize: 14, lineHeight: 1.5 }}
          >
            {me.email ?? "—"}
          </p>
          {joinDate && (
            <p
              className="font-sans"
              style={{
                fontSize: 13,
                color: "#7A90A8",
                marginTop: 6,
              }}
            >
              Member since {joinDate}
            </p>
          )}
          <div
            className="flex flex-col"
            style={{
              marginTop: 18,
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <button
              type="button"
              onClick={onChangePassword}
              disabled={resetState === "sending"}
              className="font-sans"
              style={{
                fontSize: 13,
                color:
                  resetState === "sending"
                    ? "rgba(185,28,28,0.55)"
                    : "#B91C1C",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: resetState === "sending" ? "default" : "pointer",
                fontWeight: 500,
                letterSpacing: "0.01em",
                transition: "color 150ms ease",
              }}
              onMouseEnter={(e) => {
                if (resetState === "sending") return;
                e.currentTarget.style.color = "#991B1B";
              }}
              onMouseLeave={(e) => {
                if (resetState === "sending") return;
                e.currentTarget.style.color = "#B91C1C";
              }}
            >
              {resetState === "sending"
                ? "Sending…"
                : "Change password →"}
            </button>
            {resetState === "sent" && me.email && (
              <p
                className="font-sans"
                style={{ fontSize: 14, color: "#7A90A8" }}
              >
                Reset link sent to {me.email}
              </p>
            )}
            {resetState === "error" && (
              <p
                className="font-sans"
                style={{ fontSize: 14, color: "#F87171" }}
                role="alert"
              >
                Couldn&apos;t send the link. Try again.
              </p>
            )}
          </div>
        </SettingsCard>

        <SettingsCard label="PLAN">
          <div
            className="flex items-start justify-between"
            style={{ gap: 16 }}
          >
            <div className="min-w-0">
              <p
                className="font-serif text-text-primary"
                style={{
                  fontSize: 24,
                  fontWeight: 500,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.2,
                }}
              >
                {isPro ? "Reid Pro" : "Free"}
              </p>
              <p
                className="font-sans"
                style={{
                  fontSize: 14,
                  color: "#7A90A8",
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                {isPro
                  ? "Unlimited sessions."
                  : `${usedSessions} of ${FREE_SESSIONS} sessions used.`}
              </p>
              {isPro && renewDate && (
                <p
                  className="font-sans"
                  style={{
                    fontSize: 13,
                    color: "#7A90A8",
                    marginTop: 4,
                  }}
                >
                  Renews {renewDate}.
                </p>
              )}
            </div>
            {isPro ? (
              <button
                type="button"
                onClick={onManageBilling}
                disabled={portalPending}
                className="font-sans shrink-0"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.01em",
                  color: "#B91C1C",
                  background: "transparent",
                  border: "none",
                  padding: "4px 0",
                  cursor: portalPending ? "default" : "pointer",
                  opacity: portalPending ? 0.6 : 1,
                  transition: "color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (portalPending) return;
                  e.currentTarget.style.color = "#991B1B";
                }}
                onMouseLeave={(e) => {
                  if (portalPending) return;
                  e.currentTarget.style.color = "#B91C1C";
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
                  height: 48,
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  color: "#F2EDE3",
                  background: "#B91C1C",
                  border: "none",
                  borderRadius: 10,
                  padding: "0 22px",
                  cursor: "pointer",
                  transition: "background 150ms ease, transform 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#991B1B";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#B91C1C";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Upgrade to Pro →
              </button>
            )}
          </div>
          {billingError && (
            <p
              className="font-sans"
              style={{
                fontSize: 13,
                color: "#F87171",
                marginTop: 14,
              }}
              role="alert"
            >
              {billingError}
            </p>
          )}
        </SettingsCard>

        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid rgba(242,237,227,0.06)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="font-sans"
            style={{
              fontSize: 13,
              color: "#7A90A8",
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
              e.currentTarget.style.color = "#7A90A8";
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
