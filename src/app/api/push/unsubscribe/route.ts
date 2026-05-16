// POST /api/push/unsubscribe
//
// Body: { userId: string, endpoint: string }
//
// Deletes the subscription row for this user+endpoint. If no rows remain for
// the user after the delete, flips users.push_enabled = false. We check with
// `count: 'exact'` to avoid flipping the flag when the user still has push
// subscribed on another device.

import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

interface UnsubscribeBody {
  userId?: string;
  endpoint?: string;
}

export async function POST(req: NextRequest) {
  let body: UnsubscribeBody;
  try {
    body = (await req.json()) as UnsubscribeBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const { userId, endpoint } = body;
  if (!userId || !endpoint) {
    return Response.json(
      { error: "userId and endpoint required" },
      { status: 400 },
    );
  }

  const { error: delError } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (delError) {
    console.error("[push/unsubscribe] delete failed:", delError);
    return Response.json({ error: "delete failed" }, { status: 500 });
  }

  // If zero subscriptions remain for the user, clear the flag.
  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) === 0) {
    await supabase
      .from("users")
      .update({ push_enabled: false })
      .eq("id", userId);
  }

  return Response.json({ ok: true });
}
