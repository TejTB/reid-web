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
  /** Stop playback and free the audio element/blob. Safe to call multiple
   *  times. Does not invoke onEnded — the caller controls UI state when it
   *  calls stop() itself. */
  stop(): void;
  /** The underlying audio element. Exposed so the caller can read .paused
   *  if needed; do not mutate. */
  audio: HTMLAudioElement;
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

  if (res.status === 403) {
    return { result: { ok: false, reason: "forbidden" }, handle: null };
  }
  if (!res.ok) {
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    URL.revokeObjectURL(url);
  };

  audio.addEventListener("ended", () => {
    cleanup();
    onEnded();
  });
  audio.addEventListener("error", () => {
    cleanup();
    onEnded();
  });
  if (onPlay) {
    audio.addEventListener("play", onPlay, { once: true });
  }

  try {
    await audio.play();
  } catch {
    cleanup();
    return { result: { ok: false, reason: "error" }, handle: null };
  }

  const handle: TtsPlaybackHandle = {
    audio,
    stop() {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore — element may already be torn down.
      }
      cleanup();
    },
  };

  return { result: { ok: true }, handle };
}
