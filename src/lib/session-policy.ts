// Pure session-lifecycle policy. IMPORTANT CONTEXT: sessions.ended_at is
// stamped on EVERY turn (recordTurnActivity, née endSession's per-turn path),
// so it is the LAST-ACTIVITY timestamp, NOT a closed flag — there is no
// updated_at column on sessions, and every existing consumer (opening-route
// days-gap included) already reads it as activity. A session is closed when
// it has been summarised (any writer), has hit its mode's hard cap, or has
// sat idle past SESSION_IDLE_TIMEOUT_MS. Server resume checks and the recap
// trigger derive closure from this single function; the keepalive summariser
// uses KEEPALIVE_MIN_IDLE_MS so a tab-switch or internal navigation never
// closes a live conversation.

export const SESSION_HARD_CAP = 20;
export const SESSION_NUDGE_AT = 16;
export const ONBOARDING_NUDGE_AT = 14;
export const ONBOARDING_FINAL_AT = 22;
export const ONBOARDING_HARD_CAP = 26;

/** An unsummarised session idle longer than this is treated as closed; the
 *  next request mints a fresh session, which triggers summarise-at-next-start
 *  on this one. */
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60_000;

/** The keepalive summarise route refuses sessions with activity younger than
 *  this — unmount fires on every internal navigation, and summarising a live
 *  conversation would close it under the derived-closure rule. */
export const KEEPALIVE_MIN_IDLE_MS = 10 * 60_000;

export function isSessionClosed(
  s: {
    mode: string;
    summary: string | null;
    message_count: number;
    /** sessions.ended_at ?? sessions.started_at (ISO). Null = no activity recorded. */
    last_activity_at: string | null;
  },
  nowMs: number,
): boolean {
  if (s.summary !== null && s.summary.trim().length > 0) return true;
  const cap = s.mode === "onboarding" ? ONBOARDING_HARD_CAP : SESSION_HARD_CAP;
  if (s.message_count >= cap) return true;
  if (s.last_activity_at !== null) {
    const last = Date.parse(s.last_activity_at);
    if (!Number.isNaN(last) && nowMs - last > SESSION_IDLE_TIMEOUT_MS) return true;
  }
  return false;
}
