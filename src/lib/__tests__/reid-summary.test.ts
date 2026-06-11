import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSummaryJson,
  qualifiesForSummary,
  synthesizeOnboardingGoals,
  isPlausibleFirstName,
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

// ---------------------------------------------------------------------------
// synthesizeOnboardingGoals — the force-complete goal seed (Sprint 13). The
// hard-cap path must NEVER produce an empty goals array again: that's what
// left force-completed founders with an empty /home.

test("synthesizes exactly one primary, binary goal from the first commitment", () => {
  const goals = synthesizeOnboardingGoals({
    summary: "Founder is building a B2B analytics tool, stuck on pricing.",
    commitments: ["Ship the pricing page", "Email three prospects"],
    key_points: ["Solo founder", "Pre-revenue"],
  });
  assert.equal(goals.length, 1);
  assert.deepEqual(goals[0], {
    title: "Ship the pricing page",
    description: "Founder is building a B2B analytics tool, stuck on pricing.",
    target_value: 1,
    unit: "done",
    unit_prefix: false,
    is_primary: true,
  });
});

test("skips blank commitments and falls back to the default title when none are usable", () => {
  const fromBlank = synthesizeOnboardingGoals({
    summary: "Thin session.",
    commitments: ["   ", ""],
    key_points: [],
  });
  assert.equal(fromBlank[0].title, "Lock in your first win");

  const fromEmpty = synthesizeOnboardingGoals({
    summary: "Thin session.",
    commitments: [],
    key_points: [],
  });
  assert.equal(fromEmpty[0].title, "Lock in your first win");
  assert.equal(fromEmpty[0].is_primary, true);
  assert.equal(fromEmpty[0].target_value, 1);
});

test("caps a runaway commitment title at 80 chars", () => {
  const long = "Ship ".repeat(40);
  const goals = synthesizeOnboardingGoals({
    summary: "s",
    commitments: [long],
    key_points: [],
  });
  assert.equal(goals[0].title.length, 80);
});

test("the fallback summary sentence never leaks into the goal description", () => {
  const goals = synthesizeOnboardingGoals({
    summary: "Session recorded — no summary could be generated.",
    commitments: ["Do the thing"],
    key_points: [],
  });
  assert.equal(goals[0].description, null);
});

test("never returns an empty array — the seed path must always run", () => {
  const goals = synthesizeOnboardingGoals({
    summary: "",
    commitments: [],
    key_points: [],
  });
  assert.equal(goals.length, 1);
});

// ---- isPlausibleFirstName: placeholder pseudo-names (B1.6) ------------------
// Prod evidence: the model emitted [NAME_CAPTURED] name="Unknown" for users
// whose signup name was lost, and "Unknown" passed the plausibility check and
// was written to users.name (phaseb-p1/p2, Sprint 13 audit).

test("placeholder pseudo-names are not plausible first names", () => {
  for (const bad of [
    "Unknown",
    "unknown",
    "Founder",
    "User",
    "Anonymous",
    "Anon",
    "Unnamed",
    "None",
    "Nobody",
    "Someone",
  ]) {
    assert.equal(isPlausibleFirstName(bad), false, bad);
  }
});

test("real names still pass the plausibility check", () => {
  for (const good of ["Theo", "Maya", "Noah", "O'Brien", "Mary-Jane"]) {
    assert.equal(isPlausibleFirstName(good), true, good);
  }
});
