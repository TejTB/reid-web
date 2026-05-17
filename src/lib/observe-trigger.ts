// Client-side trigger for /api/observe.
//
// Sprint 7 Agent 3 — observation generation runs lazily. When the user lands
// on /observations we look up their most recently ended session and ask the
// server to write 1–2 observations for it if none exist yet. This keeps
// session-end work off the streaming hot path in /api/reid and makes the
// trigger trivial to wire from any other entry point later (e.g. an
// on-blur handler on /chat, or a navigation hook).

/** Fires /api/observe for a single session. Returns true if the request
 *  resolved without a transport error. The route itself is idempotent — it
 *  short-circuits when observations already exist for the session — so this
 *  is safe to call on every page mount. */
export async function triggerObserve(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const res = await fetch("/api/observe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
