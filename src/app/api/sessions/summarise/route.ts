// POST /api/sessions/summarise
//
// Sprint 7 Agent A — fallback session summariser.
//
// The primary path is the [SESSION_COMPLETE] sentinel: Reid writes a summary
// at the natural end of a session and `processSentinels` calls `endSession`
// with it. This route covers the other case — sessions the user abandons
// (closes the tab, navigates away) without prompting Reid to wrap. The chat
// page fires this from a keepalive POST on unmount.
//
// Idempotent: if the session already has a non-empty summary, the route
// short-circuits without calling Anthropic.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { anthropic, REID_MODEL } from "@/lib/anthropic";
import { getAuthedUser } from "@/lib/supabase-auth";
import { endSession } from "@/lib/session-server";

const summariseRequestSchema = z.object({
  sessionId: z.string().uuid(),
});

const SUMMARISE_SYSTEM_PROMPT = `You are Reid. Direct. Unimpressed by excuses.

The founder ended a session without you wrapping it. Write ONE honest sentence summarising what happened — the same voice you'd use in a [SESSION_COMPLETE] sentinel's summary attribute. No flattery, no recap of every turn, no hedging. Just the truth of what happened.

Return the sentence as plain text. No JSON, no quotes around it, no preamble.`;

export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = authed.supabase;
  const authUser = authed.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsedBody = summariseRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { sessionId } = parsedBody.data;

  const { data: meRow } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  // Confirm the session belongs to this user before any LLM work.
  const { data: sessionRow } = await db
    .from("sessions")
    .select("id, user_id, summary")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessionRow || sessionRow.user_id !== userId) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  // Idempotency: if the session already has a summary, do nothing. This
  // covers the [SESSION_COMPLETE] sentinel path AND prevents duplicate work
  // from HMR or double-fired unmount cleanups.
  const existingSummary =
    typeof sessionRow.summary === "string" ? sessionRow.summary.trim() : "";
  if (existingSummary.length > 0) {
    return Response.json({ ok: true, skipped: "already_summarised" });
  }

  // Pre-fetch the user's onboarding_summary so we can short-circuit after
  // generation if the model produced a copy of the starting point — a common
  // failure mode for abandoned early sessions where the founder didn't push
  // the conversation far enough to differ from what they said at onboarding.
  // Persisting the duplicate would clutter the Plan timeline.
  const { data: startingPointRow } = await db
    .from("users")
    .select("onboarding_summary")
    .eq("id", userId)
    .maybeSingle();
  const startingPoint =
    typeof startingPointRow?.onboarding_summary === "string"
      ? startingPointRow.onboarding_summary.trim().toLowerCase()
      : "";

  const { data: messageRows } = await db
    .from("messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const messages = (messageRows ?? []) as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  // Same threshold as /api/observe — sub-threshold sessions aren't worth the
  // model call.
  if (messages.length < 4) {
    return Response.json({ ok: true, skipped: "too_few_messages" });
  }

  const transcript = messages
    .map(
      (m) =>
        `${m.role === "assistant" ? "Reid" : "Founder"}: ${m.content.replace(/\s+/g, " ").trim()}`,
    )
    .join("\n");

  let summaryText: string;
  try {
    const response = await anthropic.messages.create({
      model: REID_MODEL,
      max_tokens: 400,
      system: SUMMARISE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Session transcript follows. Write your one-sentence summary.\n\n${transcript}`,
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "anthropic_failed" }, { status: 502 });
    }
    summaryText = textBlock.text;
  } catch {
    return Response.json({ error: "anthropic_failed" }, { status: 502 });
  }

  const summary = summaryText.trim();
  if (!summary) {
    return Response.json({ ok: true, skipped: "empty_response" });
  }

  // Drop summaries that are functionally identical to the starting point —
  // the Plan timeline already shows the onboarding summary as STARTING POINT
  // and a verbatim echo at SESSION 2 reads as a bug to the user.
  if (
    startingPoint.length > 0 &&
    summary.trim().toLowerCase() === startingPoint
  ) {
    return Response.json({
      ok: true,
      skipped: "duplicate_of_starting_point",
    });
  }

  await endSession(db, sessionId, {
    userId,
    summary,
    bumpUserCounters: false,
  });

  return Response.json({ ok: true, summarised: true });
}
