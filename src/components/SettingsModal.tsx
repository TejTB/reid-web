"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession } from "@/lib/session";

// Mounted once globally (inside AppShell). Listens for the `reid:open-settings`
// CustomEvent dispatched by the sidebar gear button and renders a centered
// glass modal. Closes on Escape, overlay click, or Cancel. "Start over" clears
// reid:userId, reid:onboarded, and every reid:task:* flag, then hard-redirects
// to /onboarding.
export default function SettingsModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Drives the entrance opacity/translateY transition. We mount when `open`
  // flips true, then flip `visible` next frame so the transition runs.
  const [visible, setVisible] = useState(false);

  const close = useCallback(() => {
    setVisible(false);
    // Wait for the exit transition before unmounting.
    window.setTimeout(() => setOpen(false), 200);
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

  function startOver() {
    clearSession();
    // Wipe every per-task done flag — leftover flags from the previous
    // session would otherwise resurrect (in /tasks UI) the next time the
    // user reaches a task with the same id.
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("reid:task:")) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      // ignore — onboarding redirect still proceeds
    }
    router.replace("/onboarding");
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
          Session settings
        </h2>
        <p
          className="font-sans"
          style={{
            fontSize: 14,
            color: "#7A90A8",
            marginBottom: 28,
            lineHeight: 1.6,
          }}
        >
          Your conversations are saved to your account. Resetting clears your
          local session only — your data stays in Supabase.
        </p>
        <div className="flex" style={{ gap: 12 }}>
          <button
            type="button"
            onClick={close}
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
            Cancel
          </button>
          <button
            type="button"
            onClick={startOver}
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
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
