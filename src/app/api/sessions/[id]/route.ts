import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";

// Sprint 13 Build 2 — one session's read-only summary view. NOT a chat
// resume: no message fetch lives here on purpose. A foreign, unknown, or
// never-summarised session id is uniformly 404 — this surface only serves
// what Reid wrote down, and existence of other users' sessions must not
// be probeable.

const IdSchema = z.string().uuid();

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: meRow } = await authed.supabase
    .from("users")
    .select("id")
    .eq("auth_id", authed.user.id)
    .maybeSingle();
  if (!meRow?.id) {
    return NextResponse.json({ error: "user_not_provisioned" }, { status: 401 });
  }

  const { data: session } = await authed.supabase
    .from("sessions")
    .select(
      "id, user_id, title, summary, started_at, ended_at, key_points, commitments, reid_note",
    )
    .eq("id", parsed.data)
    .maybeSingle();

  if (
    !session ||
    session.user_id !== (meRow.id as string) ||
    session.summary === null
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Explicit field allowlist — user_id is an internal scoping detail and
  // must not echo to the client.
  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title,
      summary: session.summary,
      started_at: session.started_at,
      ended_at: session.ended_at,
      key_points: session.key_points,
      commitments: session.commitments,
      reid_note: session.reid_note,
    },
  });
}
