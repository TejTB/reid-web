"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import ChatStream from "@/components/ChatStream";
import LogoMark from "@/components/LogoMark";
import ReidMark from "@/components/ReidMark";
import ReidWebOrb from "@/components/ReidWebOrb";
import { useAuth, useIsPro } from "@/components/AuthProvider";
import { streamReid, DailyLimitError, SessionLimitError, RateLimitError } from "@/lib/reid";
import RateLimitNotice from "@/components/RateLimitNotice";
import {
  getChatSessionId,
  setChatSessionId,
  clearChatSessionId,
} from "@/lib/session";
import { formatLastSession, formatSessionDate } from "@/lib/format";
import { useVoiceLoop, type ReidTurnOutcome } from "@/lib/useVoiceLoop";
import { useMounted } from "@/lib/use-mounted";
import { supabase } from "@/lib/supabase";
import { PromptInputBox } from "@/components/ui/prompt-input-box";
import { GlowCard } from "@/components/ui/glow-card";
import { ShiningText } from "@/components/ui/shining-text";
import { SessionRecapOverlay } from "@/components/SessionRecapOverlay";
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

// Voice-orb status → short caption beneath the orb. Error rows are keyed by
// the FSM error kind (voice.state.error) so each failure reads specifically;
// the live FSM status covers the rest.
const VOICE_CAPTION: Record<string, string> = {
  idle: "Tap to speak",
  recording: "Listening…",
  transcribing: "Got it…",
  speaking: "Reid is speaking",
  "mic-denied": "Mic access blocked",
  "no-mic": "No microphone found",
  unsupported: "Voice isn't supported here",
  network: "Something glitched — tap to retry",
  api: "Something glitched — tap to retry",
};

