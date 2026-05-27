import { test } from "node:test";
import assert from "node:assert/strict";
import { reidRequestSchema } from "../validation.ts";

const base = { mode: "chat" as const, messages: [{ role: "user" as const, content: "hi" }] };

test("accepts request without voice (back-compat)", () => {
  const r = reidRequestSchema.safeParse(base);
  assert.equal(r.success, true);
});

test("accepts voice: true", () => {
  const r = reidRequestSchema.safeParse({ ...base, voice: true });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.voice, true);
});

test("rejects non-boolean voice", () => {
  const r = reidRequestSchema.safeParse({ ...base, voice: "yes" });
  assert.equal(r.success, false);
});
