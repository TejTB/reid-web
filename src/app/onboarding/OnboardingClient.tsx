"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import ProgressDots from "@/components/ProgressDots";
import ChatStream from "@/components/ChatStream";
import ChatInput from "@/components/ChatInput";
import OnboardingComplete from "@/components/OnboardingComplete";
import { streamReid } from "@/lib/reid";
import {
  ensureUserId,
  setUserName,
  markOnboardingComplete,
} from "@/lib/session";
import type { Message } from "@/types/chat";

const SENTINEL = "[ONBOARDING_COMPLETE]";

function extractName(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^(i'?m|my name is|call me|it's|its)\s+/i, "")
    .split(/[\s,.!?]/)[0];
  if (!cleaned) return null;
  if (cleaned.length > 40) return null;
  return cleaned;
}

// Reid's closing message is summary -> assessment -> task. Persist the
// non-empty body (everything before the sentinel) as the onboarding summary.
function extractSummary(closingMessage: string): string {
  return closingMessage.replace(SENTINEL, "").trim();
}

export default function OnboardingClient() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingName, setAwaitingName] = useState(true);
  // Two stage completion: first fade chat + input, then mount the overlay.
  const [isCompleting, setIsCompleting] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const completionTriggered = useRef(false);
  const initialized = useRef(false);

  const userTurnCount = messages.filter((m) => m.role === "user").length;

  function triggerCompletion(idForRequest: string, cleaned: string) {
    if (completionTriggered.current) return;
    completionTriggered.current = true;
    const summary = extractSummary(cleaned);
    void markOnboardingComplete(idForRequest, summary || null);
    // Start fade-out of chat/input immediately. After 700ms (300ms input
    // fade + 400ms more for messages-fade overlap), mount the overlay,
    // which then plays steps 3+ of the spec (300ms hold, then logo in).
    setIsCompleting(true);
    setTimeout(() => setShowComplete(true), 700);
  }

  async function runStream(seed: Message[], idForRequest: string) {
    setIsStreaming(true);
    setStreamingText("");
    let acc = "";
    try {
      for await (const chunk of streamReid({
        userId: idForRequest,
        mode: "onboarding",
        messages: seed,
      })) {
        acc += chunk;
        setStreamingText(acc);
      }
    } catch {
      const errMsg: Message = {
        role: "assistant",
        content: "Reid stumbled — try again.",
      };
      setMessages((prev) => [...prev, errMsg]);
      setStreamingText("");
      setIsStreaming(false);
      return;
    }

    const hasSentinel = acc.trimEnd().endsWith(SENTINEL);
    const cleaned = hasSentinel ? acc.replace(SENTINEL, "").trimEnd() : acc;

    setMessages((prev) => [...prev, { role: "assistant", content: cleaned }]);
    setStreamingText("");
    setIsStreaming(false);

    if (hasSentinel) {
      triggerCompletion(idForRequest, cleaned);
      return;
    }

    const userTurnsAfter = seed.filter((m) => m.role === "user").length;
    if (userTurnsAfter >= 10) {
      triggerCompletion(idForRequest, cleaned);
    }
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const id = ensureUserId();
    setUserId(id);
    void runStream([], id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend(content: string) {
    if (!userId || isStreaming || isCompleting) return;

    if (awaitingName) {
      const name = extractName(content);
      if (name) setUserName(userId, name);
      setAwaitingName(false);
    }

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(nextMessages);
    await runStream(nextMessages, userId);
  }

  return (
    <div className="min-h-screen onboarding-bg flex flex-col">
      <header
        className="flex items-center gap-3"
        style={{
          padding: "20px 24px",
          transition: "opacity 300ms ease",
          opacity: isCompleting ? 0 : 1,
        }}
      >
        <LogoMark size={32} />
      </header>
      <div
        style={{
          transition: "opacity 300ms ease",
          opacity: isCompleting ? 0 : 1,
        }}
      >
        <ProgressDots total={10} current={Math.min(userTurnCount, 10)} />
      </div>
      <div className="mx-auto w-full max-w-[720px] flex-1 flex flex-col px-6">
        <div
          style={{
            transition: "opacity 500ms ease 200ms",
            opacity: isCompleting ? 0 : 1,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <ChatStream
            messages={messages}
            streamingText={streamingText}
            isStreaming={isStreaming}
          />
        </div>
        <div
          style={{
            transition: "opacity 300ms ease",
            opacity: isCompleting ? 0 : 1,
            pointerEvents: isCompleting ? "none" : "auto",
          }}
        >
          <ChatInput
            onSubmit={handleSend}
            disabled={isStreaming || isCompleting}
          />
        </div>
      </div>
      {showComplete && (
        <OnboardingComplete onDone={() => router.push("/home")} />
      )}
    </div>
  );
}
