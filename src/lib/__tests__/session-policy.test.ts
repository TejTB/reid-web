import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSessionClosed,
  SESSION_HARD_CAP,
  ONBOARDING_HARD_CAP,
  SESSION_IDLE_TIMEOUT_MS,
  KEEPALIVE_MIN_IDLE_MS,
} from "../session-policy.ts";

const NOW = Date.parse("2026-06-11T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

// ---- isSessionClosed --------------------------------------------------------

test("chat session with a summary is closed", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: "did things", message_count: 6, last_activity_at: minsAgo(1) },
      NOW,
    ),
    true,
  );
});

test("chat session at the hard cap is closed even without a summary", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: SESSION_HARD_CAP, last_activity_at: minsAgo(1) },
      NOW,
    ),
    true,
  );
});

test("active chat session below cap with no summary is open", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: SESSION_HARD_CAP - 1, last_activity_at: minsAgo(5) },
      NOW,
    ),
    false,
  );
});

test("unsummarised session idle beyond the timeout is closed", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: 6, last_activity_at: minsAgo(61) },
      NOW,
    ),
    true,
  );
  // exactly at the boundary stays open (strict >)
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: 6, last_activity_at: minsAgo(60) },
      NOW,
    ),
    false,
  );
});

test("session with no recorded activity is open (just created)", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: 0, last_activity_at: null },
      NOW,
    ),
    false,
  );
});

test("whitespace-only summary does not count as summarised", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: "   ", message_count: 6, last_activity_at: minsAgo(1) },
      NOW,
    ),
    false,
  );
});

test("unparseable activity timestamp is ignored (session stays open)", () => {
  assert.equal(
    isSessionClosed(
      { mode: "chat", summary: null, message_count: 6, last_activity_at: "not-a-date" },
      NOW,
    ),
    false,
  );
});

test("onboarding session closes at its own (higher) cap, not the chat cap", () => {
  assert.equal(
    isSessionClosed(
      { mode: "onboarding", summary: null, message_count: SESSION_HARD_CAP, last_activity_at: minsAgo(1) },
      NOW,
    ),
    false,
  );
  assert.equal(
    isSessionClosed(
      { mode: "onboarding", summary: null, message_count: ONBOARDING_HARD_CAP, last_activity_at: minsAgo(1) },
      NOW,
    ),
    true,
  );
});

// ---- thresholds -------------------------------------------------------------

test("thresholds are sane relative to each other", () => {
  // keepalive must refuse anything younger than its window, and that window
  // must be well inside the idle timeout so there's no closure dead zone.
  assert.equal(KEEPALIVE_MIN_IDLE_MS, 10 * 60_000);
  assert.equal(SESSION_IDLE_TIMEOUT_MS, 60 * 60_000);
  assert.ok(KEEPALIVE_MIN_IDLE_MS < SESSION_IDLE_TIMEOUT_MS);
});
