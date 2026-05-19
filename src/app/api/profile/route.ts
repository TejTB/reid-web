import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";
import { isPlausibleFirstName } from "@/lib/reid-summary";

const Body = z.object({
  name: z.string().trim().min(0).max(80),
});

export async function PATCH(req: Request) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Empty string clears the name (greeting falls back to "Good morning.").
  // A non-empty value must pass the plausible-first-name check used everywhere
  // else, so we never re-introduce the "Almost" class of bug.
  const trimmed = parsed.data.name.trim();
  if (trimmed.length === 0) {
    const { error } = await authed.supabase
      .from("users")
      .update({ name: null })
      .eq("auth_id", authed.user.id);
    if (error) {
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, name: null });
  }

  const firstToken = trimmed.split(/\s+/)[0];
  if (!isPlausibleFirstName(firstToken)) {
    return NextResponse.json(
      { error: "invalid_name", message: "That doesn't look like a name." },
      { status: 400 },
    );
  }

  const { error } = await authed.supabase
    .from("users")
    .update({ name: firstToken })
    .eq("auth_id", authed.user.id);
  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, name: firstToken });
}
