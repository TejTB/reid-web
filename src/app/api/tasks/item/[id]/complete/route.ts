import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";

const bodySchema = z.object({
  completed: z.boolean(),
});

const idSchema = z.string().uuid();

/** Marks a public.tasks row complete (or restores it) for the authed user.
 *  Distinct from /api/tasks/[id]/complete, which lives in the legacy world
 *  where the URL parameter is the user's id and the only target is
 *  `users.onboarding_task_completed_at`. New real tasks live in the
 *  `tasks` table; this is their toggle endpoint. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = authed.supabase;
  const authUser = authed.user;

  const { id: rawId } = await ctx.params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { completed } = parsedBody.data;

  const { data: meRow } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user_not_found" }, { status: 401 });
  }
  const userId = meRow.id as string;

  const update = completed
    ? { completed: true, completed_at: new Date().toISOString() }
    : { completed: false, completed_at: null };

  const { data, error } = await db
    .from("tasks")
    .update(update)
    .eq("id", parsedId.data)
    .eq("user_id", userId)
    .select("id, completed, completed_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "update_failed" }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, task: data });
}
