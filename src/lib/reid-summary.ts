// Parser for Reid's onboarding-complete closing message.
//
// DEPRECATED for new code paths: as of Sprint 5 the route uses
// `parseSentinels` from `./reid-sentinels` which supersedes
// `parseOnboardingClose` and `summaryForHome`. Those exports are kept here
// because:
//   - the onboarding client still parses raw streamed text for legacy reasons
//   - `extractName` is still the canonical name extractor used by the route
//
// New code should call `parseSentinels` instead.
//
// Two shapes are accepted by the legacy parser:
//
// 1. Structured one-liner:
//
//      [ONBOARDING_COMPLETE] summary="…one sentence…" task="…one concrete action…"
//
// 2. Legacy labeled block (very old persisted conversations):
//
//      [ONBOARDING_COMPLETE]
//      Here is what I heard: ...
//      The real opportunity: ...
//      Your task for tomorrow: ...
//
// `summary`/`task` are the canonical fields going forward.
// `heard`/`opportunity` are populated only when the legacy block is detected.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMessagesForSession,
  type OnboardingGoalInput,
} from "./session-server.ts";

export const ONBOARDING_SENTINEL = "[ONBOARDING_COMPLETE]";

export type OnboardingClose = {
  hasSentinel: boolean;
  /** New canonical one-sentence summary (structured format), or derived from
   *  the legacy "heard" line when only the old format is present. */
  summary: string | null;
  /** Single concrete next action. Populated from either format. */
  task: string | null;
  /** Legacy: kept so old persisted conversations still parse cleanly. */
  heard: string | null;
  /** Legacy: kept so old persisted conversations still parse cleanly. */
  opportunity: string | null;
  /** Body with sentinel removed, but otherwise unmodified. Falls back to
   *  the whole text when no sentinel is present. */
  body: string;
};

/** @deprecated Use `parseSentinels` from `./reid-sentinels` instead. */
export function parseOnboardingClose(text: string): OnboardingClose {
  const trimmed = text.trim();
  const hasSentinel =
    trimmed.startsWith(ONBOARDING_SENTINEL) ||
    trimmed.includes(ONBOARDING_SENTINEL);
  const body = hasSentinel
    ? trimmed.replace(ONBOARDING_SENTINEL, "").trim()
    : trimmed;
  if (!hasSentinel) {
    return {
      hasSentinel: false,
      summary: null,
      task: null,
      heard: null,
      opportunity: null,
      body,
    };
  }

  // Structured form: summary="…" task="…" — match against the original
  // trimmed text so we don't depend on label order or whitespace.
  const summaryMatch = trimmed.match(/summary="([^"]*)"/i);
  const taskMatchStructured = trimmed.match(/task="([^"]*)"/i);
  let summary: string | null = summaryMatch ? summaryMatch[1].trim() || null : null;
  let task: string | null = taskMatchStructured
    ? taskMatchStructured[1].trim() || null
    : null;

  // Legacy labeled form — fill in whatever the structured match didn't catch.
  const heard = extractLabeled(body, /here\s+is\s+what\s+i\s+heard:/i);
  const opportunity = extractLabeled(body, /the\s+real\s+opportunity:/i);
  const legacyTask = extractLabeled(body, /your\s+task\s+for\s+tomorrow:/i);
  if (!task && legacyTask) task = legacyTask;
  if (!summary) {
    const legacyParts: string[] = [];
    if (heard) legacyParts.push(heard);
    if (opportunity) legacyParts.push(opportunity);
    if (legacyParts.length > 0) summary = legacyParts.join(" ");
  }

  return { hasSentinel, summary, task, heard, opportunity, body };
}

function extractLabeled(body: string, label: RegExp): string | null {
  const m = body.match(label);
  if (!m || m.index === undefined) return null;
  // Take everything after the label until the next labeled line or EOF.
  const after = body.slice(m.index + m[0].length);
  const nextLabel = after.search(
    /\n\s*(here\s+is\s+what\s+i\s+heard:|the\s+real\s+opportunity:|your\s+task\s+for\s+tomorrow:)/i,
  );
  const slice = nextLabel === -1 ? after : after.slice(0, nextLabel);
  return slice.trim() || null;
}

