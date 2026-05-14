"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatStream from "@/components/ChatStream";
import ChatInput from "@/components/ChatInput";
import { streamReid } from "@/lib/reid";
import { getUserId } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { Message } from "@/types/chat";
import type { Conversation } from "@/types/db";

export default function ChatPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initialized = useRef(false);

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
      setMessages(rows.map((r) => ({ role: r.role, content: r.content })));
      setLoaded(true);
    })();
  }, [router]);

  async function handleSend(content: string) {
    if (!userId || isStreaming) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setIsStreaming(true);
    setStreamingText("");
    let acc = "";
    try {
      for await (const chunk of streamReid({
        userId,
        mode: "chat",
        messages: nextMessages,
      })) {
        acc += chunk;
        setStreamingText(acc);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Reid stumbled — try again." },
      ]);
      setStreamingText("");
      setIsStreaming(false);
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: acc }]);
    setStreamingText("");
    setIsStreaming(false);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] min-h-[calc(100vh-5rem)] md:min-h-screen flex flex-col px-6">
      <header
        className="pt-[60px] pb-5"
        style={{ borderBottom: "1px solid rgba(242,237,232,0.06)" }}
      >
        <h1 className="font-serif text-text-primary" style={{ fontSize: 20 }}>
          Reid
        </h1>
      </header>
      {!loaded ? (
        <div className="flex-1 flex flex-col gap-6 py-6">
          <div className="h-5 w-3/4 rounded-md bg-bg-card animate-skeleton" />
          <div className="h-5 w-2/3 rounded-md bg-bg-card animate-skeleton" />
          <div className="h-5 w-4/5 rounded-md bg-bg-card animate-skeleton" />
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
