import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";
import { anthropic, REID_MODEL } from "@/lib/anthropic";

const Body = z.object({
  session_id: z.string().uuid(),
});

type RecapPayload = {
  title: string;
  summary: string;
  commitments: string[];
  reid_note: string;
};

// Loosely validate the model's JSON output — clamp lengths so a hallucination
// can't blow up the recap overlay. The recap is always best-effort: a partial
// recap is still better than no recap.
function clampRecap(raw: unknown): RecapPayload {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const title =
    typeof obj.title === "string" ? obj.title.trim().slice(0, 60) : "";
  const summary =
    typeof obj.summary === "string" ? obj.summary.trim().slice(0, 400) : "";
  const reid_note =
    typeof obj.reid_note === "string"
      ? obj.reid_note.trim().slice(0, 200)
      : "";
  const commitments = Array.isArray(obj.commitments)
    ? obj.commitments
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().slice(0, 160))
        .filter((c) => c.length > 0)
        .slice(0, 6)
    : [];
  return { title, summary, commitments, reid_note };
}

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
    .select("id, user_id, title, summary, reid_note")
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
      commitments: [],
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
    `{ "title": "3-6 word session title", "summary": "2-3 plain sentences of what was decided", "commitments": ["short", "concrete", "task-like strings"], "reid_note": "ONE Reid voice sentence. Honest. Specific. Not corny." }. ` +
    "Title is a fragment, not a sentence — like 'Noah outreach. First external user.' " +
    "reid_note is in Reid's voice (short, direct, never starts with 'I'). " +
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

  // Persist title + reid_note + (only when generated) summary. Keep
  // sessions.summary even if Reid already wrote one via the
  // [SESSION_COMPLETE] sentinel — the recap's summary is usually richer.
  const update: {
    title: string | null;
    reid_note: string | null;
    summary?: string | null;
    ended_at?: string;
  } = {
    title: recap.title || null,
    reid_note: recap.reid_note || null,
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
    cached: false,
  });
}
