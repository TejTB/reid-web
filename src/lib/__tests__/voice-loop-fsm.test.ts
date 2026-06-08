import { test } from "node:test";
import assert from "node:assert/strict";
import {
  voiceLoopReducer,
  INITIAL_VOICE_STATE,
  isVoiceBusy,
  type VoiceLoopState,
  type VoiceStatus,
} from "../voice-loop-fsm.ts";

const S = (status: VoiceStatus, error: VoiceLoopState["error"] = null):
  VoiceLoopState => ({ status, error });

// ---- happy path: full turn -----------------------------------------------
test("full turn: idle→recording→transcribing→thinking→speaking→idle", () => {
  let s = INITIAL_VOICE_STATE;
  assert.deepEqual(s, S("idle"));
  s = voiceLoopReducer(s, { type: "START" });
  assert.deepEqual(s, S("recording"));
  s = voiceLoopReducer(s, { type: "RECORDING_STOPPED" });
  assert.deepEqual(s, S("transcribing"));
  s = voiceLoopReducer(s, { type: "TRANSCRIBED", hasSpeech: true });
  assert.deepEqual(s, S("thinking"));
  s = voiceLoopReducer(s, { type: "REPLY_READY" });
  assert.deepEqual(s, S("speaking"));
  s = voiceLoopReducer(s, { type: "PLAYBACK_ENDED" });
  assert.deepEqual(s, S("idle"));
});

// ---- empty transcript returns to idle ------------------------------------
test("transcribing with no speech returns to idle (not thinking)", () => {
  const s = voiceLoopReducer(S("transcribing"), {
    type: "TRANSCRIBED",
    hasSpeech: false,
  });
  assert.deepEqual(s, S("idle"));
});

// ---- paywall (402) ---------------------------------------------------------
test("WALL from thinking → idle (402 session-start wall)", () => {
  assert.deepEqual(voiceLoopReducer(S("thinking"), { type: "WALL" }), S("idle"));
});
test("WALL from speaking → idle (402 tts backstop while fetching audio)", () => {
  assert.deepEqual(voiceLoopReducer(S("speaking"), { type: "WALL" }), S("idle"));
});

// ---- CHANGE #2: user-action transitions during busy states ---------------
test("START while speaking → ignored (no barge-in), stays speaking", () => {
  assert.deepEqual(
    voiceLoopReducer(S("speaking"), { type: "START" }),
    S("speaking"),
  );
});
test("START while thinking → ignored, stays thinking", () => {
  assert.deepEqual(
    voiceLoopReducer(S("thinking"), { type: "START" }),
    S("thinking"),
  );
});
test("START while recording → ignored (single-shot capture)", () => {
  assert.deepEqual(
    voiceLoopReducer(S("recording"), { type: "START" }),
    S("recording"),
  );
});
test("START while transcribing → ignored", () => {
  assert.deepEqual(
    voiceLoopReducer(S("transcribing"), { type: "START" }),
    S("transcribing"),
  );
});

// ---- CHANGE #3: MediaRecorder unsupported is a terminal error -------------
test("ERROR unsupported → terminal; START does NOT retry", () => {
  let s = voiceLoopReducer(S("idle"), { type: "ERROR", kind: "unsupported" });
  assert.deepEqual(s, S("error", "unsupported"));
  s = voiceLoopReducer(s, { type: "START" });
  assert.deepEqual(s, S("error", "unsupported"), "unsupported must not retry");
});
test("recoverable error (mic-denied) → START retries into recording", () => {
  let s = voiceLoopReducer(S("recording"), {
    type: "ERROR",
    kind: "mic-denied",
  });
  assert.deepEqual(s, S("error", "mic-denied"));
  s = voiceLoopReducer(s, { type: "START" });
  assert.deepEqual(s, S("recording"));
});
test("DISMISS_ERROR from any error → idle (incl. unsupported)", () => {
  assert.deepEqual(
    voiceLoopReducer(S("error", "unsupported"), { type: "DISMISS_ERROR" }),
    S("idle"),
  );
  assert.deepEqual(
    voiceLoopReducer(S("error", "network"), { type: "DISMISS_ERROR" }),
    S("idle"),
  );
});

// ---- ERROR is universal and first-error-wins ------------------------------
for (const status of ["recording", "transcribing", "thinking", "speaking"] as const) {
  test(`ERROR from ${status} → error substate`, () => {
    assert.deepEqual(
      voiceLoopReducer(S(status), { type: "ERROR", kind: "network" }),
      S("error", "network"),
    );
  });
}
test("ERROR while already in error keeps the first error", () => {
  const s = voiceLoopReducer(S("error", "mic-denied"), {
    type: "ERROR",
    kind: "api",
  });
  assert.deepEqual(s, S("error", "mic-denied"));
});

// ---- CANCEL is universal --------------------------------------------------
for (const status of [
  "idle",
  "recording",
  "transcribing",
  "thinking",
  "speaking",
  "error",
] as const) {
  test(`CANCEL from ${status} → idle`, () => {
    assert.deepEqual(voiceLoopReducer(S(status), { type: "CANCEL" }), S("idle"));
  });
}

// ---- no undefined transition: every (state,event) returns a valid state ---
test("no (state,event) pair throws or yields an invalid status", () => {
  const states: VoiceLoopState[] = [
    S("idle"),
    S("recording"),
    S("transcribing"),
    S("thinking"),
    S("speaking"),
    S("error", "network"),
    S("error", "unsupported"),
  ];
  const events: Parameters<typeof voiceLoopReducer>[1][] = [
    { type: "START" },
    { type: "RECORDING_STOPPED" },
    { type: "TRANSCRIBED", hasSpeech: true },
    { type: "TRANSCRIBED", hasSpeech: false },
    { type: "REPLY_READY" },
    { type: "PLAYBACK_ENDED" },
    { type: "WALL" },
    { type: "CANCEL" },
    { type: "ERROR", kind: "api" },
    { type: "DISMISS_ERROR" },
  ];
  const valid = new Set([
    "idle",
    "recording",
    "transcribing",
    "thinking",
    "speaking",
    "error",
  ]);
  for (const st of states) {
    for (const ev of events) {
      const next = voiceLoopReducer(st, ev);
      assert.ok(valid.has(next.status), `invalid status from ${st.status}/${ev.type}`);
      // error status must always carry an error code; non-error must not
      if (next.status === "error") assert.ok(next.error !== null);
      else assert.equal(next.error, null);
    }
  }
});

// ---- isVoiceBusy ----------------------------------------------------------
test("isVoiceBusy true for active states, false for idle/error", () => {
  assert.equal(isVoiceBusy(S("idle")), false);
  assert.equal(isVoiceBusy(S("error", "api")), false);
  for (const s of ["recording", "transcribing", "thinking", "speaking"] as const) {
    assert.equal(isVoiceBusy(S(s)), true);
  }
});
