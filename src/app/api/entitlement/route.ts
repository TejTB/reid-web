import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";
import { getEntitlement } from "@/lib/entitlement";

// Sprint 12 — exposes the server-side entitlement seam to the client.
//
// This is the single source of truth on the client side: every free-session
// display surface (chat/settings/AppShell/SettingsModal/plan/PaywallModal)
// reads { sessionsUsed, allowance } from here, so what the user sees always
// equals what the /api/reid (402) gate enforces. The legacy
// users.sessions_used_this_month counter has been retired as a reader.
//
// No `sessionId` exclusion here: the client wants the at-rest "have I used my
// allowance?" answer for display, not the mid-session self-count variant the
// /api/tts gate uses.
export async function GET(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const e = await getEntitlement(authed.supabase, authed.user.id);
  return NextResponse.json(
    {
      sessionsUsed: e.sessionsUsed,
      allowance: e.allowance,
      isPro: e.isPro,
      entitled: e.entitled,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
