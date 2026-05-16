import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid json" }, { status: 400 });
  }
  const expoPushToken =
    body && typeof body === "object" && "expoPushToken" in body
      ? (body as { expoPushToken: unknown }).expoPushToken
      : null;
  if (!expoPushToken || typeof expoPushToken !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: appUser } = await admin
    .from("users")
    .select("id")
    .eq("auth_id", authed.user.id)
    .single();
  if (!appUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: appUser.id,
      endpoint: expoPushToken,
      p256dh: "expo",
      auth: "expo",
      platform: "expo",
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return NextResponse.json({ error: "persist failed" }, { status: 500 });
  }

  await admin
    .from("users")
    .update({ push_enabled: true })
    .eq("id", appUser.id);

  return NextResponse.json({ ok: true });
}
