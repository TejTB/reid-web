import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";

// Sprint 13 Build 2 — "what Reid knows": the session-history list for the
// desktop sidebar. Read-only; only sessions Reid actually wrote down
// (summary IS NOT NULL) qualify. Mirrors /api/session-recap's auth pattern:
// getAuthedUser → resolve public.users.id → user_id-scoped query (RLS
// "sessions self all" backstops the explicit filter).

export async function GET(req: Request) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: meRow } = await authed.supabase
    .from("users")
    .select("id")
    .eq("auth_id", authed.user.id)
    .maybeSingle();
  if (!meRow?.id) {
    return NextResponse.json({ error: "user_not_provisioned" }, { status: 401 });
  }

  const { data, error } = await authed.supabase
    .from("sessions")
    .select("id, title, summary, started_at, key_points, commitments, reid_note")
    .eq("user_id", meRow.id as string)
    .not("summary", "is", null)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }
  return NextResponse.json({ sessions: data ?? [] });
}
