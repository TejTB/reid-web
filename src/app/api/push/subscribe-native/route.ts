import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const Body = z.object({
  expoPushToken: z.string().min(10).max(2000),
  platform: z.enum(["ios", "android"]).optional(),
});

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
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { expoPushToken } = parsed.data;

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
