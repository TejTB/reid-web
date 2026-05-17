"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Play, Square } from "lucide-react";
import Waveform from "@/components/Waveform";
import {
  fetchAndPlay,
  getVoicePreference,
  setVoicePreference,
  subscribeVoicePreference,
  type TtsPlaybackHandle,
} from "@/lib/voice";

// "Hear Reid" pill rendered in the chat header.
//
// Three visual states, each with a fixed-width-friendly layout:
//   idle       -> Play  icon + "Hear Reid"   (filled red pill)
//   loading    -> Waveform + "Loading"       (ghost pill: red-on-translucent)
//   playing    -> Square icon + "Stop"       (ghost pill)
//
// Free users get the preview path:
//   - tap pill -> POST /api/tts { preview: true } -> play
//   - on `ended`, open the paywall via the global event
//
// Pro users get the full path:
//   - new assistant message + reid_voice_enabled === true -> auto-play
//   - manual tap toggles between play (full) and stop
//
// The button is keyed on `latestReidMessage` so a new message ALWAYS gets a
// fresh playback decision; the auto-play effect lives here so the chat page
// doesn't need to know about audio plumbing.

interface VoiceButtonProps {
  /** The most recent assistant message text, or "" if no assistant message
   *  has arrived yet in this session. */
  latestReidMessage: string;
  /** Whether the current user is on the Pro plan. */
  isPro: boolean;
  /** True while the chat is actively streaming. We do NOT auto-play during
   *  streaming — only once the message is finalized. */
  isStreaming: boolean;
}

type PlaybackState = "idle" | "loading" | "playing";

export default function VoiceButton({
  latestReidMessage,
  isPro,
  isStreaming,
}: VoiceButtonProps) {
  const [state, setState] = useState<PlaybackState>("idle");
  const handleRef = useRef<TtsPlaybackHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Pro: auto-play is gated on this preference. Default true (per spec).
  // Free users see no auto-play, so the value is irrelevant for them.
  // Subscribed via useSyncExternalStore so the read is SSR-safe and updates
  // when other tabs or components change the preference.
  const autoPlayEnabled = useSyncExternalStore(
    subscribeVoicePreference,
    () => getVoicePreference(true),
    () => true,
  );
  // Track which Reid message we've already auto-played so re-renders of the
  // same message don't re-trigger TTS. Stays empty for free users.
  const lastAutoPlayedRef = useRef<string | null>(null);

  // Listen for a global event other components can dispatch to flip the
  // auto-play pref. Settings UI for the toggle lives outside this sprint;
  // this hook lets us expose the control later without re-wiring storage.
  useEffect(() => {
    function onToggle(e: Event) {
      const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
      if (typeof detail?.enabled !== "boolean") return;
      setVoicePreference(detail.enabled);
    }
    window.addEventListener("reid:set-voice-autoplay", onToggle);
    return () => {
      window.removeEventListener("reid:set-voice-autoplay", onToggle);
    };
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (handleRef.current) {
      handleRef.current.stop();
      handleRef.current = null;
    }
    setState("idle");
  }, []);

  // Tear down audio + abort fetch on unmount.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (handleRef.current) handleRef.current.stop();
    };
  }, []);

  const play = useCallback(
    async (text: string, preview: boolean) => {
      // Cancel any in-flight previous playback before starting a new one.
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (handleRef.current) {
        handleRef.current.stop();
        handleRef.current = null;
      }

      const ac = new AbortController();
      abortRef.current = ac;
      setState("loading");

      const { result, handle } = await fetchAndPlay({
        text,
        preview,
        signal: ac.signal,
        onPlay: () => {
          // Guard: an even newer request may have aborted us between fetch
          // and play. Only flip to playing if WE are still the active req.
          if (abortRef.current === ac) setState("playing");
        },
        onEnded: () => {
          if (abortRef.current !== ac) return;
          abortRef.current = null;
          handleRef.current = null;
          setState("idle");
          if (preview && !isPro && typeof window !== "undefined") {
            // Free preview finished — escalate to the upgrade modal. The
            // PaywallModal listens for this event globally.
            window.dispatchEvent(new CustomEvent("reid:open-paywall"));
          }
        },
      });

      if (result.ok) {
        handleRef.current = handle;
        return;
      }

      // Failure paths.
      abortRef.current = null;
      handleRef.current = null;
      if (result.reason === "aborted") {
        // Caller already moved on; don't change state here.
        return;
      }
      if (result.reason === "forbidden") {
        // /api/tts says Pro required. Trigger the upgrade modal.
        setState("idle");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("reid:open-paywall"));
        }
        return;
      }
      // Generic error — revert silently. Button returns to idle.
      setState("idle");
    },
    [isPro],
  );

  // Pro auto-play: when a NEW assistant message arrives and the user has
  // auto-play on, start playback. Streaming-in-progress blocks the trigger so
  // we never play a half-formed message.
  useEffect(() => {
    if (!isPro) return;
    if (!autoPlayEnabled) return;
    if (isStreaming) return;
    if (!latestReidMessage) return;
    if (lastAutoPlayedRef.current === latestReidMessage) return;
    lastAutoPlayedRef.current = latestReidMessage;
    void play(latestReidMessage, false);
  }, [isPro, autoPlayEnabled, isStreaming, latestReidMessage, play]);

  const onClick = useCallback(() => {
    if (state === "playing" || state === "loading") {
      stop();
      // For Pro users, a manual stop also implicitly disables further
      // auto-play of this same message — handled by lastAutoPlayedRef
      // already being set. For free users, stop just cancels.
      return;
    }
    if (!latestReidMessage) return;
    if (isPro) {
      void play(latestReidMessage, false);
    } else {
      void play(latestReidMessage, true);
    }
  }, [state, stop, play, latestReidMessage, isPro]);

  const disabled = !latestReidMessage;

  const active = state !== "idle";

  // Styles match the spec; expressed inline so the component is portable and
  // doesn't depend on a Tailwind v4 utility that we'd then have to define.
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 9999,
    fontFamily: "var(--font-sans), Inter, ui-sans-serif, sans-serif",
    fontWeight: 500,
    fontSize: 13,
    lineHeight: 1,
    letterSpacing: "0.02em",
    cursor: disabled ? "default" : "pointer",
    border: active ? "1px solid rgba(185,28,28,0.3)" : "none",
    background: active ? "rgba(185,28,28,0.2)" : "#B91C1C",
    color: active ? "#B91C1C" : "#F2EDE3",
    opacity: disabled ? 0.5 : 1,
    transition: "background 200ms ease, transform 200ms ease, color 200ms ease",
  };

  const label =
    state === "playing"
      ? "Stop"
      : state === "loading"
        ? "Loading"
        : "Hear Reid";

  const ariaLabel = state === "playing" ? "Stop Reid voice" : "Hear Reid speak";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={state === "playing"}
      data-state={state}
      className="reid-voice-pill"
      style={baseStyle}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 16,
        }}
      >
        {state === "loading" ? (
          <Waveform playing />
        ) : state === "playing" ? (
          <Square size={11} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={12} fill="currentColor" strokeWidth={0} />
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}
