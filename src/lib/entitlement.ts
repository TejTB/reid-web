import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_SESSION_ALLOWANCE } from "./session-shared.ts";

// Sprint 12 — the SINGLE server-side source of truth for session entitlement.
//
// Both /api/reid (the 402 session-start wall) and /api/tts (the 403 full-voice
// gate) consume this identical check. There is no client-flag authorization
// path: a caller is entitled iff they are Pro OR within the free allowance.
//
// "Used" sessions are counted live from public.sessions — NOT a stored counter
// — so the gate can never drift from reality. The basis is:
//   - non-onboarding ("real") sessions only        (onboarding is the free hook)
//   - message_count > 0                            (a session the user actually
//                                                    spoke in; abandoned-before-
//                                                    first-turn rows don't count)
//   - lifetime, all modes (voice + chat)           (trial→Pro funnel, not monthly)
//   - Pro (subscription_status = 'pro') bypasses    (unlimited)
//
// The query runs under the caller's RLS via the request-scoped client, so it
// reads only the caller's own rows (policy "sessions self all").

export interface Entitlement {
  /** True iff the caller may start/continue a full session right now. */
  entitled: boolean;
  /** subscription_status === 'pro'. */
  isPro: boolean;
  /** Count of message-bearing, non-onboarding sessions (excluding the current
   *  one when excludeSessionId is supplied). */
  sessionsUsed: number;
  /** The free allowance the count is measured against. */
  allowance: number;
  /** The resolved public.users.id, or null if the user is not provisioned. */
  userId: string | null;
}

export interface GetEntitlementOptions {
  /** When set, the session with this id is excluded from the COUNT. This is the
   *  self-count fix for /api/tts: a free user within allowance must get full
   *  voice DURING their one allowed session, so that session must not count
   *  against itself. MUST be applied conditionally — `id <> NULL` matches no
   *  rows in SQL, which would zero the count and fail the gate OPEN. */
  excludeSessionId?: string | null;
}

export async function getEntitlement(
  db: SupabaseClient,
  authId: string,
  options: GetEntitlementOptions = {},
): Promise<Entitlement> {
  const allowance = FREE_SESSION_ALLOWANCE;

  // 1. Resolve the public.users row for this auth user.
  const { data: userRow } = await db
    .from("users")
    .select("id, subscription_status")
    .eq("auth_id", authId)
    .maybeSingle();

  if (!userRow?.id) {
    // Not provisioned — deny (and not Pro). Callers already 401 on this, but
    // returning a coherent shape keeps the util safe to call defensively.
    return {
      entitled: false,
      isPro: false,
      sessionsUsed: 0,
      allowance,
      userId: null,
    };
  }

  const userId = userRow.id as string;
  const isPro = (userRow.subscription_status as string | null) === "pro";

  if (isPro) {
    // Pro bypasses the count entirely — no need to touch sessions.
    return { entitled: true, isPro: true, sessionsUsed: 0, allowance, userId };
  }

  // 2. Count the user's "real" sessions.
  let query = db
    .from("sessions")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .neq("mode", "onboarding")
    .gt("message_count", 0);

  // CRITICAL: only exclude when we actually have a session id. `id <> NULL`
  // is unknown for every row → drops all rows → count 0 → gate fails OPEN.
  const excludeSessionId = options.excludeSessionId;
  if (excludeSessionId) {
    query = query.neq("id", excludeSessionId);
  }

  const { count } = await query;
  const sessionsUsed = count ?? 0;

  return {
    entitled: sessionsUsed < allowance,
    isPro: false,
    sessionsUsed,
    allowance,
    userId,
  };
}
