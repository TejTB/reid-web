"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatStream from "@/components/ChatStream";
import ChatInput from "@/components/ChatInput";
import { streamReid } from "@/lib/reid";
import { getUserId } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";
import type { Message } from "@/types/chat";
import type { Conversation } from "@/types/db";

export default function ChatPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Timestamp of the most recent conversation row at the moment the page
  // loaded. We snapshot ON LOAD so the "Last session" subtitle reflects the
  // *prior* session, not the message the user just sent.
  const [lastSessionAt, setLastSessionAt] = useState<string | null>(null);
  const initialized = useRef(false);

  const streamWithRetry = useCallback(
    async (
      idForRequest: string,
      msgs: Message[],
    ): Promise<{ ok: boolean; text: string }> => {
      let acc = "";
      try {
        for await (const chunk of streamReid({
          userId: idForRequest,
          mode: "chat",
          messages: msgs,
        })) {
          acc += chunk;
          setStreamingText(acc);
        }
        return { ok: true, text: acc };
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Give me a moment." },
        ]);
        setStreamingText("");
        await new Promise((r) => setTimeout(r, 2000));
        acc = "";
        try {
          for await (const chunk of streamReid({
            userId: idForRequest,
            mode: "chat",
            messages: msgs,
          })) {
            acc += chunk;
            setStreamingText(acc);
          }
          return { ok: true, text: acc };
        } catch {
          return { ok: false, text: "" };
        }
      }
    },
    [],
  );

  const streamOpener = useCallback(
    async (idForRequest: string) => {
      setIsStreaming(true);
      setStreamingText("");
      const result = await streamWithRetry(idForRequest, []);
      if (!result.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Something's off on my end. Try again.",
          },
        ]);
        setStreamingText("");
        setIsStreaming(false);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.text },
      ]);
      setStreamingText("");
      setIsStreaming(false);
    },
    [streamWithRetry],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      const id = getUserId();
      if (!id) {
        router.replace("/onboarding");
        return;
      }
      setUserId(id);
      const { data } = await supabase
        .from("conversations")
        .select("id, user_id, role, content, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as Conversation[];
      const hist: Message[] = rows.map((r) => ({
        role: r.role,
        content: r.content,
      }));
      setMessages(hist);
      // Snapshot the latest existing row time BEFORE we generate the opener.
      // Empty history → no subtitle. Existing history → "Last session: …".
      if (rows.length > 0) {
        setLastSessionAt(rows[rows.length - 1].created_at);
      }
      setLoaded(true);

      // Fresh chat: no prior messages yet. Fire a context-aware opener that
      // already knows the user's name and onboarding summary (server pulls it).
      if (hist.length === 0) {
        await streamOpener(id);
      }
    })();
  }, [router, streamOpener]);

  async function handleSend(content: string) {
    if (!userId || isStreaming) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setIsStreaming(true);
    setStreamingText("");
    const result = await streamWithRetry(userId, nextMessages);
    if (!result.ok) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something's off on my end. Try again." },
      ]);
      setStreamingText("");
      setIsStreaming(false);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: result.text },
    ]);
    setStreamingText("");
    setIsStreaming(false);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] h-[calc(100dvh-64px)] md:h-[100dvh] overflow-hidden flex flex-col px-6">
      <header
        className="pt-[60px] pb-5 flex items-baseline justify-between gap-4"
        style={{ borderBottom: "1px solid rgba(242,237,232,0.06)" }}
      >
        <h1 className="font-serif text-text-primary" style={{ fontSize: 20 }}>
          Reid
        </h1>
        {lastSessionAt && (
          <span
            className="font-sans"
            style={{ fontSize: 12, color: "#7A90A8" }}
          >
            Last session: {relativeTime(lastSessionAt)}
          </span>
        )}
      </header>
      {!loaded ? (
        <div className="flex-1 flex flex-col gap-5 py-8">
          {/* Message-shaped skeletons: Reid (left, wide) / user (right, pill) /
              Reid (left, narrower). Staggered so the eye reads them as a
              sequence of incoming bubbles. */}
          <div
            className="h-10 rounded-md bg-bg-card animate-skeleton"
            style={{ width: "78%", animationDelay: "0ms" }}
          />
          <div className="flex justify-end">
            <div
              className="h-10 rounded-[18px] bg-bg-card animate-skeleton"
              style={{ width: "52%", animationDelay: "100ms" }}
            />
          </div>
          <div
            className="h-10 rounded-md bg-bg-card animate-skeleton"
            style={{ width: "64%", animationDelay: "200ms" }}
          />
        </div>
      ) : (
        <>
          <ChatStream
            messages={messages}
            streamingText={streamingText}
            isStreaming={isStreaming}
          />
          <ChatInput onSubmit={handleSend} disabled={isStreaming} />
        </>
      )}
    </div>
  );
}
