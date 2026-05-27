import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAudioFile, MAX_AUDIO_BYTES } from "../transcribe.ts";

test("rejects non-File input", () => {
  assert.deepEqual(validateAudioFile(null), { ok: false, error: "invalid_audio" });
  assert.deepEqual(validateAudioFile("nope"), { ok: false, error: "invalid_audio" });
});

test("rejects empty file", () => {
  const f = new File([], "a.m4a", { type: "audio/m4a" });
  assert.deepEqual(validateAudioFile(f), { ok: false, error: "invalid_audio" });
});

test("accepts a small non-empty audio file", () => {
  const f = new File([new Uint8Array([1, 2, 3, 4])], "a.m4a", { type: "audio/m4a" });
  assert.deepEqual(validateAudioFile(f), { ok: true });
});

test("rejects file over the 25 MB cap", () => {
  const f = new File([new Uint8Array([1, 2, 3])], "big.m4a", { type: "audio/m4a" });
  Object.defineProperty(f, "size", { value: MAX_AUDIO_BYTES + 1 });
  assert.deepEqual(validateAudioFile(f), { ok: false, error: "audio_too_large" });
});
