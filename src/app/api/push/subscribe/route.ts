// POST /api/push/subscribe
//
// Body: { userId: string, subscription: PushSubscriptionJSON }
//
// Upserts the subscription against `push_subscriptions` (keyed on endpoint so
// resubscribing from the same browser is idempotent) and flips
// `users.push_enabled` to true. RLS on both tables is anon-permissive.

import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

interface PushSubscriptionJSON {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

interface SubscribeBody {
  userId?: string;
  subscription?: PushSubscriptionJSON;
}

export async function POST(req: NextRequest) {
  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const userId = body.userId;
  const sub = body.subscription;
  if (!userId || !sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json(
      { error: "userId and subscription (endpoint, keys.p256dh, keys.auth) required" },
      { status: 400 },
    );
  }

  const userAgent = req.headers.get("user-agent");

  const { error: subError } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent,
      },
      { onConflict: "endpoint" },
    );

  if (subError) {
    console.error("[push/subscribe] upsert failed:", subError);
    return Response.json({ error: "persist failed" }, { status: 500 });
  }

  // Flip push_enabled. Best-effort — the subscription is the source of truth
  // for delivery, push_enabled is just a UI hint.
  await supabase
    .from("users")
    .update({ push_enabled: true })
    .eq("id", userId);

  return Response.json({ ok: true });
}
