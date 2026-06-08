// Sprint 12 Build 2a — the turn-based voice loop FSM.
//
// Pure, framework-free reducer so it is exhaustively unit-testable (node:test)
// and the React hook (useVoiceLoop) stays a thin shell that maps browser
// events onto these transitions and runs the side effects.
//
// The loop is turn-based (no barge-in this sprint):
//   idle → recording → transcribing → thinking → speaking → idle
//
// Hard invariant: there is NO undefined transition. Every (state, event) pair
// resolves to a defined state, so the orb can never hang. Failures land in a
// defined `error` substate; user taps during busy states are deterministically
// ignored (ignore-until-idle); MediaRecorder-unsupported is a TERMINAL error.

export type VoiceStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

export type VoiceError =
  | "mic-denied" // getUserMedia rejected by the user/OS
  | "no-mic" // no audio input device present
  | "unsupported" // MediaRecorder/getUserMedia unavailable — TERMINAL
  | "network" // transcribe/reid/tts fetch failed (offline, timeout)
  | "api"; // server returned a non-paywall error (4xx/5xx)

export interface VoiceLoopState {
  status: VoiceStatus;
  /** Set only when status === 'error'. */
  error: VoiceError | null;
}

export type VoiceEvent =
  // user taps the record control
  | { type: "START" }
  // MediaRecorder produced a blob and stopped
  | { type: "RECORDING_STOPPED" }
  // /api/transcribe returned; hasSpeech=false means an empty/garbage transcript
  | { type: "TRANSCRIBED"; hasSpeech: boolean }
  // assistant reply finalized → begin TTS playback
  | { type: "REPLY_READY" }
  // TTS audio finished (or its element errored — treated as ended)
  | { type: "PLAYBACK_ENDED" }
  // a gate fired (reid 402 / tts 402). Side effect (open paywall) is the
  // hook's job; the FSM just returns to idle so the orb never hangs.
  | { type: "WALL" }
  // voice mode dismissed or a hard reset — always returns to idle
  | { type: "CANCEL" }
  // a failure occurred; kind selects the terminal/recoverable error substate
  | { type: "ERROR"; kind: VoiceError }
  // user acknowledged a (recoverable) error
  | { type: "DISMISS_ERROR" };

export const INITIAL_VOICE_STATE: VoiceLoopState = {
  status: "idle",
  error: null,
};

const idle = (): VoiceLoopState => ({ status: "idle", error: null });
const at = (status: VoiceStatus): VoiceLoopState => ({ status, error: null });
const fail = (error: VoiceError): VoiceLoopState => ({
  status: "error",
  error,
});

/**
 * Pure transition function. Unknown (state, event) pairs are NO-OPs (return the
 * same state) rather than throwing — that is the "no undefined transition"
 * guarantee. CANCEL and ERROR are accepted from every active state.
 */
export function voiceLoopReducer(
  state: VoiceLoopState,
  event: VoiceEvent,
): VoiceLoopState {
  // CANCEL is universal: dismiss back to idle from anywhere.
  if (event.type === "CANCEL") return idle();

  // ERROR is universal from any non-error state; from error it keeps the
  // first (most relevant) error rather than overwriting.
  if (event.type === "ERROR") {
    return state.status === "error" ? state : fail(event.kind);
  }

  switch (state.status) {
    case "idle":
      // START is the only progressing event; the hook must have already
      // confirmed MediaRecorder support (else it dispatches ERROR:unsupported).
      if (event.type === "START") return at("recording");
      return state;

    case "recording":
      if (event.type === "RECORDING_STOPPED") return at("transcribing");
      // tap again while recording → ignore (single-shot capture this sprint)
      return state;

    case "transcribing":
      if (event.type === "TRANSCRIBED") {
        return event.hasSpeech ? at("thinking") : idle();
      }
      return state;

    case "thinking":
      if (event.type === "REPLY_READY") return at("speaking");
      if (event.type === "WALL") return idle();
      // CHANGE #2: tap-record while the model is thinking → deterministically
      // ignored (ignore-until-idle; barge-in deferred).
      if (event.type === "START") return state;
      return state;

    case "speaking":
      if (event.type === "PLAYBACK_ENDED") return idle();
      // 402 backstop can fire while fetching playback audio.
      if (event.type === "WALL") return idle();
      // CHANGE #2: tap-record while Reid is speaking → ignored (no barge-in).
      if (event.type === "START") return state;
      return state;

    case "error":
      if (event.type === "DISMISS_ERROR") return idle();
      // CHANGE #3: 'unsupported' is TERMINAL — retry cannot help, so START is
      // ignored and the state holds. Any other error is recoverable: START
      // retries a fresh capture.
      if (event.type === "START") {
        return state.error === "unsupported" ? state : at("recording");
      }
      return state;

    default:
      return state;
  }
}

/** True while the loop is mid-turn (orb should show an active animation and
 *  the composer should not also accept a typed send for the same turn). */
export function isVoiceBusy(state: VoiceLoopState): boolean {
  return (
    state.status === "recording" ||
    state.status === "transcribing" ||
    state.status === "thinking" ||
    state.status === "speaking"
  );
}
