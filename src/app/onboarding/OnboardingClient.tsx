"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import ReidMark from "@/components/ReidMark";
import ReidWebOrb from "@/components/ReidWebOrb";
import ChatStream from "@/components/ChatStream";
import { PromptInputBox } from "@/components/ui/prompt-input-box";
import { ShiningText } from "@/components/ui/shining-text";
import { useAuth } from "@/components/AuthProvider";
import { streamReid, RateLimitError } from "@/lib/reid";
import { parseOnboardingClose } from "@/lib/reid-summary";
import RateLimitNotice from "@/components/RateLimitNotice";
import { useVoiceLoop } from "@/lib/useVoiceLoop";
import {
  fetchAndPlay,
  unlockAudioContext,
  type TtsPlaybackHandle,
} from "@/lib/voice";
import { supabase } from "@/lib/supabase";
import { useMounted } from "@/lib/use-mounted";
import {
  deriveOrbStatus,
  shouldRedirectAfterCompletion,
  toReidTurnOutcome,
  type ColdOpenPhase,
  type OnboardingStreamResult,
} from "@/lib/onboarding-voice";
import type { Message } from "@/types/chat";

// Sprint 13 Build 1 — onboarding IS the orb experience.
//
// One continuous surface on the voice shell (#050810): the orb sits idle with
// a Playfair invite; the first tap unlocks the AudioContext (in-gesture, iOS),
// streams Reid's opener through the SAME /api/reid onboarding pipeline, and
// plays it through the existing Web Audio chain — Reid speaks first. From
// there every turn runs through useVoiceLoop exactly as /chat does. Mic
// permission is requested by useVoiceLoop inside the first RECORD tap's
// gesture (never on page load).
//
// Text is a first-class escape hatch, not a parallel build: "Type instead" is
// always visible, mic-denied/no-mic/unsupported fall back by DERIVATION (the
// rendered mode is computed from the user's choice + live voice availability,
// never synced via effects), and both paths share one messages[] history and
// ONE completion path — the server strips [ONBOARDING_COMPLETE], flips
// users.onboarding_complete, seeds goals + onboarding_summary, and this
// client redirects to /home (the "Reid remembered" proof moment). The
// redirect defers until Reid's final spoken line finishes
// (shouldRedirectAfterCompletion).
//
// The session id from X-Reid-Session-Id is threaded into every subsequent
// turn. That is load-bearing three ways: /api/transcribe reads the session's
// mode for the onboarding voice-cap exemption, /api/tts excludes the live
// session from the entitlement count, and the server's 14/22/26 onboarding
// ladder keys off the session row's message_count — without the id each turn
// would mint a fresh row and the force-complete backstop could never fire.

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

// Orb caption per derived status / FSM error kind. Onboarding copy: Reid is
// meeting the founder for the first time, so `idle` reads as a reply prompt
// (the pre-tap invite is the Playfair line, not this caption).
const ORB_CAPTION: Record<string, string> = {
  idle: "Tap to reply",
  recording: "Listening…",
  transcribing: "Got it…",
  speaking: "Reid is speaking",
  "mic-denied": "Mic access blocked — let's type",
  "no-mic": "No microphone found — let's type",
  unsupported: "Voice isn't supported here — let's type",
  network: "Something glitched — tap to retry",
  api: "Something glitched — tap to retry",
};

// Accessible action label for the orb button, by derived status.
const ORB_TAP_LABEL: Record<string, string> = {
  idle: "Tap to reply",
  recording: "Stop recording",
  transcribing: "Processing",
  thinking: "Reid is thinking",
  speaking: "Stop playback",
  error: "Retry voice",
};

type InputMode = "voice" | "text";

/** localStorage key for the live onboarding session id. Mirrors
 *  `reid:chatSessionId` (lib/session.ts); also cleared by signOut. */
const ONBOARDING_SESSION_KEY = "reid:onboardingSessionId";

