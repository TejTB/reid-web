"use client";

// Sprint 12 Build 2a — the turn-based voice engine.
//
// A headless hook that owns the voice FSM (voice-loop-fsm.ts) and the browser
// side effects: mic capture (MediaRecorder), speech-to-text (/api/transcribe),
// and TTS playback. It does NOT own the Reid chat turn or the orb UI — those
// are injected (runReidTurn) / consumed (state) by the caller, so the engine
// stays decoupled from the chat page and the orb component (Build 2b/2c).
//
// Replaces the in-browser SpeechRecognition path. SpeechRecognition is
// unreliable on iOS Safari; MediaRecorder + Whisper is the spec's chosen loop
// and works across desktop Chrome and mobile Safari.
//
// iOS Safari notes baked in here:
//   - audio playback is unlocked on the user gesture that calls start()
//   - the recorder mime is chosen via MediaRecorder.isTypeSupported (Chrome →
//     audio/webm;opus, Safari → audio/mp4;aac), and the blob is POSTed to
//     /api/transcribe with its TRUE filename + type (no hardcoded m4a relabel)
//   - getUserMedia is requested per capture; the track is stopped after each
//     turn so the mic indicator clears and permission is re-checked next time
//
// Browser behaviour (MediaRecorder/getUserMedia/AudioContext) is verified on
// the Vercel preview deploy for BOTH Chrome webm/opus and Safari mp4/aac — the
// blocking Build-2 smoke. This module has no node:test coverage (it needs a
// DOM + real devices); its pure core (the reducer) is exhaustively unit-tested.

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  voiceLoopReducer,
  INITIAL_VOICE_STATE,
  type VoiceError,
  type VoiceLoopState,
} from "@/lib/voice-loop-fsm";
import {
  fetchAndPlay,
  unlockAudioContext,
  type TtsPlaybackHandle,
} from "@/lib/voice";

/** Outcome of running one Reid chat turn for a transcript. The caller wires
 *  this to the chat page's existing send/stream pipeline so we never build a
 *  second one. */
export interface ReidTurnOutcome {
  /** The finalized assistant reply text to speak, or "" if none. */
  replyText: string;
  /** True if the turn hit the free-allowance wall (reid 402). The hook returns
   *  to idle; opening the paywall is the caller's responsibility (it already
   *  listens for 402 via SessionLimitError → reid:open-paywall). */
  walled: boolean;
  /** True on a non-paywall failure (network/api) — drives the error state. */
  failed: boolean;
}

export interface UseVoiceLoopOptions {
  /** Runs one Reid turn for the transcript and resolves with the outcome.
   *  Provided by the chat page (wraps handleSend/streamWithRetry). */
  runReidTurn: (transcript: string) => Promise<ReidTurnOutcome>;
  /** The LIVE in-progress session id, read at playback time so /api/tts can
   *  exclude it from the entitlement count (self-count fix). A getter, not a
   *  value, so we always read the freshest id after the turn may have minted
   *  one. */
  getSessionId: () => string | null;
  /** Supabase access token for authing the /api/transcribe POST (mirrors
   *  fetchAndPlay's bearer attach). */
  getAccessToken: () => Promise<string | null>;
}

export interface UseVoiceLoopReturn {
  state: VoiceLoopState;
  /** Whether this browser can run the loop at all (MediaRecorder + mic API). */
  isSupported: boolean;
  /** User tapped record. Unlocks audio, then begins capture. No-op if the FSM
   *  is mid-turn (deterministic ignore-until-idle). */
  start: () => void;
  /** Stop the current capture early (user tapped stop while recording). */
  stopRecording: () => void;
  /** Dismiss a recoverable error back to idle. */
  dismissError: () => void;
  /** Hard reset (voice mode dismissed): aborts capture, playback, and fetches. */
  cancel: () => void;
}

const MAX_RECORD_MS = 30_000; // matches /api/transcribe maxDuration

/** Detects whether the platform can run the loop. SSR-safe (returns false). */
export function detectVoiceSupport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/** Picks a MediaRecorder mime the browser actually supports, with the matching
 *  file extension so /api/transcribe forwards a TRUTHFUL name to Whisper.
 *  Order: Chrome/Firefox webm/opus, then Safari mp4/aac, then bare fallbacks. */
