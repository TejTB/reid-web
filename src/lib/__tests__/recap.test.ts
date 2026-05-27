import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRecap } from "../recap.ts";

test("clamps strings and extracts all fields", () => {
  const r = clampRecap({
    title: "  Noah outreach  ",
    summary: "Decided to ship the DM test.",
    commitments: ["DM 10 founders", "", 5, "Ship landing page"],
    reid_note: "You stalled on sales again.",
    avoiding: "Talking to paying users.",
    mood: "determined",
  });
  assert.equal(r.title, "Noah outreach");
  assert.equal(r.summary, "Decided to ship the DM test.");
  assert.deepEqual(r.commitments, ["DM 10 founders", "Ship landing page"]);
  assert.equal(r.reid_note, "You stalled on sales again.");
  assert.equal(r.avoiding, "Talking to paying users.");
  assert.equal(r.mood, "determined");
});

test("defaults to empty fields on garbage input", () => {
  const r = clampRecap(null);
  assert.deepEqual(r, { title: "", summary: "", commitments: [], reid_note: "", avoiding: "", mood: "" });
});

test("caps lengths (mood<=40, avoiding<=200, commitments<=6)", () => {
  const r = clampRecap({
    mood: "x".repeat(100),
    avoiding: "y".repeat(500),
    commitments: Array.from({ length: 10 }, (_, i) => `c${i}`),
  });
  assert.equal(r.mood.length, 40);
  assert.equal(r.avoiding.length, 200);
  assert.equal(r.commitments.length, 6);
});
