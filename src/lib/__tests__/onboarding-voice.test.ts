import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveOrbStatus,
  toReidTurnOutcome,
  shouldRedirectAfterCompletion,
} from "../onboarding-voice.ts";

// ---- deriveOrbStatus (cold open owns the orb until it's done) ---------------

test("cold open pending → orb idle regardless of FSM state", () => {
  assert.equal(deriveOrbStatus("pending", "idle"), "idle");
  // The FSM can't be mid-turn before the first tap, but the derivation must
  // not leak a stale FSM state into the pre-tap invite surface either way.
  assert.equal(deriveOrbStatus("pending", "error"), "idle");
});

test("cold open streaming → orb thinking (opener stream in flight)", () => {
  assert.equal(deriveOrbStatus("streaming", "idle"), "thinking");
});

test("cold open speaking → orb speaking (Reid's first line, truthful onset)", () => {
  assert.equal(deriveOrbStatus("speaking", "idle"), "speaking");
});

test("cold open done → the FSM owns the orb 1:1", () => {
  for (const s of [
    "idle",
    "recording",
    "transcribing",
    "thinking",
    "speaking",
    "error",
  ] as const) {
    assert.equal(deriveOrbStatus("done", s), s);
  }
});

// ---- toReidTurnOutcome (stream result → FSM contract) -----------------------

test("successful turn maps replyText through, never walled", () => {
  assert.deepEqual(
    toReidTurnOutcome({ ok: true, text: "Good. What's the one thing?", rateLimited: false }),
    { replyText: "Good. What's the one thing?", walled: false, failed: false },
  );
});

test("failed turn maps to failed (orb error state), empty reply", () => {
  assert.deepEqual(toReidTurnOutcome({ ok: false, text: "", rateLimited: false }), {
    replyText: "",
    walled: false,
    failed: true,
  });
});

test("rate-limited turn maps to failed, NOT walled — onboarding is exempt from the session wall", () => {
  // /api/reid's 402 session gate never applies to mode:"onboarding"
  // (route.ts gates it on mode === "chat"), so the voice FSM must treat a
  // 429 burst as a recoverable error, never as a paywall.
  assert.deepEqual(toReidTurnOutcome({ ok: false, text: "", rateLimited: true }), {
    replyText: "",
    walled: false,
    failed: true,
  });
});

test("ok turn with empty text yields empty replyText without failure (FSM returns to idle)", () => {
  assert.deepEqual(toReidTurnOutcome({ ok: true, text: "", rateLimited: false }), {
    replyText: "",
    walled: false,
    failed: false,
  });
});

// ---- shouldRedirectAfterCompletion (one completion path, voice + text) ------

test("no completion pending → never redirect", () => {
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: false,
      coldOpen: "done",
      fsmStatus: "idle",
    }),
    false,
  );
});

test("text mode (FSM idle, cold open never ran or done) redirects immediately", () => {
  // Text-path completion: voice loop is idle/cancelled — nothing to wait for.
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "pending",
      fsmStatus: "idle",
    }),
    true,
  );
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "done",
      fsmStatus: "idle",
    }),
    true,
  );
});

test("voice completion waits for Reid's final line — speaking/thinking defer", () => {
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "done",
      fsmStatus: "speaking",
    }),
    false,
  );
  // thinking covers the TTS fetch/decode window before REPLY_READY — the
  // final line hasn't been heard yet, so hold the redirect.
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "done",
      fsmStatus: "thinking",
    }),
    false,
  );
});

test("cold-open playback also defers the redirect", () => {
  // Degenerate but possible: the model completes on the opener turn. The
  // founder still hears the line out before the handoff.
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "speaking",
      fsmStatus: "idle",
    }),
    false,
  );
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "streaming",
      fsmStatus: "idle",
    }),
    false,
  );
});

test("voice error/idle after completion → redirect (a TTS failure must never strand the founder)", () => {
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "done",
      fsmStatus: "error",
    }),
    true,
  );
  assert.equal(
    shouldRedirectAfterCompletion({
      completionPending: true,
      coldOpen: "done",
      fsmStatus: "idle",
    }),
    true,
  );
});