export default function OnboardingClient() {
  const router = useRouter();
  const { me, loading: authLoading, refresh } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  // Armed the moment the server flips onboarding_complete (or the defensive
  // client sentinel fires). The actual redirect + fade are DERIVED from this
  // plus the playback state, so Reid's final line is never cut off.
  const [completionPending, setCompletionPending] = useState(false);
  // Per-minute burst 429 notice (text path). Manual retry only, gated on a
  // countdown — no auto re-entry. Onboarding is cap-exempt server-side, so
  // this is defensive.
  const [rateLimitNotice, setRateLimitNotice] = useState<{
    retryAfter: number;
    seed: Message[];
  } | null>(null);
  // The founder's CHOICE of surface. What actually renders is `effectiveMode`
  // below — voice degrades to text by derivation when the platform or mic
  // makes voice unavailable.
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [coldOpen, setColdOpen] = useState<ColdOpenPhase>("pending");
  const mounted = useMounted();

  const completionTriggered = useRef(false);
  const redirectStarted = useRef(false);
  const openerStarted = useRef(false);
  const coldOpenHandleRef = useRef<TtsPlaybackHandle | null>(null);
  const coldOpenAbortRef = useRef<AbortController | null>(null);
  // The live onboarding session id (X-Reid-Session-Id), read by every
  // subsequent turn, /api/transcribe, and /api/tts. A ref (not state): it's
  // consumed inside async closures and getters, never rendered. Persisted to
  // localStorage (B1.4) so a reload mid-onboarding resumes the SAME session —
  // ref-only threading minted a new session row per visit, which reset the
  // close ladder every return and left users onboarding_complete=false
  // forever. Cleared on completion and on signOut.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (sessionIdRef.current) return;
    try {
      const stored = localStorage.getItem(ONBOARDING_SESSION_KEY);
      if (stored) sessionIdRef.current = stored;
    } catch {
      // localStorage unavailable — ref-only threading still works.
    }
  }, []);
  // Latest messages / rendered mode for async closures — no stale captures.
  const messagesRef = useRef<Message[]>(messages);
  const effectiveModeRef = useRef<InputMode>("voice");

  // ---- completion (ONE path for voice + text) -------------------------------
  const markCompleted = useCallback(() => {
    if (completionTriggered.current) return;
    completionTriggered.current = true;
    setCompletionPending(true);
  }, []);

  // ---- the ONE stream runner (text + voice + cold open) --------------------
  // Wraps streamReid mode:"onboarding" with session-id threading and the
  // opener quote-stripping. Appends Reid's reply to messages[] on success;
  // failure UI is the CALLER's job (text shows a bubble/notice, voice routes
  // through the FSM error state).
  const runOnboardingStream = useCallback(
    async (
      seed: Message[],
    ): Promise<OnboardingStreamResult & { retryAfter?: number }> => {
      const isOpener = seed.length === 0;
      const display = (s: string) => (isOpener ? stripLeadingQuote(s) : s);
      setRateLimitNotice(null);
      setIsStreaming(true);
      setStreamingText("");
      let acc = "";
      try {
        for await (const chunk of streamReid(
          {
            mode: "onboarding",
            messages: seed,
            sessionId: sessionIdRef.current,
          },
          {
            onSession: (id) => {
              sessionIdRef.current = id;
              try {
                localStorage.setItem(ONBOARDING_SESSION_KEY, id);
              } catch {
                // best-effort persistence
              }
            },
          },
        )) {
          acc += chunk;
          setStreamingText(display(acc));
        }
      } catch (err) {
        setStreamingText("");
        setIsStreaming(false);
        if (err instanceof RateLimitError) {
          return {
            ok: false,
            text: "",
            rateLimited: true,
            retryAfter: err.retryAfter,
          };
        }
        return { ok: false, text: "", rateLimited: false };
      }

      // The server strips sentinels from the stream before they reach us, so
      // parseOnboardingClose(acc) reports hasSentinel=false on fresh traffic.
      // Kept as a defensive fallback for any path that bypasses the filter.
      const close = parseOnboardingClose(acc);
      const cleaned = close.hasSentinel ? close.body : acc;
      const finalContent = isOpener ? stripWrappingQuotes(cleaned) : cleaned;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalContent },
      ]);
      setStreamingText("");
      setIsStreaming(false);

      // Server-side completion signal: refresh the auth context so the
      // me.onboarding_complete effect below arms the redirect. Best-effort —
      // the client sentinel fallback covers a failed refresh.
      try {
        await refresh();
      } catch {
        // best-effort
      }
      if (close.hasSentinel) markCompleted();

      return { ok: true, text: finalContent, rateLimited: false };
    },
    [refresh, markCompleted],
  );

  // Drive completion off the refreshed `me` — the server flips
  // users.onboarding_complete the moment it sees [ONBOARDING_COMPLETE].
  // Gated on openerStarted: completion may only be EARNED here after this
  // session ran a turn. Without the gate, a stale `me` from a previously
  // signed-in account (shared browser, fresh signup) arms the completion
  // fade for a brand-new user at mount. Arrived-already-complete users are
  // the auth gate's job below, not this effect's.
  useEffect(() => {
    if (me?.onboarding_complete && openerStarted.current) markCompleted();
  }, [me?.onboarding_complete, markCompleted]);

  // ---- voice loop (pure composition of the existing stack) -----------------
  const runReidTurn = useCallback(
    async (transcript: string) => {
      const nextMessages: Message[] = [
        ...messagesRef.current,
        { role: "user", content: transcript },
      ];
      setMessages(nextMessages);
      const r = await runOnboardingStream(nextMessages);
      return toReidTurnOutcome(r);
    },
    [runOnboardingStream],
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
  const voiceStatus = voice.state.status;
  const orbStatus = deriveOrbStatus(coldOpen, voiceStatus);

  // ---- derived surface state -------------------------------------------------
  // Voice availability is DERIVED, never synced: before mount it's assumed
  // available (matching SSR markup), after mount the platform + FSM error
  // state decide. mic-denied / no-mic / unsupported all degrade to text.
  const micBlocked =
    voiceStatus === "error" &&
    (voice.state.error === "mic-denied" ||
      voice.state.error === "no-mic" ||
      voice.state.error === "unsupported");
  const voiceUnavailable = (mounted && !voice.isSupported) || micBlocked;
  const effectiveMode: InputMode =
    inputMode === "voice" && !voiceUnavailable ? "voice" : "text";
  // One-line notice above the composer when voice DEGRADED to text (the
  // founder chose voice but can't have it) — never when they chose text.
  const micFallbackNotice =
    inputMode === "voice" && voiceUnavailable
      ? (ORB_CAPTION[
          micBlocked ? (voice.state.error as string) : "unsupported"
        ] ?? ORB_CAPTION.unsupported)
      : null;

  useEffect(() => {
    messagesRef.current = messages;
    effectiveModeRef.current = effectiveMode;
  });

  // Whether the founder may leave NOW: completion armed and no playback in
  // flight or owed. Both the fade and the redirect derive from this — there
  // is no isCompleting state to keep in sync.
  const isCompleting = shouldRedirectAfterCompletion({
    completionPending,
    coldOpen,
    fsmStatus: voiceStatus,
  });

  // ---- the /home handoff -----------------------------------------------------
  // 600ms fade, then go. Deliberately NO fire-once ref here: an effect re-run
  // (Fast Refresh in dev re-mounts effects; cleanup clears the timeout) must
  // RE-schedule, or the founder strands on a faded /onboarding. Re-scheduling
  // is idempotent — the replace navigates away and unmount clears the timer.
  useEffect(() => {
    if (!isCompleting) return;
    // Onboarding is done — the stored session id must not leak into a future
    // visit (the server would refuse the closed session anyway).
    try {
      localStorage.removeItem(ONBOARDING_SESSION_KEY);
    } catch {
      // best-effort cleanup
    }
    const t = window.setTimeout(() => router.replace("/home"), 600);
    return () => window.clearTimeout(t);
  }, [isCompleting, router]);

  // ---- auth gate ------------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    // Arrived already onboarded (no turn has run here): instant replace. A
    // completion EARNED in this session goes through the deferred fade path.
    if (
      me.onboarding_complete &&
      !openerStarted.current &&
      !redirectStarted.current
    ) {
      redirectStarted.current = true;
      router.replace("/home");
    }
  }, [authLoading, me, router]);

  // ---- cold open (Reid speaks first) ----------------------------------------
  const startColdOpen = useCallback(async () => {
    if (openerStarted.current) return;
    openerStarted.current = true;
    // iOS: the AudioContext only honours resume() inside a user gesture —
    // this runs synchronously in the tap before anything awaits.
    unlockAudioContext();
    setColdOpen("streaming");
    const r = await runOnboardingStream([]);
    if (!r.ok) {
      // Opener failed: surface the readable state — text mode shows the
      // notice/bubble, and the orb surface never wedges in `thinking`.
      setColdOpen("done");
      setInputMode("text");
      if (r.rateLimited) {
        setRateLimitNotice({ retryAfter: r.retryAfter ?? 30, seed: [] });
        openerStarted.current = false; // the retry re-runs the opener
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "My end's jammed. Send it again." },
        ]);
      }
      return;
    }
    if (effectiveModeRef.current !== "voice") {
      // The founder switched to text while the opener streamed — the line is
      // already readable in the chat surface; don't talk over the text UI.
      setColdOpen("done");
      return;
    }
    const ac = new AbortController();
    coldOpenAbortRef.current = ac;
    const { result, handle } = await fetchAndPlay({
      text: r.text,
      preview: false,
      sessionId: sessionIdRef.current ?? undefined,
      signal: ac.signal,
      onPlay: () => setColdOpen("speaking"),
      onEnded: () => {
        coldOpenHandleRef.current = null;
        setColdOpen("done");
      },
    });
    if (result.ok) {
      coldOpenHandleRef.current = handle;
      return;
    }
    // TTS failed (network / decode / 402 backstop — the latter shouldn't
    // happen during onboarding). The opener text is already in messages[]:
    // fall back to text so it's readable instead of playing silence.
    coldOpenHandleRef.current = null;
    setColdOpen("done");
    if (result.reason !== "aborted") setInputMode("text");
  }, [runOnboardingStream]);

  // ---- orb tap semantics (mirrors /chat, plus the cold open) ----------------
  const onOrbTap = useCallback(() => {
    if (isCompleting) return; // mid-fade: the founder is leaving
    if (coldOpen === "pending") {
      void startColdOpen();
      return;
    }
    if (coldOpen === "speaking") {
      // Tap-to-skip Reid's opener: stop playback and hand the loop over.
      coldOpenHandleRef.current?.stop();
      coldOpenHandleRef.current = null;
      setColdOpen("done");
      return;
    }
    if (coldOpen === "streaming") return; // busy (button is disabled anyway)
    if (voiceStatus === "idle") {
      voice.start();
    } else if (voiceStatus === "recording") {
      voice.stopRecording();
    } else if (voiceStatus === "speaking") {
      voice.cancel();
    } else if (voiceStatus === "error" && voice.state.error !== "unsupported") {
      voice.start();
    }
  }, [isCompleting, coldOpen, startColdOpen, voice, voiceStatus]);

  // ---- surface switching ------------------------------------------------------
  const switchToText = useCallback(() => {
    // Cut any voice activity cleanly before swapping surfaces.
    coldOpenAbortRef.current?.abort();
    coldOpenHandleRef.current?.stop();
    coldOpenHandleRef.current = null;
    voice.cancel();
    if (coldOpen !== "pending") setColdOpen("done");
    setInputMode("text");
  }, [voice, coldOpen]);

  const switchToVoice = useCallback(() => {
    // Clear a recoverable mic error so the derived availability re-opens;
    // 'unsupported' is terminal and the toggle is hidden in that case.
    if (voice.state.status === "error") voice.dismissError();
    // If the opener already ran via text, the cold open is over — the orb
    // starts at FSM idle ("Tap to reply") instead of replaying the invite.
    if (openerStarted.current) setColdOpen("done");
    setInputMode("voice");
  }, [voice]);

  // Hard-reset the loop whenever the voice surface is dismissed (parity with
  // /chat; useVoiceLoop also runs its own unmount teardown).
  const voiceCancel = voice.cancel;
  useEffect(() => {
    if (effectiveMode !== "voice") voiceCancel();
  }, [effectiveMode, voiceCancel]);

  // Text mode reached before any turn ran (escape hatch or fallback before
  // the first tap): fire Reid's opener as text.
  useEffect(() => {
    if (!mounted || effectiveMode !== "text") return;
    if (openerStarted.current) return;
    openerStarted.current = true;
    void (async () => {
      const r = await runOnboardingStream([]);
      if (!r.ok) {
        if (r.rateLimited) {
          setRateLimitNotice({ retryAfter: r.retryAfter ?? 30, seed: [] });
          openerStarted.current = false;
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "My end's jammed. Send it again." },
          ]);
        }
      }
    })();
  }, [mounted, effectiveMode, runOnboardingStream]);

  // Cold-open teardown on unmount (useVoiceLoop handles its own).
  useEffect(() => {
    return () => {
      coldOpenAbortRef.current?.abort();
      coldOpenHandleRef.current?.stop();
      coldOpenHandleRef.current = null;
    };
  }, []);

  async function handleSend(content: string) {
    if (!me || isStreaming || isCompleting) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    const r = await runOnboardingStream(nextMessages);
    if (!r.ok) {
      if (r.rateLimited) {
        setRateLimitNotice({
          retryAfter: r.retryAfter ?? 30,
          seed: nextMessages,
        });
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "My end's jammed. Send it again." },
        ]);
      }
    }
  }

  // Responsive orb diameter — generous, but always within the viewport and
  // capped so it stays a focal object rather than a wall (mirrors /chat).
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

  if (authLoading || !me) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#050810" }}
      >
        <LogoMark size={48} />
      </div>
    );
  }

  const voiceSurface = effectiveMode === "voice";

  return (
    <div
      className="onboarding-bg"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        // Voice is an orb-only, near-black surface; text is the normal app
        // bg. Crossfade so the escape hatch feels like one surface.
        background: voiceSurface ? "#050810" : "#0A1628",
        transition: "background 320ms ease",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{
          padding: "20px 24px 14px",
          transition: "opacity 300ms ease",
          opacity: isCompleting ? 0 : 1,
        }}
      >
        <div className="flex items-center" style={{ gap: 10 }}>
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
        </div>
        {/* Mode toggle (parity with /chat): shows the DESTINATION mode's
            icon. Hidden while voice is terminally unavailable. */}
        {voiceSurface ? (
          <button
            type="button"
            onClick={switchToText}
            aria-label="Switch to text"
            title="Switch to text"
            className="flex items-center justify-center rounded-full p-1 text-white/30 transition-colors hover:text-white/60 outline-none focus-visible:ring-2 focus-visible:ring-[#8E1616]/50"
          >
            <MessageSquare className="h-5 w-5" aria-hidden />
          </button>
        ) : (
          mounted &&
          voice.isSupported &&
          voice.state.error !== "unsupported" && (
            <button
              type="button"
              onClick={switchToVoice}
              aria-label="Switch to voice"
              title="Switch to voice"
              className="flex items-center justify-center rounded-full p-1 text-white/30 transition-colors hover:text-white/60 outline-none focus-visible:ring-2 focus-visible:ring-[#8E1616]/50"
            >
              <ReidMark size={22} />
            </button>
          )
        )}
      </header>

      {voiceSurface ? (
        // Voice shell: the orb IS the control (mirrors /chat). ChatStream is
        // hidden entirely; the history is still accumulating underneath and
        // appears intact if the founder switches to text.
        <motion.div
          key="voice-shell"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: isCompleting ? 0 : 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex-1 flex flex-col items-center justify-center"
          style={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
          }}
        >
          {/* Playfair invite — Reid's voice, before his voice. Swapped for
              the caption block once the cold open starts. */}
          {coldOpen === "pending" && (
            <p
              className="font-serif italic text-center"
              style={{
                color: "#F2EDE3",
                fontSize: 22,
                lineHeight: 1.45,
                maxWidth: 320,
                marginBottom: 36,
              }}
            >
              You found me. Tap, and we&apos;ll talk.
            </p>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onOrbTap}
            disabled={
              orbStatus === "transcribing" ||
              orbStatus === "thinking" ||
              (voiceStatus === "error" && voice.state.error === "unsupported")
            }
            aria-label={
              coldOpen === "pending"
                ? "Start talking with Reid"
                : (ORB_TAP_LABEL[orbStatus] ?? "Reid")
            }
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#8E1616]/50 disabled:cursor-default"
          >
            <ReidWebOrb status={orbStatus} size={orbSize} />
          </motion.button>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${coldOpen}-${orbStatus}-${voice.state.error ?? ""}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-10 flex min-h-[1.25rem] items-center justify-center"
            >
              {coldOpen === "pending" ? null : orbStatus === "thinking" ? (
                <ShiningText text="thinking." />
              ) : (
                <span className="text-white/50 text-sm font-sans">
                  {ORB_CAPTION[
                    voiceStatus === "error" && coldOpen === "done"
                      ? (voice.state.error ?? "api")
                      : orbStatus
                  ] ?? ""}
                </span>
              )}
            </motion.div>
          </AnimatePresence>
          {/* The text escape hatch — always visible (accessibility is the
              point; a mic should never be the price of onboarding). */}
          <button
            type="button"
            onClick={switchToText}
            className="font-sans mt-8 text-white/30 transition-colors hover:text-white/60 outline-none focus-visible:ring-2 focus-visible:ring-[#8E1616]/50 rounded"
            style={{ fontSize: 13, letterSpacing: "0.02em" }}
          >
            Type instead
          </button>
        </motion.div>
      ) : (
        <>
          {micFallbackNotice && (
            <p
              className="font-sans text-center"
              style={{
                color: "#7A90A8",
                fontSize: 12,
                padding: "0 24px 8px",
                transition: "opacity 300ms ease",
                opacity: isCompleting ? 0 : 1,
              }}
            >
              {micFallbackNotice}
            </p>
          )}
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
        </>
      )}
      {rateLimitNotice && (
        <RateLimitNotice
          retryAfter={rateLimitNotice.retryAfter}
          onRetry={() => {
            const pending = rateLimitNotice;
            setRateLimitNotice(null);
            if (pending.seed.length === 0) {
              // The opener itself was limited — re-run it on the surface the
              // founder is currently on.
              openerStarted.current = false;
              if (effectiveModeRef.current === "voice") {
                setColdOpen("pending");
              } else {
                openerStarted.current = true;
                void runOnboardingStream([]);
              }
              return;
            }
            void runOnboardingStream(pending.seed);
          }}
          onDismiss={() => setRateLimitNotice(null)}
        />
      )}
    </div>
  );
}
