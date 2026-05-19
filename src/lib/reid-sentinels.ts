// Parser + processor for Reid's structured sentinels.
//
// Reid emits these sentinels inline with his response:
//
//   [GOAL_UPDATE]          goalTitle="..." delta=NN note="..."
//   [SESSION_COMPLETE]     summary="..." task="..."
//   [ONBOARDING_COMPLETE]  summary="..." task="..." goals=[ { ... }, ... ]
//   [EMAIL_CAPTURED]       email="..."
//   [NAME_CAPTURED]        name="..."
//   [OBSERVATION]          text="..." confidence=high|medium|low
//
// `parseSentinels(raw)` runs over the final assistant response, extracts all
// matches, and returns the cleaned text alongside structured payloads.
//
// `processSentinels(parsed, userId, sessionId)` writes those payloads to
// Supabase. It is best-effort: individual failures are swallowed so one bad
// update does not poison the whole session wrap.
//
// Name extraction during onboarding is NOT handled here. The route handler
// does it separately because only the route has the message history.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ObservationConfidence } from "@/types/db";
import {
  applyGoalDelta,
  createGoalsFromOnboarding,
  endSession,
  insertObservation,
  type OnboardingGoalInput,
} from "./session-server";
import { isPlausibleFirstName } from "./reid-summary";

// ----- types --------------------------------------------------------------

export interface GoalUpdateSentinel {
  goalTitle: string;
  delta: number;
  note: string | null;
}

export interface SessionCompleteSentinel {
  summary: string;
  task: string | null;
}

export interface OnboardingCompleteSentinel {
  summary: string;
  task: string | null;
  goals: OnboardingGoalInput[];
}

export interface ObservationSentinel {
  text: string;
  confidence: ObservationConfidence;
}

export interface ParsedSentinels {
  /** The raw response with every sentinel removed (the chat-visible text). */
  cleanText: string;
  goalUpdates: GoalUpdateSentinel[];
  sessionComplete: SessionCompleteSentinel | null;
  onboardingComplete: OnboardingCompleteSentinel | null;
  emailCaptured: string | null;
  nameCaptured: string | null;
  observations: ObservationSentinel[];
}

// ----- prefixes used by the streaming stripper ----------------------------

/** All sentinel prefixes Reid is allowed to emit. The streaming-side
 *  sentinel stripper holds back tokens that could be the start of one of
 *  these until it can rule them out. Kept in one place so the stripper and
 *  the parser stay in sync. */
export const SENTINEL_PREFIXES = [
  "[GOAL_UPDATE]",
  "[SESSION_COMPLETE]",
  "[ONBOARDING_COMPLETE]",
  "[EMAIL_CAPTURED]",
  "[NAME_CAPTURED]",
  "[OBSERVATION]",
] as const;

/** Length of the longest possible sentinel prefix. Used to size the
 *  lookahead buffer in the streaming stripper. */
export const MAX_SENTINEL_PREFIX_LEN = SENTINEL_PREFIXES.reduce(
  (max, s) => Math.max(max, s.length),
  0,
);

// ----- regexes -------------------------------------------------------------

// [GOAL_UPDATE] goalTitle="..." delta=N note="..." -- note is optional.
const GOAL_UPDATE_RE =
  /\[GOAL_UPDATE\]\s*goalTitle="([^"]*)"\s+delta=(-?\d+(?:\.\d+)?)\s*(?:note="([^"]*)")?/g;

// [SESSION_COMPLETE] summary="..." task="..." -- task is optional.
const SESSION_COMPLETE_RE =
  /\[SESSION_COMPLETE\]\s*summary="([^"]*)"\s*(?:task="([^"]*)")?/;

// [ONBOARDING_COMPLETE] summary="..." task="..." goals=[ ... ]
// The goals JSON may span multiple lines and contain nested objects, so we
// match its bracket span non-greedily.
const ONBOARDING_COMPLETE_RE =
  /\[ONBOARDING_COMPLETE\]\s*summary="([^"]*)"\s*task="([^"]*)"\s*goals=(\[[\s\S]*?\])/;

// [EMAIL_CAPTURED] email="..."
const EMAIL_CAPTURED_RE = /\[EMAIL_CAPTURED\]\s*email="([^"]+)"/;