function pickRecorderMime(): { mimeType: string; ext: string } | null {
  if (
    typeof window === "undefined" ||
    typeof window.MediaRecorder === "undefined" ||
    typeof window.MediaRecorder.isTypeSupported !== "function"
  ) {
    return null;
  }
  const candidates: Array<{ mimeType: string; ext: string }> = [
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/webm", ext: "webm" },
    { mimeType: "audio/mp4;codecs=mp4a.40.2", ext: "mp4" },
    { mimeType: "audio/mp4", ext: "mp4" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  for (const c of candidates) {
    if (window.MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return null;
}

/** Maps a getUserMedia rejection to our error taxonomy. */
function classifyMicError(err: unknown): VoiceError {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "mic-denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-mic";
  return "api";
}

export function useVoiceLoop(opts: UseVoiceLoopOptions): UseVoiceLoopReturn {
  const { runReidTurn, getSessionId, getAccessToken } = opts;
  const [state, dispatch] = useReducer(voiceLoopReducer, INITIAL_VOICE_STATE);

  const isSupported = detectVoiceSupport();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ttsHandleRef = useRef<TtsPlaybackHandle | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  // Snapshot of the chosen mime for the in-flight capture.
  const mimeRef = useRef<{ mimeType: string; ext: string } | null>(null);

  // ---- teardown helpers ---------------------------------------------------
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (ttsHandleRef.current) {
      ttsHandleRef.current.stop();
      ttsHandleRef.current = null;
    }
  }, []);

  const clearRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  // ---- speaking phase: play the assistant reply ---------------------------
  const speak = useCallback(
    async (text: string) => {
      stopPlayback();
      const ac = new AbortController();
      ttsAbortRef.current = ac;
      // ALWAYS request full audio. The wall is /api/reid 402 (primary) and
      // /api/tts 403 (backstop) — we never route non-entitled users through
      // the preview taste, which would mask a 402 failure. sessionId is read
      // live so /api/tts excludes the in-progress session from the count.
      const { result, handle } = await fetchAndPlay({
        text,
        preview: false,
        sessionId: getSessionId() ?? undefined,
        signal: ac.signal,
        onPlay: () => {
          // Truthful onset: flip to `speaking` only when Web Audio actually
          // starts output (right after decode + source.start()), NOT when we
          // kicked off the fetch. `thinking` covers TTS fetch/decode latency,
          // so the orb's pulse never starts during silence on buffered TTS.
          if (ttsAbortRef.current !== ac) return;
          dispatch({ type: "REPLY_READY" });
        },
        onEnded: () => {
          if (ttsAbortRef.current !== ac) return;
          ttsAbortRef.current = null;
          ttsHandleRef.current = null;
          dispatch({ type: "PLAYBACK_ENDED" });
        },
      });
      if (cancelledRef.current) return;
      if (result.ok) {
        if (handle) ttsHandleRef.current = handle;
        return;
      }
      ttsAbortRef.current = null;
      ttsHandleRef.current = null;
      if (result.reason === "forbidden") {
        // 403 backstop — open the paywall and return to idle.
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("reid:open-paywall", {
              detail: { context: "voice" },
            }),
          );
        }
        dispatch({ type: "WALL" });
      } else if (result.reason === "aborted") {
        // a cancel/new turn superseded us — no state change here
      } else {
        dispatch({ type: "ERROR", kind: "network" });
      }
    },
    [getSessionId, stopPlayback],
  );

  // ---- transcribe + run the Reid turn -------------------------------------
  const handleBlob = useCallback(
    async (blob: Blob) => {
      const mime = mimeRef.current;
      stopTracks();
      if (!mime || blob.size === 0) {
        dispatch({ type: "TRANSCRIBED", hasSpeech: false });
        return;
      }
      let transcript = "";
      try {
        const token = await getAccessToken();
        const form = new FormData();
        // TRUTHFUL filename + type so Whisper gets the right format hint.
        form.append("file", blob, `speech.${mime.ext}`);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: form,
        });
        if (res.status === 429) {
          dispatch({ type: "ERROR", kind: "api" });
          return;
        }
        if (!res.ok) {
          dispatch({ type: "ERROR", kind: res.status >= 500 ? "api" : "api" });
          return;
        }
        const data = (await res.json()) as { transcript?: string };
        transcript = (data.transcript ?? "").trim();
      } catch {
        dispatch({ type: "ERROR", kind: "network" });
        return;
      }
      if (cancelledRef.current) return;
      if (!transcript) {
        dispatch({ type: "TRANSCRIBED", hasSpeech: false });
        return;
      }
      // → thinking
      dispatch({ type: "TRANSCRIBED", hasSpeech: true });
      let outcome: ReidTurnOutcome;
      try {
        outcome = await runReidTurn(transcript);
      } catch {
        dispatch({ type: "ERROR", kind: "network" });
        return;
      }
      if (cancelledRef.current) return;
      if (outcome.walled) {
        // reid 402 — caller opens the paywall; we just unwind to idle.
        dispatch({ type: "WALL" });
        return;
      }
      if (outcome.failed || !outcome.replyText) {
        dispatch(
          outcome.failed
            ? { type: "ERROR", kind: "api" }
            : { type: "PLAYBACK_ENDED" }, // no reply to speak → back to idle
        );
        return;
      }
      // Stay in `thinking` through TTS fetch/decode. speak() dispatches
      // REPLY_READY (→ speaking) from the audio element's real `playing` event,
      // so the orb's pulse onset is truthful with no silent gap.
      void speak(outcome.replyText);
    },
    [getAccessToken, runReidTurn, speak, stopTracks],
  );

  // ---- recording ----------------------------------------------------------
  const stopRecording = useCallback(() => {
    clearRecordTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop(); // fires onstop → handleBlob
      } catch {
        dispatch({ type: "ERROR", kind: "api" });
      }
    }
  }, [clearRecordTimer]);

  const beginCapture = useCallback(async () => {
    cancelledRef.current = false;
    const mime = pickRecorderMime();
    if (!mime) {
      dispatch({ type: "ERROR", kind: "unsupported" });
      return;
    }
    mimeRef.current = mime;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      dispatch({ type: "ERROR", kind: classifyMicError(err) });
      return;
    }
    if (cancelledRef.current) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    streamRef.current = stream;
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime.mimeType });
    } catch {
      stopTracks();
      dispatch({ type: "ERROR", kind: "unsupported" });
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onerror = () => dispatch({ type: "ERROR", kind: "api" });
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime.mimeType });
      chunksRef.current = [];
      recorderRef.current = null;
      dispatch({ type: "RECORDING_STOPPED" });
      void handleBlob(blob);
    };
    recorderRef.current = rec;
    try {
      rec.start();
    } catch {
      stopTracks();
      dispatch({ type: "ERROR", kind: "api" });
      return;
    }
    // Auto-stop at the transcribe ceiling so a stuck recording can't hang.
    recordTimerRef.current = setTimeout(stopRecording, MAX_RECORD_MS);
  }, [handleBlob, stopRecording, stopTracks]);

  const start = useCallback(() => {
    // The FSM decides whether START is allowed (ignored mid-turn; terminal
    // when unsupported). We only kick off capture when it actually moves us
    // into recording. Unsupported platform → terminal error immediately.
    if (!isSupported) {
      dispatch({ type: "ERROR", kind: "unsupported" });
      return;
    }
    // iOS Safari: unlock the shared AudioContext on this user gesture so the
    // Web Audio playback later in the turn can start. iOS creates the context
    // suspended and only honours resume() from inside a gesture; this is the
    // PRIMARY unlock (fetchAndPlay also resumes defensively before each decode).
    unlockAudioContext();
    dispatch({ type: "START" });
  }, [isSupported]);

  // When the FSM enters `recording`, actually begin capture. Driven off state
  // so the reducer remains the single source of truth for whether START took.
  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    if (prevStatusRef.current !== "recording" && state.status === "recording") {
      void beginCapture();
    }
    prevStatusRef.current = state.status;
  }, [state.status, beginCapture]);

  const dismissError = useCallback(() => dispatch({ type: "DISMISS_ERROR" }), []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearRecordTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    stopPlayback();
    dispatch({ type: "CANCEL" });
  }, [clearRecordTimer, stopTracks, stopPlayback]);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearRecordTimer();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
      stopTracks();
      stopPlayback();
    };
  }, [clearRecordTimer, stopTracks, stopPlayback]);

  return { state, isSupported, start, stopRecording, dismissError, cancel };
}
