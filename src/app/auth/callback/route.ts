import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { ensureUserRow } from "@/lib/ensure-user-row";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/home";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/error", req.url));
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/auth/error", req.url));
  }
  try {
    await ensureUserRow(data.user.id, data.user.email ?? null);
  } catch (err) {
    console.error("[auth/callback] ensureUserRow failed:", err);
  }
  return NextResponse.redirect(new URL(next, req.url));
}