// [NAME_CAPTURED] name="..."
const NAME_CAPTURED_RE = /\[NAME_CAPTURED\]\s*name="([^"]+)"/;

// [OBSERVATION] text="..." confidence=high|medium|low -- zero or one per
// session, may repeat in malformed sessions; we capture every well-formed
// match and dedupe by trimmed text.
const OBSERVATION_RE =
  /\[OBSERVATION\]\s*text="([^"]+)"\s+confidence=(high|medium|low)\b/g;

// Belt-and-braces: any bracketed sentinel name we didn't formally match.
// Strips the rest of the line so a malformed tag doesn't leak.
const STRAY_SENTINEL_RE =
  /\[(GOAL_UPDATE|SESSION_COMPLETE|ONBOARDING_COMPLETE|EMAIL_CAPTURED|NAME_CAPTURED|OBSERVATION)\][^\n]*/g;

// ----- parseSentinels ------------------------------------------------------

export function parseSentinels(raw: string): ParsedSentinels {
  const result: ParsedSentinels = {
    cleanText: "",
    goalUpdates: [],
    sessionComplete: null,
    onboardingComplete: null,
    emailCaptured: null,
    nameCaptured: null,
    observations: [],
  };

  if (typeof raw !== "string" || raw.trim().length === 0) {
    result.cleanText = "";
    return result;
  }

  let working = raw;

  // ----- ONBOARDING_COMPLETE first; it carries goals JSON that we don't
  // want any of the other regexes to nibble at.
  const obMatch = working.match(ONBOARDING_COMPLETE_RE);
  if (obMatch) {
    const summary = obMatch[1].trim();
    const taskValue = obMatch[2].trim();
    const goalsJsonText = obMatch[3];
    let goals: OnboardingGoalInput[] = [];
    try {
      const parsed = JSON.parse(goalsJsonText);
      if (Array.isArray(parsed)) {
        goals = parsed
          .filter(
            (g): g is Record<string, unknown> =>
              !!g &&
              typeof g === "object" &&
              typeof (g as { title?: unknown }).title === "string",
          )
          .map((g) => ({
            title: String(g.title),
            description:
              typeof g.description === "string"
                ? (g.description as string)
                : null,
            target_value:
              typeof g.target_value === "number"
                ? (g.target_value as number)
                : Number(g.target_value),
            unit: typeof g.unit === "string" ? (g.unit as string) : "",
            unit_prefix:
              typeof g.unit_prefix === "boolean"
                ? (g.unit_prefix as boolean)
                : undefined,
            deadline:
              typeof g.deadline === "string" ? (g.deadline as string) : null,
            is_primary:
              typeof g.is_primary === "boolean"
                ? (g.is_primary as boolean)
                : false,
          }))
          .filter((g) => g.title.length > 0 && Number.isFinite(g.target_value));
      }
    } catch {
      // Malformed JSON. Keep summary/task; drop goals.
      goals = [];
    }
    result.onboardingComplete = {
      summary,
      task: taskValue || null,
      goals,
    };
    working = working.replace(ONBOARDING_COMPLETE_RE, "");
  }

  // ----- SESSION_COMPLETE
  const scMatch = working.match(SESSION_COMPLETE_RE);
  if (scMatch) {
    const summary = scMatch[1].trim();
    const taskValue = (scMatch[2] ?? "").trim();
    if (summary.length > 0) {
      result.sessionComplete = {
        summary,
        task: taskValue.length > 0 ? taskValue : null,
      };
    }
    working = working.replace(SESSION_COMPLETE_RE, "");
  }

  // ----- EMAIL_CAPTURED
  const emMatch = working.match(EMAIL_CAPTURED_RE);
  if (emMatch) {
    const email = emMatch[1].trim();
    if (email.length > 0 && email.includes("@")) {
      result.emailCaptured = email;
    }
    working = working.replace(EMAIL_CAPTURED_RE, "");
  }

  // ----- NAME_CAPTURED
  const nmMatch = working.match(NAME_CAPTURED_RE);
  if (nmMatch) {
    // First token only, normalised, validated against the plausibility check.
    // Rejecting at the parser layer prevents a model hallucination ("name=
    // \"Building\"") from ever reaching the users.name column.
    const rawName = nmMatch[1].trim();
    const firstToken = rawName.split(/\s+/)[0] ?? "";
    const normalised =
      firstToken.length > 0
        ? firstToken.charAt(0).toUpperCase() +
          firstToken.slice(1).toLowerCase()
        : "";
    if (isPlausibleFirstName(normalised)) {
      result.nameCaptured = normalised;
    }
    working = working.replace(NAME_CAPTURED_RE, "");
  }

  // ----- OBSERVATION (zero or more, deduped by trimmed text)
  OBSERVATION_RE.lastIndex = 0;
  let obsMatch: RegExpExecArray | null;
  const seenObs = new Set<string>();
  while ((obsMatch = OBSERVATION_RE.exec(working)) !== null) {
    const text = obsMatch[1].trim();
    const confidence = obsMatch[2] as ObservationConfidence;
    if (!text || seenObs.has(text.toLowerCase())) continue;
    seenObs.add(text.toLowerCase());
    result.observations.push({ text, confidence });
  }
  working = working.replace(OBSERVATION_RE, "");

  // ----- GOAL_UPDATE (zero or more)
  GOAL_UPDATE_RE.lastIndex = 0;
  let guMatch: RegExpExecArray | null;
  while ((guMatch = GOAL_UPDATE_RE.exec(working)) !== null) {
    const goalTitle = guMatch[1].trim();
    const delta = Number(guMatch[2]);
    const note = (guMatch[3] ?? "").trim();
    if (goalTitle.length > 0 && Number.isFinite(delta)) {
      result.goalUpdates.push({
        goalTitle,
        delta,
        note: note.length > 0 ? note : null,
      });
    }
  }
  working = working.replace(GOAL_UPDATE_RE, "");

  // Last line of defence against malformed tags.
  working = working.replace(STRAY_SENTINEL_RE, "");

  // Collapse extra whitespace left behind but preserve intentional paragraph
  // breaks.
  result.cleanText = working
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}

