// POST /api/tasks/complete
//
// Sprint 7 Agent 3 — task completion moment.
//
// Fired by /tasks when the founder ticks the circle on a task Reid set them.
// Two side-effects, both best-effort but ordered:
//
//   1. Mark the task complete on public.users (column
//      `onboarding_task_completed_at`). The /tasks UI is already optimistic;
//      this just persists across devices.
//   2. Ask Reid for a one-sentence acknowledgement and write his response to
//      the legacy `conversations` table as a system-originated assistant
//      turn. The /chat page reads that table as its message history fallback,
//      so the user sees Reid's reply when they tap the toast.
//
// The brief asks for a sibling endpoint rather than extending /api/reid
// (which is off-limits to Agent 3 in this sprint). The system prompt and
// model client are shared via @/lib/anthropic — same voice, same model.
//
// Auth: shared cookie-or-bearer pattern from getAuthedUser. RLS handles the
// row-level scoping; we only resolve the user_id to write the conversation
// row.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { anthropic, REID_MODEL, buildSystemPrompt } from "@/lib/anthropic";
import { getAuthedUser } from "@/lib/supabase-auth";

const taskCompleteRequestSchema = z.object({
  taskText: z.string().min(1).max(2000),
});

/** Reid's instruction for the acknowledgement reply. Kept here rather than in
 *  @/lib/anthropic because it's specific to this side-channel. */
const SYSTEM_NOTE_INSTRUCTION = `User just completed a task you assigned them. Acknowledge it briefly. Be direct — one sentence. Don't be warm about it. Make them feel like they owe you another one.`;

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
  const parsedBody = taskCompleteRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { taskText } = parsedBody.data;

  const { data: meRow } = await db
    .from("users")
    .select("id, subscription_status")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!meRow?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }
  const userId = meRow.id as string;

  // 1) Persist completion timestamp. Idempotent — re-completing an already
  // ticked task is a no-op from the user's perspective.
  await db
    .from("users")
    .update({ onboarding_task_completed_at: new Date().toISOString() })
    .eq("id", userId);

  // 2) Ask Reid for one short sentence. Build the system prompt with empty
  // context so we don't pay the token cost of a full FOUNDER CONTEXT block
  // for a 1-sentence reply; the system note carries enough.
  const systemPrompt = `${buildSystemPrompt("")}\n\nSYSTEM NOTE: ${SYSTEM_NOTE_INSTRUCTION}`;
  let replyText = "";
  try {
    const response = await anthropic.messages.create({
      model: REID_MODEL,
      max_tokens: 160,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `The task you set me is done: "${taskText.trim()}"`,
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      replyText = textBlock.text.trim();
    }
  } catch {
    // Anthropic failure: still return 200 so the optimistic UI doesn't roll
    // back. The toast falls back to a static phrase.
    return Response.json({ ok: true, replied: false });
  }

  if (!replyText) {
    return Response.json({ ok: true, replied: false });
  }

  // Persist as an assistant turn in conversations (the legacy table the chat
  // page already reads). No session_id — this is a side-channel from /tasks,
  // not a chat session.
  const { error: insertError } = await db.from("conversations").insert({
    user_id: userId,
    role: "assistant",
    content: replyText,
  });
  if (insertError) {
    return Response.json({ ok: true, replied: false });
  }

  return Response.json({ ok: true, replied: true, reply: replyText });
}
