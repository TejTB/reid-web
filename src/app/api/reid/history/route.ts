// GET /api/reid/history?userId=…&limit=3
//
// Returns the user's most recent N sessions (default 3) with their messages,
// in chronological order (oldest session first, oldest message first within
// each session). The /chat client renders these inline with session dividers
// between adjacent sessions.

import type { NextRequest } from "next/server";
import { getRecentSessionsWithMessages } from "@/lib/session-server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const userId = url.searchParams.get("userId");
  const rawLimit = url.searchParams.get("limit");
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }

  let limit = 3;
  if (rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 20) {
      limit = parsed;
    }
  }

  const sessions = await getRecentSessionsWithMessages(userId, limit);
  return Response.json(
    { sessions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