/** Summary string for the home "YOUR FOCUS" card. Prefers the new structured
 *  `summary` field. Falls back to the legacy heard+opportunity pair, then to
 *  the raw body.
 *  @deprecated Use the cleaned `summary` from `parseSentinels` instead. */
export function summaryForHome(close: OnboardingClose): string | null {
  if (close.summary && close.summary.trim()) return close.summary.trim();
  const parts: string[] = [];
  if (close.heard) parts.push(close.heard);
  if (close.opportunity) parts.push(close.opportunity);
  if (parts.length > 0) return parts.join("\n\n");
  return close.body.trim() || null;
}

// Known false positives the old firstWord fallback used to surface as names.
// Includes the common opener-verb traps ("Building", "Trying", "Making") plus
// startup-context nouns and discourse markers that would never be a real
// first name. Lowercased so the check is case-insensitive.
const NAME_STOPLIST = new Set([
  // discourse markers / greetings
  "the", "my", "hi", "hey", "so", "ok", "okay", "yeah", "yes", "no", "well",
  "actually", "honestly", "basically", "literally", "currently", "right",
  // hedges & adverbs that follow "I'm" — the "I'm almost ready" trap
  "almost", "nearly", "kind", "kinda", "sort", "sorta", "just", "still", "going",
  "ready", "done", "fine", "good", "great", "happy", "tired", "totally",
  "pretty", "very", "super", "really", "always", "never", "maybe", "probably",
  "trying", "stuck", "lost", "new", "back", "here", "out", "off", "on",
  // common opener verbs (the "Building a SaaS" trap)
  "building", "making", "working", "doing", "thinking", "looking",
  "planning", "starting", "running", "writing", "creating", "developing",
  "selling", "growing", "scaling", "launching", "shipping", "designing",
  "researching", "validating", "testing", "exploring", "considering",
  // pitch nouns
  "founder", "founding", "ceo", "team", "company", "startup", "product",
  "business", "service", "platform", "app", "tool", "idea", "project",
  // grammar fillers
  "an", "a",
  // placeholder pseudo-names the model emits when it never learned a name —
  // prod evidence: [NAME_CAPTURED] name="Unknown" written to users.name
  // (B1.6, Sprint 13 audit)
  "unknown", "user", "anonymous", "anon", "unnamed", "none", "nobody",
  "someone", "unclear", "na",
]);

/** Returns true when `name` looks like a real first name: 1-20 chars,
 *  alpha-only (with apostrophes/hyphens permitted for "O'Brien" / "Mary-Jane"),
 *  no whitespace, and not on the stoplist of common opener-verb / pitch-noun
 *  false positives. Used at every write site (extractor, sentinel processor,
 *  defensive render) so a bad value can't sneak through. */
export function isPlausibleFirstName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  if (/\s/.test(trimmed)) return false;
  if (!/^[A-Za-zÀ-ÿ'-]+$/.test(trimmed)) return false;
  if (NAME_STOPLIST.has(trimmed.toLowerCase())) return false;
  return true;
}

function normaliseFirstName(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Strips ONE fully-wrapping straight/smart quote pair. The model sometimes
 *  recites its scripted opener inside literal quotes despite the "No quotes"
 *  rule (5/20 recent prod openers, Sprint 13 audit — B1.7). Inner quotes and
 *  unbalanced wrapping are left alone. */
export function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["“", "”"], // “ ”
    ["'", "'"],
  ];
  for (const [open, close] of pairs) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
      return t.slice(open.length, t.length - close.length).trim();
    }
  }
  return t;
}

