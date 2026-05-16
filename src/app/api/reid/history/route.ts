// GET /api/reid/history?limit=3
//
// Returns the signed-in user's most recent N sessions (default 3) with their
// messages, in chronological order (oldest session first, oldest message
// first within each session). userId is resolved from the auth cookie — no
// query param.

import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getRecentSessionsWithMessages } from "@/lib/session-server";

export async function GET(req: NextRequest) {
  const db = await createServerSupabase();
  const {
    data: { user: authUser },
  } = await db.auth.getUser();
  if (!authUser) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: meRow } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  const url = req.nextUrl;
  const rawLimit = url.searchParams.get("limit");
  let limit = 3;
  if (rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 20) {
      limit = parsed;
    }
  }

  const sessions = await getRecentSessionsWithMessages(db, userId, limit);
  return Response.json(
    { sessions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
