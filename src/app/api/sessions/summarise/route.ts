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
import { getAuthedUser } from "@/lib/supabase-auth";
import { endSession } from "@/lib/session-server";
import { generateSessionSummary } from "@/lib/reid-summary";
import { KEEPALIVE_MIN_IDLE_MS } from "@/lib/session-policy";

const summariseRequestSchema = z.object({
  sessionId: z.string().uuid(),
});

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
    .select("id, user_id, summary, ended_at, started_at")
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
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const messages = (messageRows ?? []) as Array<{
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }>;

  // Same threshold as /api/observe — sub-threshold sessions aren't worth the
  // model call.
  if (messages.length < 4) {
    return Response.json({ ok: true, skipped: "too_few_messages" });
  }

  // Recent-activity refusal (B1, Theo's amendment): unmount fires on every
  // internal navigation, and writing a summary CLOSES the session under the
  // derived-closure rule (session-policy.ts). A tab-switch must never close a
  // live conversation — only genuinely idle sessions get summarised here;
  // everything else closes lazily via summarise-at-next-start.
  const lastMessageAt = Date.parse(messages[messages.length - 1].created_at);
  const lastActivity = Number.isNaN(lastMessageAt)
    ? Date.parse(
        ((sessionRow.ended_at as string | null) ??
          (sessionRow.started_at as string)) || "",
      )
    : lastMessageAt;
  if (
    !Number.isNaN(lastActivity) &&
    Date.now() - lastActivity < KEEPALIVE_MIN_IDLE_MS
  ) {
    return Response.json({ ok: true, skipped: "recent_activity" });
  }

  // Structured Haiku summariser (B1.3) — same writer as the sentinel and
  // next-start paths, so every path produces commitments/key_points.
  const result = await generateSessionSummary(
    messages.map((m) => ({ role: m.role, content: m.content })),
  );
  const summary = result.summary.trim();
  if (!summary) {
    return Response.json({ ok: true, skipped: "empty_response" });
  }

  // Drop summaries that are functionally identical to the starting point —
  // the Plan timeline already shows the onboarding summary as STARTING POINT
  // and a verbatim echo at SESSION 2 reads as a bug to the user.
  if (
    startingPoint.length > 0 &&
    summary.toLowerCase() === startingPoint
  ) {
    return Response.json({
      ok: true,
      skipped: "duplicate_of_starting_point",
    });
  }

  await endSession(db, sessionId, {
    userId,
    summary,
    commitments: result.commitments,
    keyPoints: result.key_points,
    bumpUserCounters: false,
  });

  return Response.json({ ok: true, summarised: true });
}
