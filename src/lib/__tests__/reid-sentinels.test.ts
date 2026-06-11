import { test } from "node:test";
import assert from "node:assert/strict";

// anthropic.ts constructs the SDK client at module load; the SDK throws
// without an api key, so stub one before the dynamic import (same reason
// reid-summary.ts lazily imports the client).
process.env.ANTHROPIC_API_KEY ??= "test-key";
const { buildSystemPrompt } = await import("../anthropic.ts");
const { stripSentinelTags } = await import("../reid-sentinels.ts");

// ---- buildSystemPrompt sentinel opt-out (B1.5) ------------------------------

test("buildSystemPrompt includes sentinel instructions by default", () => {
  const p = buildSystemPrompt("");
  assert.equal(p.includes("[SESSION_COMPLETE]"), true);
});

test("buildSystemPrompt omits sentinel instructions when sentinels:false", () => {
  const p = buildSystemPrompt("", { sentinels: false });
  assert.equal(p.includes("[SESSION_COMPLETE]"), false);
  assert.equal(p.includes("[OBSERVATION]"), false);
  assert.equal(p.includes("[ONBOARDING_COMPLETE]"), false);
  // the persona itself must survive
  assert.equal(p.includes("You are Reid."), true);
});

test("buildSystemPrompt still prepends context with sentinels:false", () => {
  const p = buildSystemPrompt("=== FOUNDER CONTEXT ===\n- name: Theo", {
    sentinels: false,
  });
  assert.equal(p.startsWith("=== FOUNDER CONTEXT ==="), true);
});

// ---- stripSentinelTags (B1.5 defensive net) ---------------------------------

test("stripSentinelTags removes leaked sentinel lines from generated text", () => {
  const dirty = `Real insight here.\n[OBSERVATION] confidence="high" text="leaked"\nMore text.`;
  const clean = stripSentinelTags(dirty);
  assert.equal(clean.includes("[OBSERVATION]"), false);
  assert.equal(clean.includes("Real insight here."), true);
  assert.equal(clean.includes("More text."), true);
});

test("stripSentinelTags handles every known sentinel prefix", () => {
  const dirty = [
    "Keep this.",
    '[GOAL_UPDATE] goal="x" delta="1"',
    '[SESSION_COMPLETE] summary="y"',
    '[ONBOARDING_COMPLETE] summary="z"',
    '[EMAIL_CAPTURED] email="a@b.c"',
    '[NAME_CAPTURED] name="Theo"',
    "And this.",
  ].join("\n");
  const clean = stripSentinelTags(dirty);
  for (const tag of [
    "[GOAL_UPDATE]",
    "[SESSION_COMPLETE]",
    "[ONBOARDING_COMPLETE]",
    "[EMAIL_CAPTURED]",
    "[NAME_CAPTURED]",
  ]) {
    assert.equal(clean.includes(tag), false, tag);
  }
  assert.equal(clean.includes("Keep this."), true);
  assert.equal(clean.includes("And this."), true);
});

test("stripSentinelTags leaves clean text untouched and collapses blank runs", () => {
  assert.equal(stripSentinelTags("Just a take.\n\nTwo paragraphs."), "Just a take.\n\nTwo paragraphs.");
  const clean = stripSentinelTags("A.\n[OBSERVATION] x\n\n\nB.");
  assert.equal(clean.includes("\n\n\n"), false);
});
