"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import ChatStream from "@/components/ChatStream";
import { PromptInputBox } from "@/components/ui/prompt-input-box";
import OnboardingIntro from "@/components/OnboardingIntro";
import { useAuth } from "@/components/AuthProvider";
import { streamReid } from "@/lib/reid";
import { parseOnboardingClose } from "@/lib/reid-summary";
import type { Message } from "@/types/chat";

// Onboarding has three stages:
//   intro  — pre-chat hero (logomark, copy, "Ready →" CTA). Sets the tone
//            before Reid starts asking questions.
//   chat   — the conversation surface. Mirrors /chat but with a progress
//            line replacing the session header.
//   --     — when Reid emits [ONBOARDING_COMPLETE], OnboardingClient flips
//            isCompleting + showComplete and lets OnboardingComplete play
//            the 5-second cinematic before /home.
//
// A mid-flow refresh re-shows the intro because the client doesn't restore
// the in-progress conversation — Reid always restarts from `seed: []`. The
// fresh hero is consistent with that fresh-start behaviour.

type Stage = "intro" | "chat";

// Strips a single leading straight or curly double/single quote (with any
// preceding whitespace). Used during streaming so the user never sees the
// opener's wrapping `"` even for a frame.
function stripLeadingQuote(s: string): string {
  return s.replace(/^\s*["“”']/, "");
}

// Strips a single matching wrapping quote pair from both ends of the string.
// Used on commit so the persisted message doesn't carry the model's literal
// quotation of the onboarding opener.
function stripWrappingQuotes(s: string): string {
  let out = stripLeadingQuote(s);
  out = out.replace(/["“”']\s*$/, "");
  return out;
}

export default function OnboardingClient() {
  const router = useRouter();
  const { me, loading: authLoading, refresh } = useAuth();
  const [stage, setStage] = useState<Stage>("intro");
  // While true, OnboardingIntro fades out before we unmount it — keeps the
  // hand-off from intro → chat from popping.
  const [introExiting, setIntroExiting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  // Single-stage completion: fade the chat surface, then redirect. The
  // older multi-second cinematic via OnboardingComplete made the wrap-up
  // feel like the app was stalling instead of finishing — replaced with a
  // 600ms fade-then-go so the founder lands on /home inside one second of
  // Reid's final message.
  const [isCompleting, setIsCompleting] = useState(false);
  const completionTriggered = useRef(false);
  const streamStarted = useRef(false);

  async function triggerCompletion() {
    if (completionTriggered.current) return;
    completionTriggered.current = true;

    // The server flips users.onboarding_complete=true the moment it sees
    // [ONBOARDING_COMPLETE] in the model output. Pull a fresh snapshot of
    // the user row so subsequent routes see the new state.
    await refresh();

    setIsCompleting(true);
    setTimeout(() => router.replace("/home"), 600);
  }

  async function runStream(seed: Message[]) {
    // The model is told to "use it exactly" for the onboarding opener and
    // the prompt shows that line wrapped in quotes — so it sometimes emits
    // the surrounding `"`. Strip them on the opener turn only; later
    // messages may legitimately quote the founder back at them.
    const isOpener = seed.length === 0;
    const display = (s: string) => (isOpener ? stripLeadingQuote(s) : s);
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
        setStreamingText(display(acc));
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
          setStreamingText(display(acc));
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "My end's jammed. Send it again.",
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
    const finalContent = isOpener ? stripWrappingQuotes(cleaned) : cleaned;

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: finalContent },
    ]);
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

  // Auth gate. Unsigned → /login. Already onboarded → /home. Otherwise
  // stay here and let stage default to "intro".
  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    if (me.onboarding_complete) {
      router.replace("/home");
    }
  }, [authLoading, me, router]);

  // Kick off Reid's opener the first time we enter the chat stage, no matter
  // whether the user clicked Ready or we auto-advanced. Re-renders don't
  // restart it — guarded by streamStarted.
  useEffect(() => {
    if (stage !== "chat") return;
    if (streamStarted.current) return;
    streamStarted.current = true;
    void runStream([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function handleBegin() {
    setIntroExiting(true);
    // Wait for the intro fade-out to finish before unmounting, then flip the
    // chat stage in. The chat surface fades in via its own .page-enter
    // animation (see globals.css).
    window.setTimeout(() => {
      setStage("chat");
    }, 300);
  }

  async function handleSend(content: string) {
    if (!me || isStreaming || isCompleting) return;

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(nextMessages);
    await runStream(nextMessages);
  }

  if (authLoading || !me) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0A1628" }}
      >
        <LogoMark size={48} />
      </div>
    );
  }

  if (stage === "intro") {
    return <OnboardingIntro onBegin={handleBegin} exiting={introExiting} />;
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
          padding: "20px 24px 14px",
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
      <ChatStream
        messages={messages}
        streamingText={streamingText}
        isStreaming={isStreaming}
        faded={isCompleting}
      />
      <div
        className="fixed left-0 right-0 z-50 bottom-[env(safe-area-inset-bottom)] px-4 pb-4 pt-2"
        style={{
          transition: "opacity 300ms ease",
          opacity: isCompleting ? 0 : 1,
          pointerEvents: isCompleting ? "none" : "auto",
        }}
      >
        <div className="mx-auto max-w-[720px]">
          <PromptInputBox
            onSend={(message) => {
              const trimmed = message.trim();
              if (!trimmed) return;
              void handleSend(trimmed);
            }}
            isLoading={isStreaming || isCompleting}
            placeholder="What's the situation?"
          />
        </div>
      </div>
    </div>
  );
}
