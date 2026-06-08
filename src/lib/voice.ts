// Client-side helpers for the "Hear Reid" voice feature.
//
// fetchAndPlay() handles the full lifecycle for one playback:
//   1. abort any in-flight request from a previous call
//   2. POST /api/tts with { text, preview }
//   3. pipe the response into an HTMLAudioElement
//   4. invoke `onEnded` once the audio finishes (or fails)
//
// The caller passes a ref-like `audio` slot so the page can also stop()
// playback imperatively when the user clicks the button mid-playback.

import { supabase } from "@/lib/supabase";

// ----- Web Audio playback ---------------------------------------------------
//
// iOS Safari cannot load blob: URLs into <audio>/<video> media elements
// (WebKitBlobResource error 1), so TTS is decoded and played through Web Audio
// instead: arrayBuffer → decodeAudioData → AudioBufferSourceNode. A single
// AudioContext is created once and reused for every turn. iOS starts it
// suspended and may suspend/interrupt it again between turns, so it is resumed
// from the tap-to-speak gesture (unlockAudioContext) AND defensively before
// each decode.

type AudioContextCtor = typeof AudioContext;

let audioCtx: AudioContext | null = null;

/** Lazily creates (and returns) the shared AudioContext, or null when Web
 *  Audio is unavailable / on the server. Uses the webkit-prefixed constructor
 *  on older Safari. */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

/** Resumes the shared AudioContext. MUST be called from a user gesture (the
 *  tap-to-speak handler) — iOS creates the context suspended and only honours
 *  resume() inside a gesture. Safe to call repeatedly. */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // "running" → nothing to do. "suspended"/"interrupted" (iOS) → resume.
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => {
      // Non-fatal — playback will retry the resume before decode.
    });
  }
}

/** Decodes encoded audio into an AudioBuffer. Uses the callback form, which is
 *  supported on every Safari (incl. older iOS) where the promise form may not
 *  be. NOTE: decodeAudioData DETACHES the input ArrayBuffer — never reuse the
 *  buffer after calling this; a retry must re-fetch fresh bytes. */
function decodeAudio(
  ctx: AudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(data, resolve, reject);
  });
}

const VOICE_PREF_KEY = "reid_voice_enabled";
// Same-tab notification channel: localStorage 'storage' events only fire in
// OTHER tabs, so we dispatch a plain CustomEvent for the current tab's
// useSyncExternalStore subscribers to pick up.
const VOICE_PREF_EVENT = "reid:voice-preference-change";

/** Reads the user's stored auto-play preference. Returns the default when
 *  localStorage is unavailable (SSR, private mode), so callers always get a
 *  boolean. */
export function getVoicePreference(defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(VOICE_PREF_KEY);
    if (raw === null) return defaultValue;
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

/** Writes the user's auto-play preference. Silently no-ops if storage is
 *  unavailable — the in-memory state is the source of truth for the page.
 *  Fires a same-tab CustomEvent so subscribers can re-read. */
export function setVoicePreference(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOICE_PREF_KEY, value ? "true" : "false");
  } catch {
    // Ignore — quota, private mode, etc.
  }
  try {
    window.dispatchEvent(new CustomEvent(VOICE_PREF_EVENT));
  } catch {
    // Ignore — no-DOM environments.
  }
}

/** Subscribes to voice-preference changes. Returns an unsubscribe fn.
 *  Designed for useSyncExternalStore — fires on both same-tab writes (via
 *  setVoicePreference) and cross-tab writes (via the native storage event). */
export function subscribeVoicePreference(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const storageListener = (e: StorageEvent) => {
    if (e.key === null || e.key === VOICE_PREF_KEY) onChange();
  };
  window.addEventListener(VOICE_PREF_EVENT, onChange);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(VOICE_PREF_EVENT, onChange);
    window.removeEventListener("storage", storageListener);
  };
}

export type TtsResult =
  | { ok: true }
  | { ok: false; reason: "aborted" | "forbidden" | "error" };

