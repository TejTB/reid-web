import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";
import { ensureUserRow } from "@/lib/ensure-user-row";

export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const metaName =
      (authed.user.user_metadata?.name as string | undefined) ?? null;
    await ensureUserRow(authed.user.id, authed.user.email ?? null, metaName);
  } catch (err) {
    console.error("[api/auth/sync] ensureUserRow failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