// ----- fuzzy goal title matching ------------------------------------------

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "my",
  "our",
]);

/** Lowercases, strips punctuation, splits on whitespace, drops stopwords.
 *  Tokens shorter than 2 chars are dropped — they don't usefully discriminate. */
function tokenize(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Picks the best fuzzy match for the given title among `goals`, or null if
 *  no candidate meets the 0.6 Jaccard threshold. Ties are broken by shorter
 *  title (the simpler match is preferred). */
function fuzzyMatchGoalId(
  emittedTitle: string,
  goals: Array<{ id: string; title: string }>,
): string | null {
  if (!emittedTitle || goals.length === 0) return null;
  const emittedTokens = tokenize(emittedTitle);
  if (emittedTokens.size === 0) return null;

  let bestId: string | null = null;
  let bestScore = 0;
  let bestTitleLen = Infinity;
  const THRESHOLD = 0.6;
  for (const g of goals) {
    const score = jaccard(emittedTokens, tokenize(g.title));
    if (score < THRESHOLD) continue;
    if (
      score > bestScore ||
      (score === bestScore && g.title.length < bestTitleLen)
    ) {
      bestScore = score;
      bestId = g.id;
      bestTitleLen = g.title.length;
    }
  }
  return bestId;
}

// ----- processSentinels ----------------------------------------------------

/** Writes everything in `parsed` to Supabase. Best-effort: per-item failures
 *  (e.g. a [GOAL_UPDATE] for a goal title that does not exist on this user)
 *  are swallowed silently. Returns nothing.
 *
 *  Onboarding name extraction is NOT done here -- the route handler does it
 *  with access to the message history. */
export async function processSentinels(
  db: SupabaseClient,
  parsed: ParsedSentinels,
  userId: string,
  sessionId: string | null,
): Promise<void> {
  if (!userId) return;

  // --- Goal updates ---
  if (parsed.goalUpdates.length > 0) {
    const { data: goalRows } = await db
      .from("goals")
      .select("id, title")
      .eq("user_id", userId);
    const goals = (goalRows ?? []) as Array<{ id: string; title: string }>;
    const titleIndex = new Map<string, string>();
    for (const g of goals) {
      titleIndex.set(g.title.trim().toLowerCase(), g.id);
    }
    for (const update of parsed.goalUpdates) {
      const lower = update.goalTitle.trim().toLowerCase();
      // Exact match first (cheap and authoritative). Falls back to fuzzy
      // token-overlap matching for cases where Reid emits a slightly
      // different title than the one in the DB ("Revenue this month" vs
      // "Monthly revenue"). Threshold 0.6 Jaccard on alphanumeric word
      // tokens; below threshold the update is dropped to avoid mislabelling.
      const goalId =
        titleIndex.get(lower) ?? fuzzyMatchGoalId(update.goalTitle, goals);
      if (!goalId) continue;
      try {
        await applyGoalDelta(
          db,
          goalId,
          userId,
          sessionId,
          update.delta,
          update.note,
        );
      } catch {
        // ignore
      }
    }
  }

  // --- Onboarding complete ---
  if (parsed.onboardingComplete) {
    const ob = parsed.onboardingComplete;
    try {
      await db
        .from("users")
        .update({
          onboarding_complete: true,
          onboarding_summary: ob.summary || null,
          onboarding_task: ob.task,
          onboarding_goals: ob.goals,
        })
        .eq("id", userId);
    } catch {
      // ignore
    }
    if (ob.goals.length > 0) {
      try {
        await createGoalsFromOnboarding(db, userId, ob.goals);
      } catch {
        // ignore
      }
    }
  }

  // --- Session complete ---
  if (parsed.sessionComplete && sessionId) {
    try {
      await endSession(db, sessionId, {
        userId,
        summary: parsed.sessionComplete.summary,
        taskSet: parsed.sessionComplete.task,
        bumpUserCounters: true,
      });
      // Also create a real tasks row so the /tasks page surfaces the
      // commitment and so outcome-detection has something to count.
      // (Until sprint 11 the task only lived as text in sessions.task_set.)
      if (parsed.sessionComplete.task) {
        try {
          await db.from("tasks").insert({
            user_id: userId,
            session_id: sessionId,
            description: parsed.sessionComplete.task,
          });
        } catch {
          // ignore — duplicate or constraint failure should not block flow
        }
      }
    } catch {
      // ignore
    }
  }

  // --- Email captured ---
  if (parsed.emailCaptured) {
    try {
      await db
        .from("users")
        .update({ email: parsed.emailCaptured })
        .eq("id", userId);
    } catch {
      // ignore
    }
  }

  // --- Name captured --- only write when users.name is currently empty so
  // we never overwrite a user-edited name with whatever Reid heard.
  if (parsed.nameCaptured) {
    try {
      const { data: existing } = await db
        .from("users")
        .select("name")
        .eq("id", userId)
        .maybeSingle();
      const current = (existing?.name as string | null | undefined) ?? null;
      if (!current || current.trim().length === 0) {
        await db
          .from("users")
          .update({ name: parsed.nameCaptured })
          .eq("id", userId);
      }
    } catch {
      // ignore
    }
  }

  // --- Observations ---
  for (const obs of parsed.observations) {
    try {
      await insertObservation(
        db,
        userId,
        sessionId,
        obs.text,
        obs.confidence,
      );
    } catch {
      // ignore — per-observation failures stay silent so one bad insert
      // doesn't poison the rest of the wrap-up.
    }
  }
}
