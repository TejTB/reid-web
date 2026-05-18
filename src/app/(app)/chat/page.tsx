"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Mic } from "lucide-react";
import ChatStream from "@/components/ChatStream";
import LogoMark from "@/components/LogoMark";
import { useAuth, useIsPro } from "@/components/AuthProvider";
import { streamReid, DailyLimitError, SessionLimitError } from "@/lib/reid";
import { getChatSessionId, setChatSessionId } from "@/lib/session";
import { FREE_SESSIONS } from "@/lib/session-shared";
import { formatLastSession, formatSessionDate } from "@/lib/format";
import { fetchAndPlay, type TtsPlaybackHandle } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { PromptInputBox } from "@/components/ui/prompt-input-box";
import { GlowCard } from "@/components/ui/glow-card";
import { ShiningText } from "@/components/ui/shining-text";
import type { Message } from "@/types/chat";
import type { Message as DbMessage, Session as DbSession } from "@/types/db";

// Context-aware dispatcher for the global PaywallModal. The modal reads
// `detail.context` to pick the right copy: voice gate → "Voice is Reid Pro.",
// session cap → "That's your N sessions.", everything else → the default
// pricing copy. Centralised here so every trigger in /chat is consistent.
type PaywallContext = "voice" | "session_limit" | "default";
function openPaywall(context: PaywallContext) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("reid:open-paywall", { detail: { context } }),
  );
}

// Action-card config: maps the server's REID_ACTIONS trailer types to the
// label + destination + accent the chat page renders after a streamed turn.
// Unknown types are ignored (return null in the render path).
const ACTION_CONFIG: Record<
  string,
  { label: string; link: string; colour: string }
> = {
  observation_created: {
    label: "Reid noticed something",
    link: "/observations",
    colour: "#B91C1C",
  },
  task_assigned: {
    label: "New task assigned",
    link: "/tasks",
    colour: "#B91C1C",
  },
  goal_updated: {
    label: "Goal updated",
    link: "/goals",
    colour: "#16a34a",
  },
  plan_updated: {
    label: "Plan updated",
    link: "/plan",
    colour: "#B91C1C",
  },
};

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

// SpeechRecognition is a vendor-prefixed web API with no widely-shipped TS
// lib. Narrow the bits we touch so the rest of the file stays type-safe.
interface SpeechRecognitionResultPiece {
  transcript: string;
}
interface SpeechRecognitionResultRow {
  0: SpeechRecognitionResultPiece;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultRow>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ---- Voice-mode inline visuals --------------------------------------------
// ListeningBars / SpeakingBars are tiny equaliser-style indicators. They live
// here (not in a shared file) because they're only used by the voice mode
// surface on this page.
function ListeningBars() {
  return (
    <div className="flex items-end gap-1 h-6" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-white/70"
          initial={{ height: 6 }}
          animate={{ height: [6, 22, 10, 18, 8] }}
          transition={{
            repeat: Infinity,
            duration: 0.9,
            ease: "easeInOut",
            delay: i * 0.08,
          }}
        />
      ))}
    </div>
  );
}

function SpeakingBars() {
  return (
    <div className="flex items-end gap-1 h-6" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-[#B91C1C]"
          initial={{ height: 4 }}
          animate={{ height: [4, 18, 8, 22, 6] }}
          transition={{
            repeat: Infinity,
            duration: 0.7,
            ease: "easeInOut",
            delay: i * 0.06,
          }}
        />
      ))}
    </div>
  );
}

