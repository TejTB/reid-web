"use client";

// Inline banner shown on /home for the user's first or second session, asking
// them to enable browser push notifications. Dismissal is persisted to
// localStorage under `reid:push:asked` so the banner never re-renders for the
// same browser even if the session count rolls over.
//
// Browser-permission flow:
//   1. Register `/sw.js` (the static service worker) if not registered.
//   2. Call `Notification.requestPermission()`. If the user denies, stamp the
//      "asked" flag and bow out.
//   3. Fetch the VAPID public key from `/api/push/vapid`.
//   4. `pushManager.subscribe` with that key.
//   5. POST the resulting `PushSubscriptionJSON` to `/api/push/subscribe` so
//      the server records it and flips `users.push_enabled`.
//
// We never block UI on the network. Errors are logged and swallowed; the user
// either sees the system permission dialog or doesn't.

import { useEffect, useState } from "react";

interface Props {
  userId: string;
  name: string | null;
  sessionCount: number;
}

const STORAGE_KEY = "reid:push:asked";

/** Standard VAPID Base64-URL → Uint8Array helper used by every
 *  pushManager.subscribe() recipe. The public key is delivered as URL-safe
 *  base64; PushManager needs raw bytes. We back the Uint8Array with an
 *  explicit ArrayBuffer (not ArrayBufferLike) so it satisfies the
 *  `BufferSource` constraint that `applicationServerKey` expects under
 *  strict TS 5+ lib defs. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

async function enablePush(userId: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // ignore
      }
      return;
    }
    const vapidRes = await fetch("/api/push/vapid");
    const { publicKey } = (await vapidRes.json()) as { publicKey: string | null };
    if (!publicKey) return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    });
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  } catch (err) {
    console.error("[push opt-in] failed:", err);
  }
}

export default function PushOptInBanner({ userId, sessionCount }: Props) {
  // Eligibility is decided client-side on mount. Server-render leaves the
  // banner null so it never flashes during hydration.
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionCount !== 1 && sessionCount !== 2) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch {
      // localStorage unavailable; fall through and show the banner anyway.
    }
    setEligible(true);
  }, [sessionCount]);

  if (!eligible || dismissed) return null;

  function handleEnable() {
    void enablePush(userId).finally(() => setDismissed(true));
  }

  function handleDismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div
      className="rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      style={{
        background: "#0F1E35",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: 16,
        marginTop: 16,
      }}
    >
      <p
        className="font-serif italic"
        style={{
          color: "#F2EDE3",
          fontSize: 18,
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        Reid can message you when you go dark.
      </p>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={handleEnable}
          className="font-sans"
          style={{
            background: "#B91C1C",
            color: "#F2EDE3",
            border: "none",
            borderRadius: 9,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.04em",
            cursor: "pointer",
            transition: "background 150ms ease",
          }}
        >
          Turn on notifications
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="font-sans"
          style={{
            background: "transparent",
            color: "#7A90A8",
            border: "none",
            padding: "10px 8px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
