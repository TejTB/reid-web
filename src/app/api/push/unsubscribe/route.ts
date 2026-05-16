// POST /api/push/unsubscribe
//
// Body: { endpoint: string }
//
// userId is derived from the auth cookie. Deletes the subscription row for
// this user+endpoint. If no rows remain for the user after the delete, flips
// users.push_enabled = false.

import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { pushUnsubscribeSchema } from "@/lib/validation";

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

  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { endpoint } = parsed.data;

  const { data: meRow } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  const { error: delError } = await db
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (delError) {
    console.error("[push/unsubscribe] delete failed:", delError);
    return Response.json({ error: "delete failed" }, { status: 500 });
  }

  const { count } = await db
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) === 0) {
    await db.from("users").update({ push_enabled: false }).eq("id", userId);
  }

  return Response.json({ ok: true });
}