export function extractName(input: string | Array<{ role: string; content: string }>): string | null {
  const messages = typeof input === "string"
    ? [{ role: "user" as const, content: input }]
    : input.filter((m) => m.role === "user").slice(0, 4);

  for (const msg of messages) {
    if (!msg.content) continue;
    const text = msg.content.trim();

    // Sentence-anchored intro patterns. These require an explicit "I'm" /
    // "I am" / "This is" / "<Name> here" anchor so we never grab whatever
    // capitalised word happens to lead a sentence.
    const introPatterns: RegExp[] = [
      /^I'?m\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^I am\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^This is\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^([A-Z][a-z]{1,20})\s+here(?=[,.!?\s]|$)/,
    ];
    for (const re of introPatterns) {
      const m = text.match(re);
      if (m) {
        const candidate = normaliseFirstName(m[1]);
        if (isPlausibleFirstName(candidate)) return candidate;
      }
    }

    // NOTE: no `i` flag — with `i`, `[A-Z]` matches lowercase letters too,
    // which turns "i'm almost ready" into a name match for "almost". Connector
    // alternations are spelled out in both cases instead.
    const phraseMatch = text.match(
      /(?:^|\s)(?:[Ii]'?[mM]|[Ii] [aA][mM]|[Mm]y [Nn]ame(?:'s| is)|[Ii][tT]'?[sS]|[Cc]all me)\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
    );
    if (phraseMatch) {
      const candidate = normaliseFirstName(phraseMatch[1]);
      if (isPlausibleFirstName(candidate)) return candidate;
    }

    // The old `firstWord` fallback used to fire here. Removed deliberately —
    // it caught any capitalised opener ("Building a SaaS for X" → "Building")
    // and was the root cause of the "Good afternoon, Building." bug.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Session summarisation (Sprint 12 Build B).
//
// Session summaries used to be written ONLY when the model emitted
// [SESSION_COMPLETE], which it almost never did — so `sessions.summary` was
// 0/159 non-null in prod and the next-session recap had nothing to read. The
// fix is to summarise the founder's most recent prior CHAT session lazily, at
// the START of their next session, before building that session's context.
//
// The generation runs on a Haiku-class model (one-shot JSON extraction, not
// dialogue) and ALWAYS writes a non-null summary — a minimal fallback string
// on model/parse failure. That non-null write is the idempotency mechanism:
// `qualifiesForSummary` gates on `summary IS NULL`, so a session is summarised
// at most once and never re-attempted. `outcome_captured` is deliberately left
// alone — it keeps its existing "productive session" meaning.
// ---------------------------------------------------------------------------

export interface SessionSummaryResult {
  /** One honest sentence. Never empty — falls back to SUMMARY_FALLBACK. */
  summary: string;
  /** Concrete things the founder said they'd do. Capped, may be empty. */
  commitments: string[];
  /** A few facts worth remembering next session. Capped, may be empty. */
  key_points: string[];
}

/** Written when the model call or its JSON output can't yield a real summary.
 *  Non-null on purpose: it marks the session as processed so the summariser
 *  never retries it (and never taxes time-to-first-token again). */
const SUMMARY_FALLBACK = "Session recorded — no summary could be generated.";

const SUMMARY_SYSTEM = `You are summarising one coaching session between Reid (a blunt, honest co-founder/advisor) and a founder, so Reid can pick the thread back up next time.

Return ONLY a JSON object — no prose, no markdown fences, no commentary. Exactly these keys:
  "summary": one honest sentence describing what actually happened this session. No flattery. Concrete.
  "commitments": array of short strings — specific things the founder said they would DO before next time. Empty array if none.
  "key_points": array of short strings — the few facts worth remembering next session (what they're building, a blocker, a person, a deadline). Empty array if none.

Keep each array to at most 5 items. Each item one short clause. If the transcript is too thin to summarise, still return the JSON with a best-effort summary and empty arrays.`;

/** Coerces an unknown value into a clean, capped string array. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .slice(0, 5);
}

/** Parses the model's raw output into a SessionSummaryResult. Tolerant of
 *  ```json fences and of non-JSON output: malformed JSON degrades to using the
 *  raw text as the summary (capped), or SUMMARY_FALLBACK when there's nothing
 *  usable. Pure + exported so the gating/parse logic is unit-testable without
 *  touching the network. */
export function parseSummaryJson(raw: string): SessionSummaryResult {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const summary =
      typeof obj.summary === "string" && obj.summary.trim().length > 0
        ? obj.summary.trim()
        : SUMMARY_FALLBACK;
    return {
      summary,
      commitments: toStringArray(obj.commitments),
      key_points: toStringArray(obj.key_points),
    };
  } catch {
    // Not JSON. If the model returned plain prose, use it as the summary so we
    // still capture *something*; otherwise fall back. Arrays stay empty.
    const summary = cleaned.length > 0 ? cleaned.slice(0, 280) : SUMMARY_FALLBACK;
    return { summary, commitments: [], key_points: [] };
  }
}

/** Generates a structured summary from a session's transcript via a Haiku-
 *  class model. Never throws and never returns an empty summary — model or
 *  parse failures degrade to SUMMARY_FALLBACK. The Anthropic client is
 *  imported lazily so this module stays side-effect-free at load (the pure
 *  helpers above can be imported in tests without an API key). */
export async function generateSessionSummary(
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<SessionSummaryResult> {
  if (messages.length === 0) {
    return { summary: SUMMARY_FALLBACK, commitments: [], key_points: [] };
  }
  const transcript = messages
    .map((m) => `${m.role === "user" ? "Founder" : "Reid"}: ${m.content}`)
    .join("\n");

  try {
    const { anthropic, REID_SUMMARY_MODEL } = await import("./anthropic.ts");
    const msg = await anthropic.messages.create({
      model: REID_SUMMARY_MODEL,
      max_tokens: 512,
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: transcript }],
    });
    const raw = msg.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    return parseSummaryJson(raw);
  } catch {
    return { summary: SUMMARY_FALLBACK, commitments: [], key_points: [] };
  }
}

