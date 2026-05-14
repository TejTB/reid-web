import type { NextRequest } from "next/server";
import {
  anthropic,
  REID_MODEL,
  ONBOARDING_SYSTEM,
  CHAT_SYSTEM,
} from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

type ReidRequest = {
  userId: string;
  mode: "onboarding" | "chat";
  messages: { role: "user" | "assistant"; content: string }[];
};

const SENTINEL = "[ONBOARDING_COMPLETE]";

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

  const systemPrompt = mode === "onboarding" ? ONBOARDING_SYSTEM : CHAT_SYSTEM;

  const upstreamMessages =
    messages.length === 0 && mode === "onboarding"
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

          const hasSentinel = assistantText.includes(SENTINEL);
          const cleaned = hasSentinel
            ? assistantText.replace(SENTINEL, "").trim()
            : assistantText;

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
          // persist the summary body and flip onboarding_complete here, so
          // we don't depend on the client surviving the round trip.
          if (mode === "onboarding" && hasSentinel) {
            const summary = cleaned.length > 0 ? cleaned : null;
            const update: {
              onboarding_complete: boolean;
              onboarding_summary?: string;
            } = { onboarding_complete: true };
            if (summary) update.onboarding_summary = summary;
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
