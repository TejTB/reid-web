import { test } from "node:test";
import assert from "node:assert/strict";
import {
  messageCapsApply,
  voiceCapApplies,
  ttsWallStatus,
} from "../cap-policy.ts";

// ---- messageCapsApply (/api/reid daily + per-minute) -----------------------

test("Pro is exempt from the message caps regardless of mode", () => {
  assert.equal(
    messageCapsApply({ isPro: true, onboardingComplete: false, mode: "onboarding" }),
    false,
  );
  assert.equal(
    messageCapsApply({ isPro: true, onboardingComplete: true, mode: "chat" }),
    false,
  );
});

test("active onboarding (onboarding_complete:false + mode:onboarding) is exempt", () => {
  assert.equal(
    messageCapsApply({ isPro: false, onboardingComplete: false, mode: "onboarding" }),
    false,
  );
});

test("onboarding_complete:false + mode:chat ⇒ caps APPLY (no uncapped-chat hole)", () => {
  // An abandoned-onboarding user hitting the chat API must still be capped.
  assert.equal(
    messageCapsApply({ isPro: false, onboardingComplete: false, mode: "chat" }),
    true,
  );
});

test("completed user faking mode:onboarding ⇒ caps APPLY (spoof caught by the AND)", () => {
  assert.equal(
    messageCapsApply({ isPro: false, onboardingComplete: true, mode: "onboarding" }),
    true,
  );
});

test("completed free user on chat ⇒ caps APPLY", () => {
  assert.equal(
    messageCapsApply({ isPro: false, onboardingComplete: true, mode: "chat" }),
    true,
  );
});

// ---- voiceCapApplies (/api/transcribe voice burst) -------------------------

test("Pro is exempt from the voice cap regardless of session mode", () => {
  assert.equal(voiceCapApplies({ isPro: true, sessionMode: "chat" }), false);
  assert.equal(voiceCapApplies({ isPro: true, sessionMode: null }), false);
});

test("onboarding session is exempt from the voice cap", () => {
  assert.equal(
    voiceCapApplies({ isPro: false, sessionMode: "onboarding" }),
    false,
  );
});

test("chat session ⇒ voice cap applies", () => {
  assert.equal(voiceCapApplies({ isPro: false, sessionMode: "chat" }), true);
});

test("missing/unresolved sessionId (sessionMode null) ⇒ voice cap APPLIES (never bypass)", () => {
  assert.equal(voiceCapApplies({ isPro: false, sessionMode: null }), true);
});

// ---- ttsWallStatus (/api/tts entitlement wall) -----------------------------

test("non-preview + not entitled ⇒ wall with 402 (NOT 403)", () => {
  const status = ttsWallStatus({ preview: false, entitled: false });
  assert.equal(status, 402);
  // Guard the regression the unification fixes: the voice wall must never be 403
  // again, or the client (which branches on 402) stops firing the paywall.
  assert.notEqual(status, 403);
});

test("preview taste is served to an exhausted (non-entitled) user (no wall)", () => {
  assert.equal(ttsWallStatus({ preview: true, entitled: false }), null);
});

test("entitled user is not walled (full audio)", () => {
  assert.equal(ttsWallStatus({ preview: false, entitled: true }), null);
});
