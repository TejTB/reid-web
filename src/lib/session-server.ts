// Server-side helpers for the new sessions + messages tables.
//
// These run inside route handlers. Every helper accepts a request-scoped
// SupabaseClient (built from the auth cookie via `createServerSupabase`) so
// RLS evaluates against the signed-in user. No service-role bypass.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Message,
  Observation,
  ObservationConfidence,
  Session,
} from "@/types/db";
import { isSessionClosed } from "./session-policy.ts";

/** Shape of a single goal item captured during onboarding. The Reid model
 *  emits these as JSON in the onboarding-complete sentinel; we accept them
 *  here for bulk insert. */
export interface OnboardingGoalInput {
  title: string;
  description?: string | null;
  target_value: number;
  unit: string;
  /** true → unit comes before the number (e.g. "£500"); false → after
   *  (e.g. "5 clients"). Defaults to true server-side if omitted. */
  unit_prefix?: boolean;
  deadline?: string | null;
  is_primary?: boolean;
}

/** Returns the user's sessions, newest first, with the seven columns the
 *  UI cares about. */
export async function getSessions(
  db: SupabaseClient,
  userId: string,
): Promise<Session[]> {
  const { data, error } = await db
    .from("sessions")
    .select("id, user_id, started_at, ended_at, summary, task_set, message_count")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return data as Session[];
}

/** Creates a new session row and returns its id. Throws on failure — the
 *  route handler is responsible for surfacing the error.
 *
 *  `mode` distinguishes onboarding sessions from real chat sessions. Only
 *  `chat` rows count toward the free-tier session quota; only `chat` rows
 *  should ever bump `users.session_count`. Defaults to `chat` to match the
 *  column default. */
