"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatStream from "@/components/ChatStream";
import ChatInput from "@/components/ChatInput";
import LogoMark from "@/components/LogoMark";
import VoiceButton from "@/components/VoiceButton";
import { useAuth, useIsPro } from "@/components/AuthProvider";
import { streamReid, DailyLimitError, SessionLimitError } from "@/lib/reid";
import { getChatSessionId, setChatSessionId } from "@/lib/session";
import { FREE_SESSIONS } from "@/lib/session-shared";
import { formatLastSession, formatSessionDate } from "@/lib/format";
import type { Message } from "@/types/chat";
import type { Message as DbMessage, Session as DbSession } from "@/types/db";

type SessionWithMessages = { session: DbSession; messages: DbMessage[] };

export default function ChatPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const isPro = useIsPro();
  const userId = me?.id ?? "";
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Reserved for future bootstrap-failure UI; auth/me load lives in
  // AuthProvider now, so the chat page itself has no early-failure surface.
  const bootstrapError = false;
  // Snapshot at mount of the user's last_session_at from public.users. This is
  // the *prior* session timestamp — it does NOT reflect activity in the
  // session that begins on this page load. Used by the header subtitle.
  const [lastSessionAt, setLastSessionAt] = useState<string | null>(null);
  // Prior chat sessions (most recent N excluding the current one), oldest first.
  // Currently always empty — multi-session history loading is deferred. The
  // rendering path is wired so a single state update will turn it on.
  const [priorSessions] = useState<SessionWithMessages[]>([]);
  const initialized = useRef(false);

  const streamWithRetry = useCallback(
    async (
      currentSessionId: string | null,
      msgs: Message[],
    ): Promise<{ ok: boolean; text: string; sessionId: string | null }> => {
      let acc = "";
      let resolvedSessionId: string | null = currentSessionId;
      const onSession = (sid: string) => {
        resolvedSessionId = sid;
      };
      try {
        for await (const chunk of streamReid(
          {
            mode: "chat",
            sessionId: currentSessionId,
            messages: msgs,
          },
          { onSession },
        )) {
          acc += chunk;
          setStreamingText(acc);
        }
        return { ok: true, text: acc, sessionId: resolvedSessionId };
      } catch (err) {
        // Paywall (402): session_limit_reached opens the upgrade modal and
        // rolls back the optimistic user turn. No retry — the free quota is
        // exhausted and a retry would 402 again.
        if (err instanceof SessionLimitError) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("reid:open-paywall"));
          }
          setMessages((prev) => prev.slice(0, -1));
          setStreamingText("");
          return {
            ok: false,
            text: "",
            sessionId: resolvedSessionId,
          };
        }
        // Paywall: 429 daily_limit_exceeded opens the upgrade modal and
        // rolls back the optimistic user turn — no retry, no "Give me a
        // moment" placeholder.
        if (err instanceof DailyLimitError) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("reid:open-paywall"));
          }
          setMessages((prev) => prev.slice(0, -1));
          setStreamingText("");
          return {
            ok: false,
            text: "",
            sessionId: resolvedSessionId,
          };
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Give me a moment." },
        ]);
        setStreamingText("");
        await new Promise((r) => setTimeout(r, 2000));
        acc = "";
        try {
          for await (const chunk of streamReid(
            {
              mode: "chat",
              sessionId: currentSessionId,
              messages: msgs,
            },
            { onSession },
          )) {
            acc += chunk;
            setStreamingText(acc);
          }
          return { ok: true, text: acc, sessionId: resolvedSessionId };
        } catch (retryErr) {
          if (
            retryErr instanceof DailyLimitError ||
            retryErr instanceof SessionLimitError
          ) {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("reid:open-paywall"));
            }
          }
          return { ok: false, text: "", sessionId: resolvedSessionId };
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (authLoading) return;
    if (initialized.current) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    initialized.current = true;
    (async () => {
      setLastSessionAt(me.last_session_at ?? null);

      // Restore the active chat session id (if any) and load just its
      // messages. The onboarding session is excluded by virtue of the chat
      // session id being stored separately from the user id.
      const restored = getChatSessionId();
      if (restored) {
        setSessionId(restored);
        try {
          const res = await fetch(`/api/reid/history?limit=5`, {
            cache: "no-store",
          });
          if (res.ok) {
            const json = (await res.json()) as {
              sessions: SessionWithMessages[];
            };
            const current = json.sessions.find(
              (s) => s.session.id === restored,
            );
            if (current) {
              setMessages(
                current.messages.map((m) => ({
                  role: m.role,
                  content: m.content,
                })),
              );
            }
          }
        } catch {
          // History fetch is best-effort.
        }
      }

      setLoaded(true);
    })();
  }, [authLoading, me, router]);

  // Unmount keepalive: when the user navigates away from /chat without Reid
  // emitting [SESSION_COMPLETE], fire a best-effort POST to /api/sessions/
  // summarise so the session gets a summary instead of staying blank. The
  // server route is idempotent — if it's already summarised (sentinel path
  // or HMR double-fire), it returns early without calling Anthropic.
  //
  // Refs hold the latest sessionId and assistant-message presence so the
  // cleanup closure sees current values, not the values at mount. The firing
  // effect's deps are `[]` so it ONLY runs on mount/unmount.
  const sessionIdRef = useRef<string | null>(null);
  const hasAssistantMessageRef = useRef<boolean>(false);
  useEffect(() => {
    sessionIdRef.current = sessionId;
    hasAssistantMessageRef.current = messages.some(
      (m) => m.role === "assistant",
    );
  });
  useEffect(() => {
    return () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      if (!hasAssistantMessageRef.current) return;
      try {
        void fetch("/api/sessions/summarise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid }),
          keepalive: true,
        }).catch(() => {
          // Best-effort; the route is idempotent on retry.
        });
      } catch {
        // Best-effort; swallow.
      }
    };
    // Mount/unmount only — refs above carry the latest values into cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend(content: string) {
    if (!userId || isStreaming) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setIsStreaming(true);
    setStreamingText("");
    const result = await streamWithRetry(sessionId, nextMessages);

    // Persist the resolved sessionId (server may have minted a fresh one on
    // the first turn) before we touch the messages list so subsequent POSTs
    // pass the right id.
    if (result.sessionId && result.sessionId !== sessionId) {
      setSessionId(result.sessionId);
      setChatSessionId(result.sessionId);
    }

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

  const subtitle = lastSessionAt
    ? `Last session: ${formatLastSession(lastSessionAt)}`
    : "First session.";

  // VoiceButton needs the latest finalised Reid message (not the in-flight
  // streamingText, which would re-trigger TTS on every chunk for Pro users).
  // Falls back to "" so the button renders disabled until Reid speaks.
  const latestReidMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  })();

  const emptyState = (
    <div className="flex flex-col items-center text-center px-6">
      <LogoMark size={56} />
      <h2
        className="font-serif italic mt-6"
        style={{
          fontSize: 30,
          lineHeight: 1.2,
          color: "#F2EDE3",
          letterSpacing: "-0.01em",
        }}
      >
        Your co-founder is ready.
      </h2>
      <p
        className="font-sans mt-3"
        style={{ fontSize: 14, color: "#7A90A8" }}
      >
        Start talking.
      </p>
    </div>
  );

  // Header slot: prior-session messages followed by a session divider, then
  // the current session's messages flow below (rendered by ChatStream from
  // the messages prop). priorSessions is empty in this pass; the rendering
  // path is in place for when multi-session history loading is enabled.
  const headerSlot = priorSessions.length > 0 ? (
    <>
      {priorSessions.map(({ session, messages: msgs }) => (
        <div key={session.id} className="opacity-70">
          {msgs.map((m, i) => {
            if (m.role === "assistant") {
              return (
                <div key={m.id ?? `${session.id}-${i}`} className="mb-8">
                  <p
                    className="font-serif italic whitespace-pre-wrap max-w-[78%]"
                    style={{ fontSize: 20, lineHeight: 1.75, color: "#F2EDE3" }}
                  >
                    {m.content}
                  </p>
                </div>
              );
            }
            return (
              <div
                key={m.id ?? `${session.id}-${i}`}
                className="mb-8 flex justify-end"
              >
                <div className="user-bubble max-w-[62%]">
                  <p
                    className="font-sans whitespace-pre-wrap"
                    style={{ fontSize: 15, lineHeight: 1.6, color: "#C8D5E3" }}
                  >
                    {m.content}
                  </p>
                </div>
              </div>
            );
          })}
          <SessionDivider
            startedAt={session.started_at}
            messageCount={session.message_count}
          />
        </div>
      ))}
    </>
  ) : null;

  return (
    <div
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
        className="flex items-center justify-between gap-4"
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(242,237,232,0.06)",
        }}
      >
        <div className="flex items-baseline gap-4">
          <h1
            className="font-serif italic text-text-primary"
            style={{ fontSize: 20 }}
          >
            Reid
          </h1>
          <span className="font-sans" style={{ fontSize: 12, color: "#7A90A8" }}>
            {subtitle}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!isPro && me && (() => {
            const completed = me.session_count ?? 0;
            const displayed = Math.min(FREE_SESSIONS, completed + 1);
            const onLastFree = displayed >= FREE_SESSIONS;
            return (
              <span
                className="font-sans"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  color: onLastFree ? "#B91C1C" : "rgba(255,255,255,0.30)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                Session {displayed} of {FREE_SESSIONS}
              </span>
            );
          })()}
          <VoiceButton
            latestReidMessage={latestReidMessage}
            isPro={isPro}
            isStreaming={isStreaming}
          />
        </div>
      </header>
      {bootstrapError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="font-serif italic text-text-dim text-lg">
            Something went wrong.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-accent underline font-sans"
          >
            Try again
          </button>
        </div>
      ) : !loaded ? (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingTop: "80px",
            paddingBottom: "160px",
            paddingLeft: "24px",
            paddingRight: "24px",
          }}
        >
          {/* Message-shaped skeletons: Reid (left, wide) / user (right, pill) /
              Reid (left, narrower). Staggered so the eye reads them as a
              sequence of incoming bubbles. */}
          <div
            className="h-10 rounded-md bg-bg-card animate-skeleton mb-5"
            style={{ width: "78%", animationDelay: "0ms" }}
          />
          <div className="flex justify-end mb-5">
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
        <ChatStream
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          emptyState={emptyState}
          headerSlot={headerSlot}
        />
      )}
      {!isPro && me && (me.session_count ?? 0) + 1 >= FREE_SESSIONS && (
        <div
          className="fixed left-0 right-0 z-50 bottom-[calc(64px+env(safe-area-inset-bottom)+96px)] md:bottom-[96px] pointer-events-none"
          aria-live="polite"
        >
          <div
            className="mx-auto max-w-[720px] px-5 py-2 text-center"
            style={{
              background: "rgba(185,28,28,0.10)",
              borderTop: "1px solid rgba(185,28,28,0.25)",
              borderBottom: "1px solid rgba(185,28,28,0.25)",
              color: "#B91C1C",
              fontSize: 12,
              letterSpacing: "0.02em",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            This is your last free session.
          </div>
        </div>
      )}
      {!bootstrapError && (
        <ChatInput
          onSubmit={handleSend}
          disabled={isStreaming || !loaded}
          autofocus={loaded && messages.length === 0 && !isStreaming}
        />
      )}
    </div>
  );
}

function SessionDivider({
  startedAt,
  messageCount,
}: {
  startedAt: string;
  messageCount: number;
}) {
  return (
    <div className="my-6 flex items-center gap-3 text-text-dim text-xs uppercase tracking-wider">
      <div className="h-px flex-1 bg-text-dim/15" />
      <span>
        Session · {formatSessionDate(startedAt)} · {messageCount}{" "}
        {messageCount === 1 ? "message" : "messages"}
      </span>
      <div className="h-px flex-1 bg-text-dim/15" />
    </div>
  );
}