// ---- File -> base64 data URL ----------------------------------------------
// Used by handleSend when the PromptInputBox attached one or more images.
// Each file is read via FileReader and resolved as the result data URL.
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("FileReader returned non-string"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

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
  // Sentinel actions emitted by the server after a streamed turn — drives the
  // post-stream notification cards (observation_created, goal_updated, ...).
  // Cleared at the start of every new send.
  const [pendingActions, setPendingActions] = useState<string[]>([]);
  // Voice-mode UI state. The toggle only renders when SpeechRecognition is
  // available; `voiceState` drives the bars / mic indicator.
  const [speechSupported] = useState<boolean>(() => getSpeechRecognitionCtor() !== null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const ttsHandleRef = useRef<TtsPlaybackHandle | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  // True when the next finalised assistant message should be auto-spoken
  // because the user just submitted via voice. Cleared once playback starts.
  const speakNextRef = useRef(false);
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
      const onActions = (types: string[]) => {
        setPendingActions(types);
      };
      try {
        for await (const chunk of streamReid(
          {
            mode: "chat",
            sessionId: currentSessionId,
            messages: msgs,
          },
          { onSession, onActions },
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
          openPaywall("session_limit");
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
          openPaywall("session_limit");
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
            { onSession, onActions },
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
            openPaywall("session_limit");
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

  async function handleSend(content: string, files?: File[]) {
    if (!userId || isStreaming) return;
    // Convert any attached image files to base64 data URLs before we kick off
    // the stream. The /api/reid route accepts these in Message.images[]. If
    // any read fails we drop just that file and proceed with the rest — the
    // user's text is the load-bearing part of the turn.
    let images: string[] | undefined;
    if (files && files.length > 0) {
      try {
        const settled = await Promise.allSettled(files.map(readFileAsDataUrl));
        const ok = settled
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map((r) => r.value);
        if (ok.length > 0) images = ok;
      } catch {
        // Defensive: Promise.allSettled never throws, but if FileReader is
        // unavailable we'd rather send the text alone than block the user.
      }
    }
    const userMessage: Message = images
      ? { role: "user", content, images }
      : { role: "user", content };
    const nextMessages: Message[] = [...messages, userMessage];
    setMessages(nextMessages);
    setPendingActions([]);
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

  // ---- Voice mode handlers ------------------------------------------------
  // The mic toggle starts a one-shot SpeechRecognition session, transcribes
  // the user's speech, and routes the transcript through handleSend. For Pro
  // users in voice mode we then auto-play Reid's reply via fetchAndPlay.

  // Stop any active recognition / TTS when voice mode is dismissed.
  useEffect(() => {
    if (voiceMode) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (ttsHandleRef.current) {
      ttsHandleRef.current.stop();
      ttsHandleRef.current = null;
    }
    setVoiceState("idle");
    speakNextRef.current = false;
  }, [voiceMode]);

  // Final unmount tear-down (covers leaving /chat while voice mode is on).
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (ttsAbortRef.current) ttsAbortRef.current.abort();
      if (ttsHandleRef.current) ttsHandleRef.current.stop();
    };
  }, []);

  const handleVoiceTap = useCallback(() => {
    if (!voiceMode) return;
    // Tapping while speaking stops playback and returns to idle.
    if (voiceState === "speaking") {
      if (ttsHandleRef.current) {
        ttsHandleRef.current.stop();
        ttsHandleRef.current = null;
      }
      if (ttsAbortRef.current) {
        ttsAbortRef.current.abort();
        ttsAbortRef.current = null;
      }
      setVoiceState("idle");
      return;
    }
    // Tapping while listening aborts the current recognition attempt.
    if (voiceState === "listening") {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      setVoiceState("idle");
      return;
    }
    // Idle → start a fresh recognition session.
    if (voiceState !== "idle") return;
    if (isStreaming) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        const row = e.results[i];
        if (row.isFinal) transcript += row[0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;
      // Mark the next assistant message as one to auto-speak, flip to
      // thinking state, and dispatch through the normal chat pipeline.
      speakNextRef.current = true;
      setVoiceState("thinking");
      void handleSend(transcript);
    };
    rec.onerror = () => {
      setVoiceState("idle");
      recognitionRef.current = null;
    };
    rec.onend = () => {
      // If no result fired we'll be left in "listening" — drop back to idle.
      // If a result did fire, voiceState is already "thinking".
      setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    setVoiceState("listening");
    try {
      rec.start();
    } catch {
      // start() can throw if mic permission is denied or already started.
      setVoiceState("idle");
      recognitionRef.current = null;
    }
    // handleSend is stable enough for our purposes — it reads the latest
    // messages from state via setMessages closures internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode, voiceState, isStreaming]);

  // After a streamed turn finishes in voice mode for a Pro user, auto-play
  // the assistant message via /api/tts. Free users in voice mode get the
  // thinking → idle transition without playback — voice playback is gated
  // on Pro everywhere in /chat.
  const latestAssistantContent = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  })();
  useEffect(() => {
    if (!voiceMode) return;
    if (isStreaming) return;
    if (!speakNextRef.current) return;
    if (!latestAssistantContent) return;
    speakNextRef.current = false;
    if (!isPro) {
      // Free users can't auto-play in voice mode — drop to idle so the user
      // can tap to speak again.
      setVoiceState("idle");
      return;
    }
    const ac = new AbortController();
    ttsAbortRef.current = ac;
    setVoiceState("speaking");
    void fetchAndPlay({
      text: latestAssistantContent,
      preview: false,
      signal: ac.signal,
      onEnded: () => {
        if (ttsAbortRef.current !== ac) return;
        ttsAbortRef.current = null;
        ttsHandleRef.current = null;
        setVoiceState("idle");
      },
    }).then(({ result, handle }) => {
      if (result.ok && handle) {
        ttsHandleRef.current = handle;
      } else {
        ttsAbortRef.current = null;
        ttsHandleRef.current = null;
        setVoiceState("idle");
      }
    });
  }, [voiceMode, isStreaming, latestAssistantContent, isPro]);

  const subtitle = lastSessionAt
    ? `Last session: ${formatLastSession(lastSessionAt)}`
    : "First session.";

  // Mic button gate: free users hit the voice paywall; Pro users enter voice
  // mode immediately. The PromptInputBox renders a mic icon whenever its
  // input is empty and onMicClick is set, so this is the single entry point
  // for voice from the input bar.
  const handleMicClick = useCallback(() => {
    if (!isPro) {
      openPaywall("voice");
      return;
    }
    setVoiceMode(true);
  }, [isPro]);

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
          suppressThinking={voiceMode}
        />
      )}
      {/* Post-stream action notification cards. Rendered between the chat
          stream and the input wrapper so they sit just above the latest
          message, below the input bar's visual stack. Each card maps a
          REID_ACTIONS trailer type to a labelled GlowCard link. */}
      {!isStreaming && pendingActions.length > 0 && (
        <div className="pointer-events-none fixed left-0 right-0 z-40 bottom-[calc(64px+env(safe-area-inset-bottom)+120px)] md:bottom-[120px] px-4">
          <div className="mx-auto flex max-w-[720px] flex-col gap-2 pointer-events-auto">
            {pendingActions.map((type) => {
              const cfg = ACTION_CONFIG[type];
              if (!cfg) return null;
              return (
                <motion.div
                  key={type}
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <GlowCard customSize glowColor="red" className="w-full">
                    <div className="px-4 py-3 flex items-center justify-between bg-[#111111] rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full animate-pulse"
                          style={{ background: cfg.colour }}
                        />
                        <span className="text-white/60 text-xs font-sans">
                          {cfg.label}
                        </span>
                      </div>
                      <Link
                        href={cfg.link}
                        className="text-[#B91C1C] text-xs hover:text-white transition-colors font-sans"
                      >
                        View →
                      </Link>
                    </div>
                  </GlowCard>
                </motion.div>
              );
            })}
          </div>
        </div>
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
        <div className="fixed left-0 right-0 z-50 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0 px-4 pb-4 pt-2">
          <div className="mx-auto max-w-[720px]">
            <AnimatePresence mode="wait">
              {voiceMode ? (
                <motion.div
                  key="voice-mode"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="flex flex-col items-center justify-center pb-2 pt-2 gap-6"
                >
                  <AnimatePresence mode="wait">
                    {voiceState === "speaking" ? (
                      <motion.div
                        key="reid-speaking"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-3"
                      >
                        <SpeakingBars />
                        <span className="text-white/60 text-xs font-sans">
                          Reid is speaking
                        </span>
                      </motion.div>
                    ) : voiceState === "thinking" ? (
                      <motion.div
                        key="thinking"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <span className="inline-block h-2 w-2 rounded-full bg-[#B91C1C] animate-pulse" />
                        <ShiningText text="thinking." />
                      </motion.div>
                    ) : voiceState === "listening" ? (
                      <motion.div
                        key="listening"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-3"
                      >
                        <ListeningBars />
                        <span className="text-white/60 text-xs font-sans">
                          Listening...
                        </span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-white/20 text-xs font-sans"
                      >
                        Tap to speak
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={handleVoiceTap}
                    disabled={voiceState === "thinking" || isStreaming}
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full border transition-colors",
                      voiceState === "listening"
                        ? "border-white/40 bg-white/10 text-white"
                        : voiceState === "speaking"
                          ? "border-[#B91C1C]/60 bg-[#B91C1C]/20 text-[#B91C1C]"
                          : voiceState === "thinking"
                            ? "border-white/10 bg-white/5 text-white/30"
                            : "border-white/15 bg-white/5 text-white/60 hover:text-white",
                    )}
                    aria-label={
                      voiceState === "listening"
                        ? "Stop listening"
                        : voiceState === "speaking"
                          ? "Stop playback"
                          : "Tap to speak"
                    }
                  >
                    <Mic className="h-6 w-6" />
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => setVoiceMode(false)}
                    className="text-white/20 text-xs hover:text-white/40 font-sans"
                  >
                    Switch to text
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="text-mode"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                >
                  <PromptInputBox
                    onSend={handleSend}
                    isLoading={isStreaming || !loaded}
                    placeholder="Say something..."
                    onMicClick={speechSupported ? handleMicClick : undefined}
                    inlineBadge={
                      !isPro && speechSupported ? (
                        <ShiningText text="PRO" />
                      ) : undefined
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
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