export interface TtsPlaybackHandle {
  /** Stop playback. Safe to call multiple times. Does NOT invoke onEnded —
   *  the caller controls UI state when it calls stop() itself. */
  stop(): void;
}

interface FetchAndPlayOptions {
  text: string;
  preview: boolean;
  /** The current session id, when known. Forwarded to /api/tts so the server
   *  excludes THIS session from the entitlement count — a free user within
   *  allowance gets full voice during their one allowed session without it
   *  walling itself (Sprint 12 self-count fix). Omit when unknown. */
  sessionId?: string;
  /** Called when audio finishes naturally OR errors. NOT called on stop(). */
  onEnded: () => void;
  /** Called once the audio is loaded and starts playing. */
  onPlay?: () => void;
  /** External abort signal — used to cancel an in-flight fetch when the user
   *  triggers a new playback or unmounts the page. */
  signal?: AbortSignal;
}

/** Fetches /api/tts and starts playback. Returns a handle for imperative
 *  control on success, or a failure reason. The caller owns deciding what
 *  UI to show for each reason (e.g. opening the paywall on `forbidden`). */
export async function fetchAndPlay(
  options: FetchAndPlayOptions,
): Promise<{ result: TtsResult; handle: TtsPlaybackHandle | null }> {
  const { text, preview, sessionId, onEnded, onPlay, signal } = options;

  // Attach the current Supabase access token so /api/tts can authenticate
  // even when the request is initiated from a context where cookies might
  // not flow (e.g. service workers). Server route also accepts cookies.
  let authHeader: Record<string, string> = {};
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // No session — server will reject with 401 if needed.
  }

  let res: Response;
  try {
    res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(
        sessionId ? { text, preview, sessionId } : { text, preview },
      ),
      signal,
    });
  } catch (err) {
    const aborted =
      err instanceof DOMException && err.name === "AbortError";
    return {
      result: { ok: false, reason: aborted ? "aborted" : "error" },
      handle: null,
    };
  }

  if (res.status === 402) {
    return { result: { ok: false, reason: "forbidden" }, handle: null };
  }
  if (!res.ok) {
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  // Read the whole response as bytes. decodeAudioData will DETACH this buffer,
  // so it is used exactly once — a decode failure returns an error rather than
  // re-decoding the (now-detached) buffer; a retry would have to re-fetch.
  let bytes: ArrayBuffer;
  try {
    bytes = await res.arrayBuffer();
  } catch {
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  const ctx = getAudioContext();
  if (!ctx) {
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  // Per-turn insurance: iOS can suspend ("suspended") or interrupt
  // ("interrupted") the context between turns even after the gesture unlock in
  // start(). Resume before decoding so playback never starts against a dead
  // context. The gesture-unlock stays the PRIMARY unlock; this is the backstop.
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      // If it won't resume, decode/start below surfaces the real failure.
    }
  }

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeAudio(ctx, bytes);
  } catch {
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  // Per-PLAYBACK flag (local, not module state) so a previous turn's stop()
  // can never suppress THIS turn's natural-end onended — which would hang the
  // FSM waiting for PLAYBACK_ENDED.
  let stoppedByUser = false;

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.onended = () => {
    // onended fires for BOTH natural end and source.stop(); suppress it on a
    // user stop so onEnded() runs only on a genuine finish.
    if (stoppedByUser) return;
    onEnded();
  };

  try {
    source.start();
  } catch {
    try {
      source.disconnect();
    } catch {
      // already detached
    }
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  // Truthful onset: Web Audio has no `playing` event, but start() begins output
  // immediately now that decode is done — so the orb's speaking pulse still
  // fires on real sound, not during fetch/decode latency.
  onPlay?.();

  const handle: TtsPlaybackHandle = {
    stop() {
      if (stoppedByUser) return;
      stoppedByUser = true;
      try {
        source.stop();
      } catch {
        // already stopped/ended
      }
      try {
        source.disconnect();
      } catch {
        // already detached
      }
    },
  };

  return { result: { ok: true }, handle };
}
