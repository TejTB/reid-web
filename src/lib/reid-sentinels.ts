// Parser + processor for Reid's structured sentinels.
//
// Reid emits four kinds of sentinel inline with his response:
//
//   [GOAL_UPDATE]          goalTitle="..." delta=NN note="..."
//   [SESSION_COMPLETE]     summary="..." task="..."
//   [ONBOARDING_COMPLETE]  summary="..." task="..." goals=[ { ... }, ... ]
//   [EMAIL_CAPTURED]       email="..."
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
import {
  applyGoalDelta,
  createGoalsFromOnboarding,
  endSession,
  type OnboardingGoalInput,
} from "./session-server";

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

export interface ParsedSentinels {
  /** The raw response with every sentinel removed (the chat-visible text). */
  cleanText: string;
  goalUpdates: GoalUpdateSentinel[];
  sessionComplete: SessionCompleteSentinel | null;
  onboardingComplete: OnboardingCompleteSentinel | null;
  emailCaptured: string | null;
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

// Belt-and-braces: any bracketed sentinel name we didn't formally match.
// Strips the rest of the line so a malformed tag doesn't leak.
const STRAY_SENTINEL_RE =
  /\[(GOAL_UPDATE|SESSION_COMPLETE|ONBOARDING_COMPLETE|EMAIL_CAPTURED)\][^\n]*/g;

// ----- parseSentinels ------------------------------------------------------

export function parseSentinels(raw: string): ParsedSentinels {
  const result: ParsedSentinels = {
    cleanText: "",
    goalUpdates: [],
    sessionComplete: null,
    onboardingComplete: null,
    emailCaptured: null,
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
    const titleIndex = new Map<string, string>();
    for (const g of (goalRows ?? []) as Array<{ id: string; title: string }>) {
      titleIndex.set(g.title.trim().toLowerCase(), g.id);
    }
    for (const update of parsed.goalUpdates) {
      const goalId = titleIndex.get(update.goalTitle.trim().toLowerCase());
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
}
