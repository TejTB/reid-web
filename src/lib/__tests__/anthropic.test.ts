import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, REID_VOICE, VOICE_MODE_RULES } from "../anthropic.ts";

test("text-mode prompt includes voice + sentinels, excludes voice rules", () => {
  const p = buildSystemPrompt("");
  assert.ok(p.includes(REID_VOICE), "should contain REID_VOICE");
  assert.ok(p.includes("STRUCTURED SIGNALS"), "should contain sentinel instructions");
  assert.ok(p.includes("[OBSERVATION]"), "should keep the observation sentinel contract");
  assert.ok(!p.includes(VOICE_MODE_RULES), "text mode must NOT include voice rules");
});

test("voice-mode prompt appends VOICE_MODE_RULES and keeps sentinels", () => {
  const p = buildSystemPrompt("", { voice: true });
  assert.ok(p.includes(VOICE_MODE_RULES), "voice mode must include voice rules");
  assert.ok(p.includes("STRUCTURED SIGNALS"), "voice mode must still keep sentinels");
});

test("context block is prepended when provided", () => {
  const p = buildSystemPrompt("=== FOUNDER CONTEXT ===\nname: Theo\n=== END CONTEXT ===");
  assert.ok(p.indexOf("FOUNDER CONTEXT") < p.indexOf(REID_VOICE), "context comes first");
});

test("composed voice prompt carries the 2-sentence + em-dash rules", () => {
  const p = buildSystemPrompt("", { voice: true });
  assert.match(p, /2 sentences/i);
  assert.match(p, /em-dash/i);
});

test("voice:false behaves like text mode (no voice rules)", () => {
  const p = buildSystemPrompt("", { voice: false });
  assert.ok(!p.includes(VOICE_MODE_RULES), "explicit voice:false must exclude voice rules");
});