/** Sprint 13 — synthesises the goal seed for the FORCE-complete path. When
 *  onboarding hits the hard cap without the model emitting
 *  [ONBOARDING_COMPLETE], the server generates the summary but historically
 *  passed `goals: []`, so `createGoalsFromOnboarding` never fired and a
 *  force-completed founder landed on an empty /home. This derives ONE minimal,
 *  binary goal from the synthesised close so the seed path always runs: the
 *  founder's first stated commitment becomes the title (it's already "a
 *  specific thing the founder said they would DO"); with no commitments we
 *  fall back to a blunt default. Pure + exported for unit testing. */
export function synthesizeOnboardingGoals(
  result: SessionSummaryResult,
): OnboardingGoalInput[] {
  const commitment = result.commitments
    .map((c) => c.trim())
    .find((c) => c.length > 0);
  const title = (commitment ?? "Lock in your first win").slice(0, 80);
  return [
    {
      title,
      description: result.summary === SUMMARY_FALLBACK ? null : result.summary,
      target_value: 1,
      unit: "done",
      unit_prefix: false,
      is_primary: true,
    },
  ];
}

/** Decides whether a prior session should be summarised at next-session start.
 *  The condition: it has never been summarised AND it has real substance.
 *  `mode === 'chat'` is enforced by the caller's query (only chat sessions are
 *  summarised into `sessions.summary`; onboarding has its own
 *  `users.onboarding_summary`). Pure + exported for unit testing. */
export function qualifiesForSummary(session: {
  summary: string | null;
  message_count: number;
}): boolean {
  return session.summary === null && session.message_count >= 4;
}

/** Loads a prior session's messages, generates a structured summary, and
 *  writes `summary` + `commitments` + `key_points` back to the session row.
 *  Always writes a non-null summary (idempotency). Best-effort: a failed write
 *  is swallowed by the caller's try/catch. Does NOT touch `outcome_captured`. */
export async function summarisePriorSession(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  const msgs = await getMessagesForSession(db, userId, sessionId);
  const result = await generateSessionSummary(
    msgs.map((m) => ({ role: m.role, content: m.content })),
  );
  await db
    .from("sessions")
    .update({
      summary: result.summary,
      commitments: result.commitments,
      key_points: result.key_points,
    })
    .eq("id", sessionId);
}
