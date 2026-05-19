import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";
import { anthropic, REID_MODEL, REID_VOICE } from "@/lib/anthropic";

const FALLBACK = "Reid's watching. Open a session.";

function ukDay(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

export async function POST(req: Request) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { user, supabase } = authed;

  const { data: meRow } = await supabase
    .from("users")
    .select(
      "id, name, onboarding_summary, push_message, push_message_date",
    )
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!meRow?.id) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const today = ukDay(new Date());
  const cached = meRow.push_message as string | null;
  const cachedDate = meRow.push_message_date as string | null;
  if (cached && cachedDate === today) {
    return NextResponse.json({ message: cached });
  }

  // Pull the last completed session summary to give Reid recency.
  const { data: lastSession } = await supabase
    .from("sessions")
    .select("summary, ended_at")
    .eq("user_id", meRow.id)
    .not("summary", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const name = (meRow.name as string | null)?.trim() || "this founder";
  const onboardingSummary =
    (meRow.onboarding_summary as string | null) ?? "Unknown.";
  const lastSessionSummary =
    (lastSession?.summary as string | null)?.trim() || "No sessions yet.";

  const prompt = `Generate a single push message for ${name} to show when they open Reid today.
Maximum 12 words. In your voice — direct, specific, no filler.
Like you've been thinking about them since the last session.
Their situation: ${onboardingSummary}
Last session: ${lastSessionSummary}

Examples of the right tone:
"Louis still hasn't seen it. That's on you, not him."
"You said this week. It's been four days."
"Zero users. The product exists. What's actually stopping you?"

Output ONLY the message. No quotes. No explanation.`;

  let message = "";
  try {
    const response = await anthropic.messages.create({
      model: REID_MODEL,
      max_tokens: 60,
      system: REID_VOICE,
      messages: [{ role: "user", content: prompt }],
    });
    for (const block of response.content) {
      if (block.type === "text") message += block.text;
    }
    message = message.trim().replace(/^["']|["']$/g, "");
  } catch (err) {
    console.error("[api/push-message] anthropic call failed:", err);
    return NextResponse.json({ message: FALLBACK });
  }

  if (!message) {
    return NextResponse.json({ message: FALLBACK });
  }

  await supabase
    .from("users")
    .update({ push_message: message, push_message_date: today })
    .eq("id", meRow.id);

  return NextResponse.json({ message });
}
