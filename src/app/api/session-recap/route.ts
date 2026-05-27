import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";
import { anthropic, REID_MODEL } from "@/lib/anthropic";
import { clampRecap, type RecapPayload } from "@/lib/recap";

const Body = z.object({
  session_id: z.string().uuid(),
});

export async function POST(req: Request) {
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
  const sessionId = parsed.data.session_id;

  // Look up the user's public.users.id from auth_id so we can scope queries.
  const { data: meRow } = await authed.supabase
    .from("users")
    .select("id")
    .eq("auth_id", authed.user.id)
    .maybeSingle();
  if (!meRow?.id) {
    return NextResponse.json({ error: "user_not_provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  // Verify the session belongs to this user, and short-circuit if a recap
  // has already been written (idempotent).
  const { data: sessionRow } = await authed.supabase
    .from("sessions")
    .select("id, user_id, title, summary, reid_note, commitments, avoiding, mood")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessionRow || sessionRow.user_id !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (sessionRow.title && sessionRow.summary && sessionRow.reid_note) {
    return NextResponse.json({
      title: sessionRow.title,
      summary: sessionRow.summary,
      reid_note: sessionRow.reid_note,
      commitments: Array.isArray(sessionRow.commitments)
        ? sessionRow.commitments
        : [],
      avoiding: sessionRow.avoiding ?? "",
      mood: sessionRow.mood ?? "",
      cached: true,
    });
  }

  // Pull the full message transcript for this session, oldest-first, so we
  // can feed Reid the conversation it just had.
  const { data: msgRows } = await authed.supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  const transcript = (msgRows ?? [])
    .map((m) => `${m.role === "user" ? "Founder" : "Reid"}: ${m.content}`)
    .join("\n\n");

  const systemPrompt =
    "You are Reid, summarising the session that just ended. " +
    "Output ONE valid JSON object and nothing else. Schema: " +
    `{ "title": "3-6 word session title", "summary": "2-3 plain sentences of what was decided", "commitments": ["short", "concrete", "task-like strings"], "reid_note": "ONE Reid voice sentence. Honest. Specific. Not corny.", "avoiding": "one short phrase naming what the founder seems to be avoiding, or empty string", "mood": "one or two words for their mood, or empty string" }. ` +
    "Title is a fragment, not a sentence — like 'Noah outreach. First external user.' " +
    "reid_note is in Reid's voice (short, direct, never starts with 'I'). " +
    "avoiding and mood may be empty strings if there is no clear signal. " +
    "Never wrap the JSON in backticks. Never include any text outside the JSON object.";

  let recap: RecapPayload;
  try {
    const completion = await anthropic.messages.create({
      model: REID_MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Session transcript:\n\n${transcript || "(empty session)"}`,
        },
      ],
    });
    const block = completion.content.find((c) => c.type === "text");
    const text = block && "text" in block ? block.text.trim() : "";
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      // Try to recover from minor wrapping (e.g. ```json ... ```).
      const stripped = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      payload = JSON.parse(stripped);
    }
    recap = clampRecap(payload);
  } catch (err) {
    console.error("[api/session-recap] generation failed:", err);
    return NextResponse.json({ error: "recap_failed" }, { status: 502 });
  }

  const update: {
    title: string | null;
    reid_note: string | null;
    commitments: string[];
    avoiding: string | null;
    mood: string | null;
    summary?: string | null;
    ended_at?: string;
  } = {
    title: recap.title || null,
    reid_note: recap.reid_note || null,
    commitments: recap.commitments,
    avoiding: recap.avoiding || null,
    mood: recap.mood || null,
  };
  if (recap.summary) update.summary = recap.summary;
  // Ensure ended_at is set even if the session-end path missed it (e.g. older
  // sessions being recapped retroactively).
  if (!sessionRow.title) {
    update.ended_at = new Date().toISOString();
  }
  await authed.supabase.from("sessions").update(update).eq("id", sessionId);

  return NextResponse.json({
    title: recap.title,
    summary: recap.summary,
    commitments: recap.commitments,
    reid_note: recap.reid_note,
    avoiding: recap.avoiding,
    mood: recap.mood,
    cached: false,
  });
}
