import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";
import { anthropic, REID_MODEL, buildSystemPrompt } from "@/lib/anthropic";

const Body = z.object({
  type: z.enum(["observation", "goal", "task"]),
  id: z.string().uuid(),
  context: z.string().min(1).max(4000),
});

const TABLE_BY_TYPE: Record<z.infer<typeof Body>["type"], string> = {
  observation: "observations",
  goal: "goals",
  task: "tasks",
};

export async function POST(req: Request) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { user, supabase } = authed;

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
  const { type, id, context } = parsed.data;

  // Resolve the users.id (public) from the auth uid.
  const { data: meRow } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!meRow?.id) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const userId = meRow.id as string;

  const table = TABLE_BY_TYPE[type];

  // Verify ownership + check cache.
  const { data: row, error: fetchErr } = await supabase
    .from(table)
    .select("id, user_id, generated_take")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchErr || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const cached = (row.generated_take as string | null)?.trim();
  if (cached) {
    return NextResponse.json({ take: cached, cached: true });
  }

  let generated = "";
  try {
    const response = await anthropic.messages.create({
      model: REID_MODEL,
      max_tokens: 400,
      system: buildSystemPrompt(""),
      messages: [
        {
          role: "user",
          content: `Write a 150-200 word personal breakdown of the following in your voice — direct, specific, no filler, no therapy-speak. Make it feel like you've been thinking about this between sessions.\n\n${context}`,
        },
      ],
    });
    for (const block of response.content) {
      if (block.type === "text") generated += block.text;
    }
    generated = generated.trim();
  } catch (err) {
    console.error("[api/reid-take] anthropic call failed:", err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }

  if (!generated) {
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }

  // Cache for next time. Failure to cache is non-fatal — we still return the
  // generated text to the client.
  await supabase
    .from(table)
    .update({ generated_take: generated })
    .eq("id", id)
    .eq("user_id", userId);

  return NextResponse.json({ take: generated, cached: false });
}
