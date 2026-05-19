import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";

const bodySchema = z.object({
  completed: z.boolean(),
});

const idSchema = z.string().uuid();

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/complete">,
) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = authed.supabase;
  const authUser = authed.user;

  const { id } = await ctx.params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { completed } = parsedBody.data;

  const { data: meRow } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  if (userId !== parsedId.data) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const completedAt = completed ? new Date().toISOString() : null;
  const { data, error } = await db
    .from("users")
    .update({ onboarding_task_completed_at: completedAt })
    .eq("id", userId)
    .select("id, onboarding_task, onboarding_task_completed_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "update failed" }, { status: 500 });
  }

  return Response.json({ ok: true, task: data });
}