export async function createSession(
  db: SupabaseClient,
  userId: string,
  mode: "chat" | "onboarding" = "chat",
): Promise<string> {
  const { data, error } = await db
    .from("sessions")
    .insert({ user_id: userId, mode })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`createSession failed: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

/** Marks a session as ended at "now" and bumps message_count by delta.
 *  Optionally writes the summary / task_set fields (used when we observe
 *  the [ONBOARDING_COMPLETE] sentinel). Also bumps the user's
 *  last_session_at and session_count.
 *
 *  No atomic increment available via supabase-js with RLS; this is
 *  best-effort and matches the single-tab usage model. */
export async function endSession(
  db: SupabaseClient,
  sessionId: string,
  options: {
    userId: string;
    summary?: string | null;
    taskSet?: string | null;
    /** Structured memory (B1.3): things the founder said they'd do. */
    commitments?: string[] | null;
    /** Structured memory (B1.3): facts worth remembering next session. */
    keyPoints?: string[] | null;
    messageCountDelta?: number;
    bumpUserCounters?: boolean;
  },
): Promise<void> {
  const {
    userId,
    summary,
    taskSet,
    commitments,
    keyPoints,
    messageCountDelta = 0,
    bumpUserCounters = false,
  } = options;

  const { data: current } = await db
    .from("sessions")
    .select("message_count")
    .eq("id", sessionId)
    .maybeSingle();
  const nextCount =
    (current?.message_count ?? 0) + (messageCountDelta || 0);

  const sessionUpdate: Record<string, unknown> = {
    ended_at: new Date().toISOString(),
    message_count: nextCount,
  };
  if (summary !== undefined && summary !== null) sessionUpdate.summary = summary;
  if (taskSet !== undefined && taskSet !== null) sessionUpdate.task_set = taskSet;
  if (commitments && commitments.length > 0) sessionUpdate.commitments = commitments;
  if (keyPoints && keyPoints.length > 0) sessionUpdate.key_points = keyPoints;

  await db.from("sessions").update(sessionUpdate).eq("id", sessionId);

  if (bumpUserCounters) {
    const { data: u } = await db
      .from("users")
      .select("session_count")
      .eq("id", userId)
      .maybeSingle();
    await db
      .from("users")
      .update({
        last_session_at: new Date().toISOString(),
        session_count: (u?.session_count ?? 0) + 1,
      })
      .eq("id", userId);
    await updateStreak(db, userId, new Date());
  } else {
    await db
      .from("users")
      .update({ last_session_at: new Date().toISOString() })
      .eq("id", userId);
  }
}

// ----- streak --------------------------------------------------------------

/** Returns a YYYY-MM-DD string for the given Date in Europe/London (BST/GMT-
 *  aware via the runtime ICU). The product is UK-anchored, so streak
 *  boundaries follow the user's wall-clock day, not UTC or server-local. */
function ukDay(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

/** Increments users.streak_days when a session completes on a new UK day.
 *  No-op if a session has already counted today. Resets to 1 if the previous
 *  session was older than yesterday or never. The .neq() predicate guards
 *  against double-increment from near-simultaneous SESSION_COMPLETE events. */
export async function updateStreak(
  db: SupabaseClient,
  userId: string,
  completedAt: Date,
): Promise<void> {
  const today = ukDay(completedAt);
  // Anchor the "yesterday" math at noon UK so DST hour shifts (29 Mar 2026)
  // can't slip the date by a day.
  const yesterday = ukDay(
    new Date(Date.parse(`${today}T12:00:00Z`) - 24 * 60 * 60 * 1000),
  );

  const { data: user } = await db
    .from("users")
    .select("streak_days, last_session_date")
    .eq("id", userId)
    .maybeSingle();

  const last = (user?.last_session_date as string | null) ?? null;
  const prev = (user?.streak_days as number | null) ?? 0;

  if (last === today) return;

  const next = last === yesterday ? prev + 1 : 1;

  await db
    .from("users")
    .update({ streak_days: next, last_session_date: today })
    .eq("id", userId)
    .neq("last_session_date", today);
}

/** Drops the cached `generated_take` text on every observation, goal, and
 *  task row for the given user. Called when a session wraps so the next
 *  "Reid's take" click regenerates against the freshest founder context. */
export async function clearGeneratedTakesForUser(
  db: SupabaseClient,
  userId: string,
): Promise<void> {
  // Three independent updates rather than a single RPC: avoids a custom
  // pgfunction and keeps each table's RLS in scope.
  await Promise.allSettled([
    db
      .from("observations")
      .update({ generated_take: null })
      .eq("user_id", userId)
      .not("generated_take", "is", null),
    db
      .from("goals")
      .update({ generated_take: null })
      .eq("user_id", userId)
      .not("generated_take", "is", null),
    db
      .from("tasks")
      .update({ generated_take: null })
      .eq("user_id", userId)
      .not("generated_take", "is", null),
  ]);
}

/** Bulk-inserts message rows for the given session/user. */
export async function appendMessages(
  db: SupabaseClient,
  sessionId: string,
  userId: string,
  msgs: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  if (msgs.length === 0) return;
  const rows = msgs.map((m) => ({
    session_id: sessionId,
    user_id: userId,
    role: m.role,
    content: m.content,
  }));
  await db.from("messages").insert(rows);
}

/** Loads all messages for a single session in ascending order. user_id is a
 *  defensive filter on top of RLS. */
export async function getMessagesForSession(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<Message[]> {
  const { data, error } = await db
    .from("messages")
    .select("id, session_id, user_id, role, content, created_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as Message[];
}

/** Loads the user's most recent `limit` sessions (newest first) along with
 *  every message in each, returned in chronological order (oldest session
 *  first). Used to render multi-session chat history with dividers. */
export async function getRecentSessionsWithMessages(
  db: SupabaseClient,
  userId: string,
  limit: number,
): Promise<{ session: Session; messages: Message[] }[]> {
  const { data: sessionRows, error } = await db
    .from("sessions")
    .select("id, user_id, started_at, ended_at, summary, task_set, message_count")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error || !sessionRows || sessionRows.length === 0) return [];

  const sessions = sessionRows as Session[];
  const ids = sessions.map((s) => s.id);

  const { data: msgRows } = await db
    .from("messages")
    .select("id, session_id, user_id, role, content, created_at")
    .in("session_id", ids)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const messages = (msgRows ?? []) as Message[];

  const grouped = new Map<string, Message[]>();
  for (const m of messages) {
    const arr = grouped.get(m.session_id) ?? [];
    arr.push(m);
    grouped.set(m.session_id, arr);
  }

  return sessions
    .slice()
    .reverse()
    .map((session) => ({
      session,
      messages: grouped.get(session.id) ?? [],
    }));
}

/** True iff the session exists, belongs to the user, AND is still open
 *  (not summarised, not at its hard cap, not idle past the timeout).
 *  Closed sessions must never be resumed — resuming them starved
 *  summarise-at-next-start and bypassed the 20-message cap (the
 *  founder-account memory bug, Sprint 13 audit). An idle-closed session
 *  falls into the new-session path, whose summarise-at-next-start gives it
 *  its summary lazily. */
export async function sessionBelongsToAndOpen(
  db: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("sessions")
    .select("id, user_id, mode, summary, message_count, ended_at, started_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || data.user_id !== userId) return false;
  return !isSessionClosed(
    {
      mode: (data.mode as string) ?? "chat",
      summary: (data.summary as string | null) ?? null,
      message_count: (data.message_count as number | null) ?? 0,
      last_activity_at:
        (data.ended_at as string | null) ??
        (data.started_at as string | null) ??
        null,
    },
    Date.now(),
  );
}

/** Per-turn bookkeeping: bumps message_count, stamps the session's
 *  last-activity timestamp, and refreshes the user's last_session_at.
 *  NOTE the column wart, on purpose: `ended_at` IS the last-activity
 *  timestamp (no updated_at column exists; every consumer already reads it
 *  as activity). Closure is never inferred from ended_at — see
 *  session-policy.ts. Extracted from endSession so the per-turn path stops
 *  pretending to end the session. */
export async function recordTurnActivity(
  db: SupabaseClient,
  sessionId: string,
  userId: string,
  messageCountDelta: number,
): Promise<void> {
  const { data: current } = await db
    .from("sessions")
    .select("message_count")
    .eq("id", sessionId)
    .maybeSingle();
  await db
    .from("sessions")
    .update({
      message_count: (current?.message_count ?? 0) + (messageCountDelta || 0),
      ended_at: new Date().toISOString(), // last-activity stamp (see note)
    })
    .eq("id", sessionId);
  await db
    .from("users")
    .update({ last_session_at: new Date().toISOString() })
    .eq("id", userId);
}

/** Records a goal_event, advances the goal's current_value, and stamps
 *  completed_at the first time current_value crosses target_value. Returns
 *  true on success. Best-effort with no transaction. */
export async function applyGoalDelta(
  db: SupabaseClient,
  goalId: string,
  userId: string,
  sessionId: string | null,
  delta: number,
  note: string | null,
): Promise<boolean> {
  if (!goalId || !userId) return false;

  const { error: eventError } = await db.from("goal_events").insert({
    goal_id: goalId,
    user_id: userId,
    session_id: sessionId,
    delta,
    note: note ?? null,
  });
  if (eventError) return false;

  const { data: goal, error: readError } = await db
    .from("goals")
    .select("current_value, target_value, completed_at")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError || !goal) return false;

  const current = Number(goal.current_value ?? 0);
  const target = Number(goal.target_value ?? 0);
  const newValue = Math.max(0, current + delta);

  const update: Record<string, unknown> = { current_value: newValue };
  if (newValue >= target && !goal.completed_at) {
    update.completed_at = new Date().toISOString();
  }

  const { error: updateError } = await db
    .from("goals")
    .update(update)
    .eq("id", goalId)
    .eq("user_id", userId);
  return !updateError;
}

/** Bulk-inserts the goals captured during onboarding. Enforces "at most one
 *  primary": if multiple inputs are flagged is_primary, the first marked
 *  primary keeps the flag and the rest are downgraded. Returns true on
 *  success (or true vacuously if the input is empty). */
export async function createGoalsFromOnboarding(
  db: SupabaseClient,
  userId: string,
  goalsJson: OnboardingGoalInput[],
): Promise<boolean> {
  if (!userId) return false;
  if (!Array.isArray(goalsJson) || goalsJson.length === 0) return true;

  let primarySeen = false;
  const rows = goalsJson.map((g) => {
    const wantsPrimary = g.is_primary === true;
    let isPrimary = false;
    if (wantsPrimary && !primarySeen) {
      isPrimary = true;
      primarySeen = true;
    }
    return {
      user_id: userId,
      title: g.title,
      description: g.description ?? null,
      target_value: g.target_value,
      unit: g.unit,
      unit_prefix: g.unit_prefix ?? true,
      deadline: g.deadline ?? null,
      is_primary: isPrimary,
    };
  });

  const { error } = await db.from("goals").insert(rows);
  return !error;
}

// ----- observations --------------------------------------------------------

/** Returns the user's observations, newest first, capped at `limit`. */
export async function getMyObservations(
  db: SupabaseClient,
  limit: number = 50,
): Promise<Observation[]> {
  const { data, error } = await db
    .from("observations")
    .select("id, user_id, session_id, text, confidence, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as Observation[];
}

/** Inserts a single observation. user_id is supplied so the call site can
 *  read it back without a follow-up SELECT — RLS will reject a mismatched
 *  user_id, so we still rely on the auth cookie for safety. */
export async function insertObservation(
  db: SupabaseClient,
  userId: string,
  sessionId: string | null,
  text: string,
  confidence: ObservationConfidence,
): Promise<boolean> {
  if (!userId || !text.trim()) return false;
  const { error } = await db.from("observations").insert({
    user_id: userId,
    session_id: sessionId,
    text: text.trim(),
    confidence,
  });
  return !error;
}
