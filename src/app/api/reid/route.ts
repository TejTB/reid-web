import type { NextRequest } from "next/server";
import {
  anthropic,
  REID_MODEL,
  ONBOARDING_SYSTEM,
  CHAT_SYSTEM,
} from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";
import { parseOnboardingClose, summaryForHome } from "@/lib/reid-summary";

type ReidRequest = {
  userId: string;
  mode: "onboarding" | "chat";
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

          // Persist conversation without the sentinel — readers (chat history,
          // future analytics) should never see the control token in the body.
          await supabase
            .from("conversations")
            .insert({
              user_id: userId,
              role: "assistant",
              content: cleaned,
            });

          // Server-authoritative completion: if Reid emitted the sentinel,
          // persist the summary + task and flip onboarding_complete here, so
          // we don't depend on the client surviving the round trip.
          if (mode === "onboarding" && close.hasSentinel) {
            const summary = summaryForHome(close);
            const update: {
              onboarding_complete: boolean;
              onboarding_summary?: string | null;
              onboarding_task?: string | null;
            } = { onboarding_complete: true };
            if (summary) update.onboarding_summary = summary;
            if (close.task) update.onboarding_task = close.task;
            await supabase.from("users").update(update).eq("id", userId);
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
      "Cache-Control": "no-store",
    },
  });
}
