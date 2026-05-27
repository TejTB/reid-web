// OpenAI Whisper hard limit is 25 MB per request.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type AudioCheck = { ok: true } | { ok: false; error: string };

/** Validates the `file` field from a transcribe upload. Pure — no I/O.
 *  `audio_too_large` is returned for files over Whisper's 25 MB cap. */
export function validateAudioFile(file: unknown): AudioCheck {
  if (!(file instanceof File)) return { ok: false, error: "invalid_audio" };
  if (file.size === 0) return { ok: false, error: "invalid_audio" };
  if (file.size > MAX_AUDIO_BYTES) return { ok: false, error: "audio_too_large" };
  return { ok: true };
}
