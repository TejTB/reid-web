// Server-side Web Push module.
//
// Wires the `web-push` library with our VAPID identity at module load, then
// exposes `sendPushToUser` for the cron pipeline.
//
// The caller passes a SupabaseClient (typically the service-role admin
// client) so RLS doesn't block the cron from reading every user's
// subscriptions.
//
// Cleanup contract: when the push service responds with HTTP 410 (Gone), the
// subscription has been revoked. We delete the row so we don't try the dead
// endpoint again. Other errors are swallowed and the next subscription is
// attempted — the cron loop must not die on one bad endpoint.

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL;

// Guard the setVapidDetails call: if any of the three env vars is missing we
// want the module to still load (so the build doesn't crash) but `vapidConfigured`
// will report false and `sendPushToUser` will be a no-op.
let configured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE && VAPID_EMAIL) {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  } catch (err) {
    console.error("[push] setVapidDetails failed:", err);
  }
}

export function vapidConfigured(): boolean {
  return configured;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Sends a push payload to every subscription registered for the user.
 *  Returns the count of successful deliveries. Never throws. */
export async function sendPushToUser(
  db: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!userId) return 0;
  if (!configured) return 0;

  const { data, error } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return 0;

  const subs = data as PushSubscriptionRow[];
  const payloadStr = JSON.stringify(payload);

  const settled = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payloadStr,
      ),
    ),
  );

  let success = 0;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      success += 1;
      continue;
    }
    const reason = outcome.reason as { statusCode?: number } | undefined;
    if (reason && reason.statusCode === 410) {
      try {
        await db
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", subs[i].endpoint);
      } catch {
        // ignore — transient; the next run will retry the delete.
      }
    } else {
      console.error("[push] send failed:", reason);
    }
  }
  return success;
}
