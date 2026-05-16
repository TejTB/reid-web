import type { NextRequest } from "next/server";
import {
  anthropic,
  REID_MODEL,
  ONBOARDING_SYSTEM,
  CHAT_SYSTEM,
} from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";
import {
  parseOnboardingClose,
  summaryForHome,
  extractName,
} from "@/lib/reid-summary";
import {
  createSession,
  sessionBelongsTo,
  appendMessages,
  endSession,
} from "@/lib/session-server";

type ReidRequest = {
  userId: string;
  mode: "onboarding" | "chat";
  sessionId?: string;
  messages: { role: "user" | "assistant"; content: string }[];
};

export async function POST(req: NextRequest) {
  let body: ReidRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const { userId, mode, messages } = body;
  let { sessionId } = body;
  if (
    !userId ||
    (mode !== "onboarding" && mode !== "chat") ||
    !Array.isArray(messages)
  ) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  await supabase.from("users").upsert(
    { id: userId, onboarding_complete: false },
    { onConflict: "id", ignoreDuplicates: true },
  );

  // Resolve sessionId: honor client-supplied id only if it exists and
  // belongs to this user. Otherwise mint a fresh session.
  if (sessionId) {
    const ok = await sessionBelongsTo(sessionId, userId);
    if (!ok) sessionId = undefined;
  }
  if (!sessionId) {
    sessionId = await createSession(userId);
  }

  // Legacy conversations table: keep writing the user turn so existing
  // history-loading code (chat page) continues to work during the migration.
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user") {
    await supabase
      .from("conversations")
      .insert({ user_id: userId, role: "user", content: lastMessage.content });
  }

  let systemPrompt = mode === "onboarding" ? ONBOARDING_SYSTEM : CHAT_SYSTEM;

  // Context-aware chat opener: when starting a new chat session with no
  // history, pull the user's name and onboarding summary so Reid's first
  // message knows who they are and what came up in onboarding.
  if (mode === "chat" && messages.length === 0) {
    const { data: profile } = await supabase
      .from("users")
      .select("name, onboarding_summary")
      .eq("id", userId)
      .maybeSingle();
    const parts: string[] = [];
    if (profile?.name) parts.push(`Their name is ${profile.name}.`);
    if (profile?.onboarding_summary) {
      parts.push(
        `Here is what you wrote at the close of onboarding:\n${profile.onboarding_summary}`,
      );
    }
    if (parts.length > 0) {
      systemPrompt = `${CHAT_SYSTEM}\n\nContext on the user you are about to greet:\n${parts.join(
        "\n\n",
      )}\n\nOpen this session with a single short message — pick up where onboarding left off. One sharp question or one concrete next step. Do not greet with their name unless it earns its weight.`;
    }
  }

  const upstreamMessages =
    messages.length === 0
      ? [{ role: "user" as const, content: "Begin." }]
      : messages;

  const aStream = anthropic.messages.stream({
    model: REID_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: upstreamMessages,
  });

  const encoder = new TextEncoder();
  const resolvedSessionId = sessionId;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      aStream.on("text", (delta: string) => {
        if (!closed) controller.enqueue(encoder.encode(delta));
      });
      aStream.on("error", (err: Error) => {
        if (closed) return;
        closed = true;
        controller.error(err);
      });
      aStream.on("end", async () => {
        try {
          const final = await aStream.finalMessage();
          const assistantText = final.content
            .filter((b: { type: string }) => b.type === "text")
            .map((b) =>
              "text" in b && typeof b.text === "string" ? b.text : "",
            )
            .join("");

          const close = parseOnboardingClose(assistantText);
          const cleaned = close.hasSentinel ? close.body : assistantText;

          // Legacy conversations table: persist the assistant turn (without
          // sentinel) so existing readers keep working.
          await supabase
            .from("conversations")
            .insert({
              user_id: userId,
              role: "assistant",
              content: cleaned,
            });

          // New sessions/messages tables: append just this turn's new
          // messages — the trailing user message (if any) and the
          // assistant's full reply. We do NOT replay the whole history
          // on every request.
          const newTurnMessages: { role: "user" | "assistant"; content: string }[] =
            [];
          if (lastMessage?.role === "user") {
            newTurnMessages.push({
              role: "user",
              content: lastMessage.content,
            });
          }
          newTurnMessages.push({
            role: "assistant",
            content: cleaned,
          });
          await appendMessages(resolvedSessionId, userId, newTurnMessages);

          // Update the session row: bump message_count by the number of
          // messages we just appended, set ended_at to "now" so the
          // session timestamp reflects the most recent activity.
          // bumpUserCounters: only true when onboarding actually closes,
          // so the user's session_count counts completed sessions, not
          // individual turns.
          if (mode === "onboarding" && close.hasSentinel) {
            const sessionSummary = summaryForHome(close);
            await endSession(resolvedSessionId, {
              userId,
              summary: sessionSummary,
              taskSet: close.task ?? null,
              messageCountDelta: newTurnMessages.length,
              bumpUserCounters: true,
            });

            // Persist onboarding fields to the user row. Only set `name`
            // if we can extract one AND the user doesn't already have a
            // better one stored.
            const firstUserMessage = messages.find((m) => m.role === "user")
              ?.content;
            const extracted = firstUserMessage
              ? extractName(firstUserMessage)
              : null;
            const update: {
              onboarding_complete: boolean;
              onboarding_summary?: string | null;
              onboarding_task?: string | null;
              name?: string;
            } = { onboarding_complete: true };
            if (sessionSummary) update.onboarding_summary = sessionSummary;
            if (close.task) update.onboarding_task = close.task;
            if (extracted) {
              const { data: existing } = await supabase
                .from("users")
                .select("name")
                .eq("id", userId)
                .maybeSingle();
              if (!existing?.name) update.name = extracted;
            }
            await supabase.from("users").update(update).eq("id", userId);
          } else {
            await endSession(resolvedSessionId, {
              userId,
              messageCountDelta: newTurnMessages.length,
              bumpUserCounters: false,
            });
          }
        } catch {
          // Already delivered to the client; persistence is best-effort.
        }
        if (!closed) {
          closed = true;
          controller.close();
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
      "X-Reid-Session-Id": resolvedSessionId,
      "Cache-Control": "no-store",
    },
  });
}
