"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import ProgressDots from "@/components/ProgressDots";
import ChatStream from "@/components/ChatStream";
import ChatInput from "@/components/ChatInput";
import OnboardingComplete from "@/components/OnboardingComplete";
import { useAuth } from "@/components/AuthProvider";
import { streamReid } from "@/lib/reid";
import { parseOnboardingClose } from "@/lib/reid-summary";
import type { Message } from "@/types/chat";

export default function OnboardingClient() {
  const router = useRouter();
  const { me, loading: authLoading, refresh } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  // Two stage completion: first fade chat + input, then mount the overlay.
  const [isCompleting, setIsCompleting] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const completionTriggered = useRef(false);
  const initialized = useRef(false);

  const userTurnCount = messages.filter((m) => m.role === "user").length;

  async function triggerCompletion() {
    if (completionTriggered.current) return;
    completionTriggered.current = true;

    // The server flips users.onboarding_complete=true the moment it sees
    // [ONBOARDING_COMPLETE] in the model output. Pull a fresh snapshot of
    // the user row so subsequent routes see the new state.
    await refresh();

    setIsCompleting(true);
    setTimeout(() => setShowComplete(true), 700);
    setTimeout(() => router.replace("/home"), 2500);
  }

  async function runStream(seed: Message[]) {
    setIsStreaming(true);
    setStreamingText("");
    let acc = "";
    let firstAttemptFailed = false;
    try {
      for await (const chunk of streamReid({
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

    // The server strips sentinels from the stream before they reach us, so
    // parseOnboardingClose(acc) will report hasSentinel=false on fresh
    // traffic. We keep it as a defensive fallback for any path that bypasses
    // the server filter.
    const close = parseOnboardingClose(acc);
    const cleaned = close.hasSentinel ? close.body : acc;

    setMessages((prev) => [...prev, { role: "assistant", content: cleaned }]);
    setStreamingText("");
    setIsStreaming(false);

    if (close.hasSentinel) {
      void triggerCompletion();
      return;
    }

    // Server-side signal: refresh the auth context to see whether the route
    // flipped onboarding_complete.
    try {
      await refresh();
    } catch {
      // best-effort
    }
  }

  // Drive completion off the refreshed `me`.
  useEffect(() => {
    if (completionTriggered.current) return;
    if (me?.onboarding_complete) {
      void triggerCompletion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.onboarding_complete]);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (me.onboarding_complete) {
      router.replace("/home");
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    void runStream([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, me, router]);

  async function handleSend(content: string) {
    if (!me || isStreaming || isCompleting) return;

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(nextMessages);
    await runStream(nextMessages);
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