// Accessible action label for the orb button, by FSM status.
const ORB_TAP_LABEL: Record<string, string> = {
  idle: "Tap to speak",
  recording: "Stop recording",
  transcribing: "Processing",
  thinking: "Reid is thinking",
  speaking: "Stop playback",
  error: "Retry voice",
};

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
  // useSearchParams requires a Suspense boundary at the page level for the
  // App Router's static-export pass to succeed. Wrap the real component.
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Seed the composer input with `?prefill=` when present (used by the goals
  // page "Tell Reid about another goal" CTA). Read once on mount; we never
  // overwrite the user's typing after.
  const prefillFromUrl = useMemo(() => {
    const raw = searchParams?.get("prefill") ?? "";
    return raw.trim().length > 0 ? raw : undefined;
  }, [searchParams]);
  const { me, entitlement, refresh, loading: authLoading } = useAuth();
  const isPro = useIsPro();
  const userId = me?.id ?? "";
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Opening line — Reid speaks first on /chat mount. While `openingState` is
  // 'streaming' the page renders the deltas in the same bubble used for any
  // streamed assistant reply (ChatStream reads `streamingText`). On 'done'
  // the line is committed into `messages` so it persists into the first
  // /api/reid payload as the seed assistant turn. On 'failed' the empty
  // state takes over.
  const [openingState, setOpeningState] = useState<
    "idle" | "streaming" | "done" | "failed"
  >("idle");
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
  // When the server signals SESSION_END (SESSION_COMPLETE sentinel or
  // 20-message cap), we store the ended session's id so the recap overlay
  // can fetch its title/note. Cleared when the overlay closes / navigates.
  const [endedSessionId, setEndedSessionId] = useState<string | null>(null);
  // Voice-mode UI state. `voiceMode` is the surface switch (text composer ↔
  // voice orb); the turn-based loop itself lives in useVoiceLoop, whose FSM
  // status drives every in-surface visual (the orb). No SpeechRecognition.
  const [voiceMode, setVoiceMode] = useState(false);
  // Per-minute burst 429 notice: holds the turn to resend + the wait. Null when
  // not rate-limited. The notice offers a manual retry gated on a countdown —
  // never an automatic re-entry of the window.
  const [rateLimitNotice, setRateLimitNotice] = useState<{
    retryAfter: number;
    content: string;
    files?: File[];
  } | null>(null);
  const initialized = useRef(false);
  // In-flight guard for the opening-line fetch: dev StrictMode remounts (and
  // any future double-invocation) must not fire two /api/reid/opening POSTs.
  // Prod data shows no duplication (B1 verification) — this is belt-and-braces.
  const openingInFlight = useRef(false);

  const streamWithRetry = useCallback(
    async (
      currentSessionId: string | null,
      msgs: Message[],
    ): Promise<{
      ok: boolean;
      text: string;
      sessionId: string | null;
      walled: boolean;
      rateLimited: boolean;
      retryAfter: number;
    }> => {
      let acc = "";
      let resolvedSessionId: string | null = currentSessionId;
      const onSession = (sid: string) => {
        resolvedSessionId = sid;
      };
      const onActions = (types: string[]) => {
        setPendingActions(types);
      };
      const onSessionEnd = (sid: string) => {
        setEndedSessionId(sid);
      };
      try {
        for await (const chunk of streamReid(
          {
            mode: "chat",
            sessionId: currentSessionId,
            messages: msgs,
          },
          { onSession, onActions, onSessionEnd },
        )) {
          acc += chunk;
          setStreamingText(acc);
        }
        return {
          ok: true,
          text: acc,
          sessionId: resolvedSessionId,
          walled: false,
          rateLimited: false,
          retryAfter: 0,
        };
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
            walled: true,
            rateLimited: false,
            retryAfter: 0,
          };
        }
        // Paywall: 429 daily_limit_exceeded opens the upgrade modal and rolls
        // back the optimistic user turn — no retry.
        if (err instanceof DailyLimitError) {
          openPaywall("session_limit");
          setMessages((prev) => prev.slice(0, -1));
          setStreamingText("");
          return {
            ok: false,
            text: "",
            sessionId: resolvedSessionId,
            walled: true,
            rateLimited: false,
            retryAfter: 0,
          };
        }
        // Per-minute burst (429 rate_limit_exceeded): NO auto-retry — a retry
        // would just re-enter the open window. Roll back the optimistic turn
        // and report retryAfter so the caller can show a manual-retry notice
        // that only enables once the countdown elapses.
        if (err instanceof RateLimitError) {
          setMessages((prev) => prev.slice(0, -1));
          setStreamingText("");
          return {
            ok: false,
            text: "",
            sessionId: resolvedSessionId,
            walled: false,
            rateLimited: true,
            retryAfter: err.retryAfter,
          };
        }
        // Generic failure (network/5xx): NO auto-retry. Surface "send again"
        // (handled by the caller) and let the founder decide — a blind retry
        // usually fails again and just doubles latency + cost.
        setStreamingText("");
        return {
          ok: false,
          text: "",
          sessionId: resolvedSessionId,
          walled: false,
          rateLimited: false,
          retryAfter: 0,
        };
      }
    },
    [],
  );

  // Fetches /api/reid/opening and pipes the response body into
  // `streamingText` so ChatStream renders it as a live assistant bubble.
  // On success the opening line is committed into `messages` so the first
  // /api/reid POST naturally seeds the assistant turn into the session
  // transcript. On 204 / empty body / network error the empty-state CTA
  // takes over via the 'failed' branch.
  const streamOpeningLine = useCallback(async () => {
    if (openingInFlight.current) return;
    openingInFlight.current = true;
    setOpeningState("streaming");
    setStreamingText("");
    setIsStreaming(true);
    let acc = "";
    try {
      const res = await fetch("/api/reid/opening", {
        method: "POST",
        cache: "no-store",
      });
      if (res.status === 204 || !res.ok || !res.body) {
        setOpeningState("failed");
        setIsStreaming(false);
        setStreamingText("");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        acc += decoder.decode(value, { stream: true });
        setStreamingText(acc);
      }
      acc += decoder.decode();
      const trimmed = acc.trim();
      if (!trimmed) {
        setOpeningState("failed");
        setIsStreaming(false);
        setStreamingText("");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: trimmed },
      ]);
      setStreamingText("");
      setIsStreaming(false);
      setOpeningState("done");
    } catch {
      setOpeningState("failed");
      setIsStreaming(false);
      setStreamingText("");
    } finally {
      openingInFlight.current = false;
    }
  }, []);

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
      let restoredMessageCount = 0;
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
              const restoredMsgs = current.messages.map((m) => ({
                role: m.role,
                content: m.content,
              }));
              restoredMessageCount = restoredMsgs.length;
              setMessages(restoredMsgs);
            }
          }
        } catch {
          // History fetch is best-effort.
        }
      }

      // Reid speaks first. Only when no prior turns are on screen — otherwise
      // we'd inject a fresh opening on top of an in-progress conversation.
      // Flipping `openingState` to 'streaming' BEFORE `loaded` keeps the
      // skeleton up until ChatStream is ready to render the "thinking."
      // indicator — no empty-state flash in the gap.
      if (restoredMessageCount === 0) {
        setOpeningState("streaming");
        setIsStreaming(true);
        setStreamingText("");
        setLoaded(true);
        await streamOpeningLine();
      } else {
        setLoaded(true);
      }
    })();
  }, [authLoading, me, router, streamOpeningLine]);

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
  // Latest messages, read by runReidTurn (voice loop) so it appends to current
  // state with no stale closure — mirrors streamWithRetry's stateless design.
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    sessionIdRef.current = sessionId;
    messagesRef.current = messages;
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
    setRateLimitNotice(null);
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

    if (result.rateLimited) {
      // Burst limiter: streamWithRetry already rolled back the optimistic turn.
      // Stash this exact turn so the manual-retry notice can re-send it once
      // the countdown clears. No auto-retry.
      setRateLimitNotice({ retryAfter: result.retryAfter, content, files });
      setStreamingText("");
      setIsStreaming(false);
      return;
    }

    if (!result.ok) {
      // On a wall (402/429) streamWithRetry already rolled back the optimistic
      // turn and opened the paywall — don't also append a generic error bubble.
      if (!result.walled) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "My end's jammed. Send it again." },
        ]);
      }
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

  // ---- Voice mode: the turn-based loop ------------------------------------
  // useVoiceLoop owns mic capture, /api/transcribe, the Reid turn, and TTS
  // playback, driven by the voice FSM. The chat page only injects the turn
  // runner (reusing the existing /api/reid pipeline — never a second one), a
  // live session-id getter, and an access-token getter; it consumes the FSM
  // status to drive the orb. Replaces the old in-browser SpeechRecognition
  // path, which was unreliable on iOS Safari.

  // Runs ONE Reid turn for a voice transcript through the SAME send/stream
  // pipeline as text mode and reports the outcome back to the FSM. Reads the
  // latest messages / session id via refs so there's no stale closure.
  const runReidTurn = useCallback(
    async (transcript: string): Promise<ReidTurnOutcome> => {
      const userMessage: Message = { role: "user", content: transcript };
      const nextMessages: Message[] = [...messagesRef.current, userMessage];
      setMessages(nextMessages);
      setPendingActions([]);
      setIsStreaming(true);
      setStreamingText("");
      const result = await streamWithRetry(sessionIdRef.current, nextMessages);
      if (result.sessionId && result.sessionId !== sessionIdRef.current) {
        setSessionId(result.sessionId);
        setChatSessionId(result.sessionId);
      }
      setStreamingText("");
      setIsStreaming(false);
      // Wall (reid 402 / daily 429): streamWithRetry already rolled back the
      // optimistic turn and opened the paywall — the FSM just unwinds to idle.
      if (result.walled) return { replyText: "", walled: true, failed: false };
      // Non-paywall failure → drives the orb's error state.
      if (!result.ok) return { replyText: "", walled: false, failed: true };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.text },
      ]);
      return { replyText: result.text, walled: false, failed: false };
    },
    [streamWithRetry],
  );

  // Supabase access token for authing the /api/transcribe POST (mirrors the
  // bearer attach in fetchAndPlay). Null when there's no session.
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    } catch {
      return null;
    }
  }, []);

  const voice = useVoiceLoop({
    runReidTurn,
    getSessionId: () => sessionIdRef.current,
    getAccessToken,
  });
  // Hydration gate for every render branch keyed on voice.isSupported —
  // detectVoiceSupport() is false on the server and true on capable clients,
  // so ungated branches mismatch on hydration (Sprint 13 Build 4 fix).
  const mounted = useMounted();
  const voiceSupported = mounted && voice.isSupported;

  // Hard-reset the loop whenever voice mode is dismissed (also covers leaving
  // /chat — useVoiceLoop runs its own unmount teardown). cancel() aborts any
  // capture / playback / fetch and returns the FSM to idle; a no-op when idle.
  const voiceCancel = voice.cancel;
  useEffect(() => {
    if (!voiceMode) voiceCancel();
  }, [voiceMode, voiceCancel]);

  const exitVoiceMode = useCallback(() => {
    setVoiceMode(false);
  }, []);

  // Responsive orb diameter for the voice shell — generous, but always within
  // the viewport and capped so it stays a focal object rather than a wall.
  // Recomputed on resize / orientation change.
  const [orbSize, setOrbSize] = useState(280);
  useEffect(() => {
    const calc = () => {
      const minEdge = Math.min(window.innerWidth, window.innerHeight);
      setOrbSize(Math.max(200, Math.min(300, Math.round(minEdge * 0.62))));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // The orb IS the control. Tap semantics by FSM status: idle → start a turn;
  // recording → stop capture early; speaking → cancel playback (→ idle);
  // recoverable error → retry (the FSM maps START from a recoverable error
  // back to recording). transcribing / thinking are busy and the button is
  // disabled, so those taps never reach here; 'unsupported' is terminal.
  const voiceStatus = voice.state.status;
  const onOrbTap = useCallback(() => {
    if (voiceStatus === "idle") {
      voice.start();
    } else if (voiceStatus === "recording") {
      voice.stopRecording();
    } else if (voiceStatus === "speaking") {
      voice.cancel();
    } else if (voiceStatus === "error" && voice.state.error !== "unsupported") {
      voice.start();
    }
  }, [voice, voiceStatus]);

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
    <>
    {endedSessionId && (
      <SessionRecapOverlay
        sessionId={endedSessionId}
        onClose={() => {
          setEndedSessionId(null);
          // The session is over: drop the stored id (the server refuses
          // closed sessions anyway), clear the transcript, and let Reid
          // speak first in the NEXT session — its opener now has the
          // just-written summary in context. Without the clear, the next
          // send would carry the old transcript into a fresh session.
          clearChatSessionId();
          setSessionId(null);
          setMessages([]);
          setOpeningState("streaming");
          setIsStreaming(true);
          setStreamingText("");
          void streamOpeningLine();
          // 1e: the just-ended session is now counted; refresh the entitlement
          // seam at the open of the NEXT session (0 messages) so the pill
          // reflects prior sessions only. Never refreshed mid-session, so the
          // count can't creep toward the wall while the user is talking.
          void refresh();
        }}
      />
    )}
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        // Voice mode is an orb-only, near-black surface; text mode is the
        // normal chat bg. Crossfade so the toggle feels like one surface.
        background: voiceMode ? "#050810" : "#0A1628",
        transition: "background 320ms ease",
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
          {!isPro && entitlement && (() => {
            // Display only — never authorization. The seam reflects PRIOR
            // sessions (refreshed at session open, 0 messages), so the
            // in-flight session is the (used + 1)-th. The wall itself is the
            // server 402 at session-3 creation, not this number.
            const { sessionsUsed, allowance } = entitlement;
            const displayed = Math.min(allowance, sessionsUsed + 1);
            const onLastFree = displayed >= allowance;
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
                Session {displayed} of {entitlement.allowance}
              </span>
            );
          })()}
          {/* Discreet chat↔voice toggle. Shows the destination mode's icon:
              the circular ReidMark to enter voice (Pro-gated via handleMicClick,
              which opens the paywall for free users), a chat bubble to return to
              text. Hidden in text mode when voice isn't supported here. */}
          {(voiceMode || voiceSupported) && (
            <button
              type="button"
              onClick={voiceMode ? exitVoiceMode : handleMicClick}
              aria-label={voiceMode ? "Switch to text chat" : "Switch to voice"}
              title={voiceMode ? "Switch to text chat" : "Switch to voice"}
              className="flex items-center justify-center rounded-full p-1 text-white/30 transition-colors hover:text-white/60 outline-none focus-visible:ring-2 focus-visible:ring-[#8E1616]/50"
            >
              {voiceMode ? (
                <MessageSquare className="h-5 w-5" aria-hidden />
              ) : (
                <ReidMark size={22} />
              )}
            </button>
          )}
        </div>
      </header>
      {voiceMode ? (
        // Voice-mode shell: ChatStream is hidden entirely (not dimmed). The orb
        // IS the control, centered with generous space; the bottom input strip
        // is removed below while voiceMode is on. Exit is via the header toggle.
        <motion.div
          key="voice-shell"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex-1 flex flex-col items-center justify-center"
          style={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
          }}
        >
          {/* The orb IS the control: a tap target whose visual is the
              FSM-driven ReidWebOrb (WebGL, audio-free). Disabled while busy
              (transcribing / thinking) and when voice is terminally unsupported. */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onOrbTap}
            disabled={
              voiceStatus === "transcribing" ||
              voiceStatus === "thinking" ||
              (voiceStatus === "error" &&
                voice.state.error === "unsupported")
            }
            aria-label={ORB_TAP_LABEL[voiceStatus]}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#8E1616]/50 disabled:cursor-default"
          >
            <ReidWebOrb status={voiceStatus} size={orbSize} />
          </motion.button>
          <AnimatePresence mode="wait">
            <motion.div
              key={voiceStatus}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-10 flex min-h-[1.25rem] items-center justify-center"
            >
              {voiceStatus === "thinking" ? (
                <ShiningText text="thinking." />
              ) : (
                <span className="text-white/50 text-sm font-sans">
                  {VOICE_CAPTION[
                    voiceStatus === "error"
                      ? voice.state.error ?? "api"
                      : voiceStatus
                  ]}
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      ) : bootstrapError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="font-serif italic text-text-dim text-lg">
            My end is jammed.
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
          // Only surface the empty-state CTA once the opening attempt has
          // resolved one way or the other — never during 'streaming' (the
          // thinking indicator owns the screen) and never on 'done' (the
          // opening line is now in `messages`, so empty-state wouldn't show
          // anyway, but make the intent explicit).
          emptyState={
            openingState === "idle" || openingState === "failed"
              ? emptyState
              : undefined
          }
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
      {!isPro && entitlement && entitlement.sessionsUsed + 1 >= entitlement.allowance && (
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
      {rateLimitNotice && (
        <RateLimitNotice
          retryAfter={rateLimitNotice.retryAfter}
          onRetry={() => {
            const pending = rateLimitNotice;
            setRateLimitNotice(null);
            void handleSend(pending.content, pending.files);
          }}
          onDismiss={() => setRateLimitNotice(null)}
        />
      )}
      {!bootstrapError && !voiceMode && (
        <div className="fixed left-0 right-0 z-50 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0 px-4 pb-4 pt-2">
          <div className="mx-auto max-w-[720px]">
            <motion.div
              key="text-mode"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <PromptInputBox
                onSend={handleSend}
                isLoading={isStreaming || !loaded}
                placeholder="What's the situation?"
                initialValue={prefillFromUrl}
                onMicClick={voiceSupported ? handleMicClick : undefined}
                inlineBadge={
                  !isPro && voiceSupported ? (
                    <ShiningText text="PRO" />
                  ) : undefined
                }
              />
            </motion.div>
          </div>
        </div>
      )}
    </div>
    </>
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
