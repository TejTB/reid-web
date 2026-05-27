import { test } from "node:test";
import assert from "node:assert/strict";
import { hourlyLimitFor, checkVoiceRouteLimit } from "../ratelimit.ts";

test("hourlyLimitFor: pro=60, everything else=20", () => {
  assert.equal(hourlyLimitFor("pro"), 60);
  assert.equal(hourlyLimitFor("free"), 20);
  assert.equal(hourlyLimitFor(null), 20);
  assert.equal(hourlyLimitFor(undefined), 20);
  assert.equal(hourlyLimitFor("enterprise"), 20);
});

test("checkVoiceRouteLimit allows + reports full remaining when Redis is unconfigured (dev/test)", async () => {
  const free = await checkVoiceRouteLimit("transcribe", "user-1", "free");
  assert.deepEqual(free, { allowed: true, retryAfter: 0, remaining: 20 });
  const pro = await checkVoiceRouteLimit("tts", "user-2", "pro");
  assert.deepEqual(pro, { allowed: true, retryAfter: 0, remaining: 60 });
});
