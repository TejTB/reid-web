// POST /api/push/subscribe
//
// Body: { subscription: PushSubscriptionJSON }
//
// userId is derived from the auth cookie. Upserts the subscription against
// `push_subscriptions` (keyed on endpoint so resubscribing from the same
// browser is idempotent) and flips `users.push_enabled` to true.

import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { pushSubscribeSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const db = await createServerSupabase();
  const {
    data: { user: authUser },
  } = await db.auth.getUser();
  if (!authUser) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = pushSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { subscription: sub } = parsed.data;

  const { data: meRow } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  const userAgent = req.headers.get("user-agent");

  const { error: subError } = await db
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

  await db
    .from("users")
    .update({ push_enabled: true })
    .eq("id", userId);

  return Response.json({ ok: true });
}
