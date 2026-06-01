import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSummaryJson,
  qualifiesForSummary,
} from "../reid-summary.ts";

// ---------------------------------------------------------------------------
// parseSummaryJson — tolerant parser for the Haiku summariser's output. It
// must survive clean JSON, fenced JSON, plain prose, and junk without ever
// throwing or returning an empty summary (the non-null summary is what makes
// the summarise-at-next-start pass idempotent).
// ---------------------------------------------------------------------------

test("parseSummaryJson parses a well-formed object", () => {
  const out = parseSummaryJson(
    '{"summary":"They shipped the landing page but still haven\'t talked to a user.","commitments":["Email 5 beta users","Ship pricing page"],"key_points":["Solo founder","Launch blocked on copy"]}',
  );
  assert.equal(
    out.summary,
    "They shipped the landing page but still haven't talked to a user.",
  );
  assert.deepEqual(out.commitments, ["Email 5 beta users", "Ship pricing page"]);
  assert.deepEqual(out.key_points, ["Solo founder", "Launch blocked on copy"]);
});

test("parseSummaryJson strips ```json code fences", () => {
  const out = parseSummaryJson(
    '```json\n{"summary":"Picked a niche.","commitments":[],"key_points":["B2B dentists"]}\n```',
  );
  assert.equal(out.summary, "Picked a niche.");
  assert.deepEqual(out.commitments, []);
  assert.deepEqual(out.key_points, ["B2B dentists"]);
});

test("parseSummaryJson falls back to raw prose when output isn't JSON", () => {
  const out = parseSummaryJson(
    "The founder is avoiding sales and hiding in the product.",
  );
  assert.equal(
    out.summary,
    "The founder is avoiding sales and hiding in the product.",
  );
  assert.deepEqual(out.commitments, []);
  assert.deepEqual(out.key_points, []);
});

test("parseSummaryJson returns a non-empty fallback summary for empty input", () => {
  const out = parseSummaryJson("");
  assert.equal(typeof out.summary, "string");
  assert.ok(out.summary.length > 0);
  assert.deepEqual(out.commitments, []);
  assert.deepEqual(out.key_points, []);
});

test("parseSummaryJson coerces non-array / non-string array members away", () => {
  const out = parseSummaryJson(
    '{"summary":"X","commitments":"not an array","key_points":["keep",42,null,"  "," trim me "]}',
  );
  assert.equal(out.summary, "X");
  assert.deepEqual(out.commitments, []);
  assert.deepEqual(out.key_points, ["keep", "trim me"]);
});

test("parseSummaryJson caps arrays at 5 items", () => {
  const out = parseSummaryJson(
    '{"summary":"X","commitments":["a","b","c","d","e","f","g"],"key_points":[]}',
  );
  assert.equal(out.commitments.length, 5);
  assert.deepEqual(out.commitments, ["a", "b", "c", "d", "e"]);
});

test("parseSummaryJson uses the fallback when summary key is blank", () => {
  const out = parseSummaryJson('{"summary":"   ","commitments":[],"key_points":[]}');
  assert.ok(out.summary.length > 0);
  assert.notEqual(out.summary.trim(), "");
});

// ---------------------------------------------------------------------------
// qualifiesForSummary — the summarise-at-next-start condition. mode='chat' is
// enforced by the route's query; this gate covers substance + idempotency.
// ---------------------------------------------------------------------------

test("qualifiesForSummary is true for an un-summarised session with >= 4 messages", () => {
  assert.equal(
    qualifiesForSummary({ summary: null, message_count: 4 }),
    true,
  );
  assert.equal(
    qualifiesForSummary({ summary: null, message_count: 31 }),
    true,
  );
});

test("qualifiesForSummary is false once a summary exists (idempotency)", () => {
  assert.equal(
    qualifiesForSummary({ summary: "Already summarised.", message_count: 20 }),
    false,
  );
  // Even the non-null fallback string blocks re-summarising.
  assert.equal(
    qualifiesForSummary({
      summary: "Session recorded — no summary could be generated.",
      message_count: 12,
    }),
    false,
  );
});

test("qualifiesForSummary is false for thin sessions (< 4 messages)", () => {
  assert.equal(
    qualifiesForSummary({ summary: null, message_count: 3 }),
    false,
  );
  assert.equal(
    qualifiesForSummary({ summary: null, message_count: 0 }),
    false,
  );
});
