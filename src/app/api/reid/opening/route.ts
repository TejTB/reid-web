// POST /api/reid/opening
//
// Sprint 8F — "Reid speaks first."
//
// Generates a single contextual opening line streamed back to the client on
// every /chat mount. Reads the most recent task (sessions.task_set or
// users.onboarding_task as fallback), the most recent observation, the user's
// onboarding summary, and days since the last CHAT session — and asks the
// model for one short line that references something specific.
//
// Streaming format mirrors /api/reid: `text/plain; charset=utf-8` body, raw
// model deltas, no SSE envelope. Failure modes (no auth user row, model
// error, etc.) collapse to a 204 No Content so the client can fall back to
// the static "Your co-founder is ready." empty state without surfacing a
// half-formed message.

import type { NextRequest } from "next/server";
import { anthropic, REID_MODEL } from "@/lib/anthropic";
import { getAuthedUser } from "@/lib/supabase-auth";

interface TaskRow {
  content: string;
  completed: boolean;
}

interface SessionRow {
  ended_at: string | null;
  started_at: string;
}

/** Builds the opening-line system prompt. Kept inline so it can't drift away
 *  from the values it references. */
function buildOpeningPrompt(args: {
  name: string | null;
  daysSinceLastSession: number | null;
  lastTask: TaskRow | null;
  lastObservation: string | null;
  onboardingSummary: string | null;
}): string {
  const { name, daysSinceLastSession, lastTask, lastObservation, onboardingSummary } = args;
  const taskLine = lastTask?.content
    ? `"${lastTask.content}"`
    : "none yet";
  const taskDone = lastTask ? (lastTask.completed ? "yes" : "no") : "no";
  const observationLine = lastObservation
    ? `"${lastObservation}"`
    : "nothing recorded yet";
  const summaryLine = onboardingSummary ?? "nothing — this is the first session";
  const daysLine =
    daysSinceLastSession === null ? "first session" : `${daysSinceLastSession}`;

  return `You are Reid, an AI co-founder. You know this person well.

Context:
- Founder name: ${name ?? "they"}
- Days since last session: ${daysLine}
- Last task you assigned them: ${taskLine}
- Last task completed? ${taskDone}
- Last thing you noticed: ${observationLine}
- What you learned in onboarding: ${summaryLine}

Write ONE opening line. This is the first thing you say when they open the app right now.

Rules:
- Reference something specific — the task, the observation, the time gap, or the onboarding context.
- Never say "Hello", "Hi", "Hey", "Welcome back", "How can I help".
- Never start with "I" (your voice rule).
- Be direct. Slightly uncomfortable. You've been watching.
- Maximum 20 words. Single sentence preferred. Two short ones if needed.
- Playfair italic voice — editorial, psychological, precise.
- Examples of the right tone:
  "You said you'd send it to Noah and Louis. Did you?"
  "Three days. What happened to the distribution plan?"
  "The coding barrier is still there. Are you avoiding it or solving it?"
  "First session. Tell me where you actually are — not the version you tell investors."

Return only the opening line. No quotes. No preamble. No trailing newline.`;
}

function daysBetween(fromIso: string, nowMs: number): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  const diffMs = Math.max(0, nowMs - from);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export async function POST(req: NextRequest): Promise<Response> {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return new Response(null, { status: 401 });
  }
  const db = authed.supabase;

  const { data: meRow } = await db
    .from("users")
    .select("id, name, onboarding_summary, onboarding_task, onboarding_task_completed_at")
    .eq("auth_id", authed.user.id)
    .maybeSingle();
  if (!meRow?.id) {
    return new Response(null, { status: 204 });
  }
  const userId = meRow.id as string;
  const name = (meRow.name as string | null) ?? null;
  const onboardingSummary = (meRow.onboarding_summary as string | null) ?? null;
  const onboardingTask = (meRow.onboarding_task as string | null) ?? null;
  const onboardingTaskCompleted = Boolean(
    meRow.onboarding_task_completed_at as string | null,
  );

  // Most recent CHAT session — filter on mode='chat' so the onboarding row
  // never feeds context. Order by ended_at desc nulls last, then started_at
  // desc, take 1.
  const { data: chatSessionRows } = await db
    .from("sessions")
    .select("id, started_at, ended_at, task_set")
    .eq("user_id", userId)
    .eq("mode", "chat")
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(1);
  const lastChatSession = (chatSessionRows?.[0] ?? null) as
    | (SessionRow & { task_set: string | null })
    | null;

  // Last task: prefer the most recent chat session's task_set, fall back to
  // the onboarding task. "Completed" only applies to the onboarding task —
  // session-set tasks don't carry a completion timestamp in this schema.
  let lastTask: TaskRow | null = null;
  if (lastChatSession?.task_set && lastChatSession.task_set.trim().length > 0) {
    lastTask = { content: lastChatSession.task_set.trim(), completed: false };
  } else if (onboardingTask && onboardingTask.trim().length > 0) {
    lastTask = {
      content: onboardingTask.trim(),
      completed: onboardingTaskCompleted,
    };
  }

  // Most recent observation (any source).
  const { data: observationRows } = await db
    .from("observations")
    .select("text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const lastObservation =
    (observationRows?.[0]?.text as string | null) ?? null;

  // Days since last chat session — measured from ended_at when present,
  // else started_at. null when there are no chat sessions yet (first real
  // session — onboarding doesn't count).
  let daysSinceLastSession: number | null = null;
  if (lastChatSession) {
    const ref = lastChatSession.ended_at ?? lastChatSession.started_at;
    daysSinceLastSession = daysBetween(ref, Date.now());
  }

  const systemPrompt = buildOpeningPrompt({
    name,
    daysSinceLastSession,
    lastTask,
    lastObservation,
    onboardingSummary,
  });

  let aStream: ReturnType<typeof anthropic.messages.stream>;
  try {
    aStream = anthropic.messages.stream({
      model: REID_MODEL,
      max_tokens: 80,
      system: systemPrompt,
      messages: [{ role: "user", content: "Begin." }],
    });
  } catch {
    return new Response(null, { status: 204 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      aStream.on("text", (delta: string) => {
        if (closed) return;
        if (delta.length > 0) controller.enqueue(encoder.encode(delta));
      });
      aStream.on("error", () => {
        if (closed) return;
        closed = true;
        // Closing without erroring the stream lets the client read whatever
        // it already received. If nothing was emitted, the client sees an
        // empty body and falls back via the openingState='failed' path.
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
      aStream.on("end", () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      aStream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
