import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";
import { anthropic, REID_MODEL, REID_VOICE } from "@/lib/anthropic";

// IMPORTANT: never fall back to "Reid's watching. Open a session." or any
// onboarding-style opener for a returning user — that's the regression Sprint
// 11 closes. On any generation failure return { message: null } and let the
// home page render nothing instead of fake fillers. The literal
// "What are you building? I've been waiting." in particular is reserved for
// onboarding and must never appear as a push message.

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

function daysBetween(now: Date, then: Date | null): number | null {
  if (!then) return null;
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
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
      "id, name, onboarding_summary, onboarding_complete, session_count, sessions_used_this_month, push_message, push_message_date",
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

  // Pull the last completed session (with title preferred over summary)
  // and the most recent task and primary goal so the model has real
  // context to anchor the line.
  const [
    { data: lastSession },
    { data: latestTask },
    { data: primaryGoal },
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select("title, summary, ended_at")
      .eq("user_id", meRow.id)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("description, completed, created_at")
      .eq("user_id", meRow.id)
      .eq("completed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("title, is_primary, created_at")
      .eq("user_id", meRow.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const name = (meRow.name as string | null)?.trim() || "this founder";
  const lifetimeSessionCount = (meRow.session_count as number | null) ?? 0;
  const usedThisMonth =
    (meRow.sessions_used_this_month as number | null) ?? 0;
  const onboardingComplete = !!meRow.onboarding_complete;

  // Returning = any history of interaction. Onboarding completion is the
  // strongest signal; either monthly or lifetime session counts confirm.
  const isReturning =
    onboardingComplete || usedThisMonth > 0 || lifetimeSessionCount > 0;

  const lastSessionEndedAt = lastSession?.ended_at
    ? new Date(lastSession.ended_at as string)
    : null;
  const daysSinceLastSession = daysBetween(new Date(), lastSessionEndedAt);
  const lastSessionTitle =
    (lastSession?.title as string | null)?.trim() ||
    (lastSession?.summary as string | null)?.trim() ||
    "first session coming up";
  const latestTaskText =
    (latestTask?.description as string | null)?.trim() || "none assigned yet";
  const primaryGoalTitle =
    (primaryGoal?.title as string | null)?.trim() || "none set";

  let prompt: string;
  if (isReturning) {
    prompt = `You are Reid. You have been thinking about this founder since the last session.
You know their situation, their goals, their tasks. Write ONE sentence — spoken
directly to them — as if you've been watching and have something specific to say.
Not a question. Not a greeting. A statement that proves you've been paying attention.
Reid never starts with "I". Reid never uses generic phrases. This is the first
thing they see when they open the app. Make it land.

User context:
- Most recent task: ${latestTaskText}
- Primary goal: ${primaryGoalTitle}
- Last session: ${lastSessionTitle}
- Days since last session: ${daysSinceLastSession ?? "unknown"}

Output ONLY the sentence. No quotes. No explanation. Max 16 words.`;
  } else {
    const onboardingSummary =
      (meRow.onboarding_summary as string | null) ?? "Unknown.";
    prompt = `Generate a single push message for ${name} to show when they open Reid today.
Maximum 12 words. In your voice — direct, specific, no filler.
Like you've been thinking about them since the last session.
Their situation: ${onboardingSummary}
Last session: ${lastSessionTitle}

Examples of the right tone:
"Louis still hasn't seen it. That's on you, not him."
"You said this week. It's been four days."
"Zero users. The product exists. What's actually stopping you?"

Output ONLY the message. No quotes. No explanation.`;
  }

  let message = "";
  try {
    const response = await anthropic.messages.create({
      model: REID_MODEL,
      max_tokens: 80,
      system: REID_VOICE,
      messages: [{ role: "user", content: prompt }],
    });
    for (const block of response.content) {
      if (block.type === "text") message += block.text;
    }
    message = message.trim().replace(/^["']|["']$/g, "");
  } catch (err) {
    console.error("[api/push-message] anthropic call failed:", err);
    return NextResponse.json({ message: null });
  }

  if (!message) {
    return NextResponse.json({ message: null });
  }

  // Belt-and-braces: if the model echoes the literal onboarding opener back
  // to a returning user, refuse to ship it.
  if (
    isReturning &&
    /what\s+are\s+you\s+building/i.test(message) &&
    /been\s+waiting/i.test(message)
  ) {
    return NextResponse.json({ message: null });
  }

  await supabase
    .from("users")
    .update({ push_message: message, push_message_date: today })
    .eq("id", meRow.id);

  return NextResponse.json({ message });
}
