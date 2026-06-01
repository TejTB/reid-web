"use client";

import { useEffect, useState } from "react";

// Shown when /api/reid returns a per-minute burst 429 (RateLimitError). There
// is deliberately NO auto-retry: the user taps Retry, and the button only
// enables once the server's Retry-After countdown reaches 0 — so no code path
// can automatically re-enter the rate-limit window. Fixed bottom banner styled
// to match the existing free-session banner; both chat and onboarding mount it.
interface RateLimitNoticeProps {
  /** Seconds the server asked us to wait (Retry-After). */
  retryAfter: number;
  /** Invoked when the user taps Retry after the countdown elapses. */
  onRetry: () => void;
  /** Dismiss the notice without retrying. */
  onDismiss: () => void;
}

export default function RateLimitNotice({
  retryAfter,
  onRetry,
  onDismiss,
}: RateLimitNoticeProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil(retryAfter)),
  );

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const ready = remaining <= 0;

  return (
    <div
      className="fixed left-0 right-0 z-50 bottom-[calc(64px+env(safe-area-inset-bottom)+96px)] md:bottom-[96px] pointer-events-none"
      aria-live="polite"
    >
      <div
        className="mx-auto flex max-w-[720px] items-center justify-between gap-3 px-5 py-2 pointer-events-auto"
        style={{
          background: "rgba(185,28,28,0.10)",
          borderTop: "1px solid rgba(185,28,28,0.25)",
          borderBottom: "1px solid rgba(185,28,28,0.25)",
          color: "#B91C1C",
          fontSize: 12,
          letterSpacing: "0.02em",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <span className="font-sans">
          {ready ? "Going a bit fast — ready when you are." : `Going a bit fast — ${remaining}s`}
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onRetry}
            disabled={!ready}
            className="font-sans"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: ready ? "#F2EDE3" : "rgba(242,237,232,0.35)",
              cursor: ready ? "pointer" : "default",
            }}
          >
            {ready ? "Retry" : `Retry (${remaining}s)`}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="font-sans"
            style={{ fontSize: 12, color: "rgba(242,237,232,0.5)", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
