"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/session";
import { useMe } from "./AuthProvider";

// Mounted once globally (inside AppShell). Listens for the `reid:open-settings`
// CustomEvent dispatched by the sidebar gear button and renders a centered
// glass modal. Closes on Escape, overlay click, or Cancel.
//
// "Sign out" is two-tap to guard against an accidental session drop:
//   1. First tap flips the button into the confirm state and exposes Back.
//   2. Second tap calls `signOut()` — which clears the Supabase auth cookie
//      AND wipes the legacy localStorage keys (reid:userId, reid:onboarded,
//      reid:chatSessionId, reid:push:asked, and every reid:task:* flag) —
//      then redirects to /login.
//
// Closing the modal at any point resets the confirm state.
export default function SettingsModal() {
  const router = useRouter();
  const me = useMe();
  const status = me?.subscription_status ?? "free";
  const isPro = status === "pro";
  const isPastDue = status === "past_due";
  const [open, setOpen] = useState(false);
  // Drives the entrance opacity/translateY transition. We mount when `open`
  // flips true, then flip `visible` next frame so the transition runs.
  const [visible, setVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const close = useCallback(() => {
    setVisible(false);
    // Wait for the exit transition before unmounting; reset confirm state so
    // re-opening the modal starts fresh.
    window.setTimeout(() => {
      setOpen(false);
      setConfirming(false);
    }, 200);
  }, []);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("reid:open-settings", onOpen as EventListener);
    return () => {
      window.removeEventListener("reid:open-settings", onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // Flip visible on the next frame to trigger the CSS transition.
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

  async function onStartOverClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // Confirmed — drop the Supabase auth cookie + wipe legacy localStorage,
    // then send the user back to /login.
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  async function onBillingClick() {
    if (portalPending) return;
    if (!isPro) {
      // Free / cancelled / past_due (without portal access) → open paywall.
      // We close the settings modal first so they're not stacked.
      close();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("reid:open-paywall"));
      }
      return;
    }
    setPortalPending(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setBillingError("Couldn't open the billing portal. Try again.");
        setPortalPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setBillingError("Couldn't open the billing portal. Try again.");
      setPortalPending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
      onClick={(e) => {
        // Overlay click closes; clicks inside the card stopPropagation below.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="home-card"
        style={{
          width: "min(360px, calc(100vw - 32px))",
          padding: 32,
          transform: visible ? "translateY(0)" : "translateY(8px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="settings-modal-title"
          className="font-serif text-text-primary"
          style={{
            fontSize: 22,
            fontWeight: 500,
            marginBottom: 8,
            letterSpacing: "-0.02em",
          }}
        >
          {confirming ? "Sign out?" : "Session settings"}
        </h2>
        <p
          className="font-sans"
          style={{
            fontSize: 14,
            color: "#7A90A8",
            marginBottom: confirming ? 28 : 20,
            lineHeight: 1.6,
          }}
        >
          {confirming
            ? "This signs you out of this device and returns you to the sign-in screen. Your data stays in your account."
            : "Your conversations are saved to your account. Signing out only ends this session on this device."}
        </p>

        {!confirming && (
          <div
            className="flex flex-col"
            style={{
              gap: 10,
              marginBottom: 24,
              padding: "14px 16px",
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <span
                className="font-sans"
                style={{ fontSize: 13, color: "#C8D5E3" }}
              >
                {isPro
                  ? "Reid Pro — unlimited"
                  : isPastDue
                  ? "Payment failed"
                  : "Free — 20 messages a day"}
              </span>
              <button
                type="button"
                onClick={onBillingClick}
                disabled={portalPending}
                className="font-sans"
                style={{
                  fontSize: 12,
                  color: "#F2EDE3",
                  background: isPro
                    ? "transparent"
                    : "#B91C1C",
                  border: isPro
                    ? "1px solid rgba(255,255,255,0.12)"
                    : "none",
                  borderRadius: 7,
                  padding: "6px 12px",
                  cursor: portalPending ? "default" : "pointer",
                  opacity: portalPending ? 0.6 : 1,
                  transition: "background 150ms ease",
                }}
              >
                {portalPending
                  ? "Opening…"
                  : isPro
                  ? "Manage"
                  : "Upgrade to Pro"}
              </button>
            </div>
            {billingError && (
              <p
                className="font-sans"
                style={{ fontSize: 12, color: "#F87171", margin: 0 }}
              >
                {billingError}
              </p>
            )}
          </div>
        )}

        <div className="flex" style={{ gap: 12 }}>
          <button
            type="button"
            onClick={confirming ? () => setConfirming(false) : close}
            className="font-sans"
            style={{
              fontSize: 13,
              color: "#7A90A8",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 9,
              padding: "10px 20px",
              cursor: "pointer",
              transition: "border-color 150ms ease, color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            }}
          >
            {confirming ? "Back" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={onStartOverClick}
            className="cta-shadow flex-1 font-sans text-text-primary"
            style={{
              height: 46,
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.04em",
              background: "#B91C1C",
              border: "none",
              cursor: "pointer",
              transition: "all 200ms ease",
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
            {confirming ? "Yes, sign out" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
