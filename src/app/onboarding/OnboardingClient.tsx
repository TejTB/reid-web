"use client";
import { useEffect, useRef, useState } from "react";
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
  setOnboardedFlag,
} from "@/lib/session";
import { parseOnboardingClose, summaryForHome } from "@/lib/reid-summary";
import type { Message } from "@/types/chat";

function extractName(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^(i'?m|my name is|call me|it's|its)\s+/i, "")
    .split(/[\s,.!?]/)[0];
  if (!cleaned) return null;
  if (cleaned.length > 40) return null;
  return cleaned;
}

export default function OnboardingClient() {
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

  async function triggerCompletion(
    idForRequest: string,
    rawAssistantText: string,
  ) {
    if (completionTriggered.current) return;
    completionTriggered.current = true;
    const close = parseOnboardingClose(rawAssistantText);
    const summary = summaryForHome(close);
    const task = close.task;

    // (a) Set BOTH localStorage flags synchronously. The root page reads these
    // and is the authoritative redirect gate after onboarding.
    setOnboardedFlag(idForRequest);

    // (b) Update Supabase users.onboarding_complete=true. Awaited so the
    // animation only starts once persistence is confirmed. Server may have
    // already written these on the streaming end hook — this is a fallback.
    await markOnboardingComplete(idForRequest, summary, task);

    // (c) Belt-and-braces: re-assert both flags as literal localStorage calls
    // immediately before the animation begins. setOnboardedFlag in (a) does
    // the same work via a helper; this is the contract spelled out in source
    // so the redirect gate's source of truth is obvious at the call site.
    localStorage.setItem("reid:userId", idForRequest);
    localStorage.setItem("reid:onboarded", "true");

    // (d) Animation only begins after (a)–(c) have all completed.
    setIsCompleting(true);
    setTimeout(() => setShowComplete(true), 700);
  }

  async function runStream(seed: Message[], idForRequest: string) {
    setIsStreaming(true);
    setStreamingText("");
    let acc = "";
    let firstAttemptFailed = false;
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
      firstAttemptFailed = true;
    }
    if (firstAttemptFailed) {
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
          mode: "onboarding",
          messages: seed,
        })) {
          acc += chunk;
          setStreamingText(acc);
        }
      } catch {
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
    }

    const close = parseOnboardingClose(acc);
    const cleaned = close.hasSentinel ? close.body : acc;

    setMessages((prev) => [...prev, { role: "assistant", content: cleaned }]);
    setStreamingText("");
    setIsStreaming(false);

    if (close.hasSentinel) {
      void triggerCompletion(idForRequest, acc);
      return;
    }

    const userTurnsAfter = seed.filter((m) => m.role === "user").length;
    if (userTurnsAfter >= 10) {
      void triggerCompletion(idForRequest, acc);
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
    <div
      className="onboarding-bg"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0A1628",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <header
        className="flex items-center"
        style={{
          padding: "20px 24px",
          gap: 10,
          transition: "opacity 300ms ease",
          opacity: isCompleting ? 0 : 1,
        }}
      >
        <LogoMark size={32} />
        <span
          style={{
            fontFamily: "var(--font-serif), serif",
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#F2EDE3",
          }}
        >
          Reid
        </span>
      </header>
      <div
        style={{
          transition: "opacity 300ms ease",
          opacity: isCompleting ? 0 : 1,
        }}
      >
        <ProgressDots total={10} current={Math.min(userTurnCount, 10)} />
      </div>
      <ChatStream
        messages={messages}
        streamingText={streamingText}
        isStreaming={isStreaming}
        faded={isCompleting}
      />
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
      {showComplete && <OnboardingComplete />}
    </div>
  );
}
