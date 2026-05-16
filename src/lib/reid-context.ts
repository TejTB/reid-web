// Server-side context builder for the Reid system prompt.
//
// `getReidContext(userId)` returns a multi-line string that's prepended to
// the system prompt before each generation. It tells the model who the
// founder is, what goals they've set, where they stand, what they've talked
// about recently, and which goal events have landed since.
//
// This module runs on the server only (no "use client" directive) and uses
// the anon `supabase` singleton — every table read here is covered by
// anon-permissive RLS.

import { supabase } from "./supabase";
import type { Goal, GoalEvent, Session, User } from "@/types/db";

type ContextUser = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "onboarding_complete"
  | "onboarding_summary"
  | "onboarding_task"
  | "last_session_at"
  | "last_review_at"
  | "session_count"
  | "streak_days"
>;

/** Renders a goal's "current / target unit" line. `unit_prefix` decides
 *  whether the unit is glued to the front (e.g. "£500") or trails after
 *  (e.g. "5 clients"). Numbers are rendered with no trailing decimals
 *  unless one is meaningful — `Intl.NumberFormat` with `maximumFractionDigits: 2`
 *  drops `.0` and keeps `.5` etc. */
function formatGoal(goal: Goal): string {
  const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
  const current = nf.format(Number(goal.current_value ?? 0));
  const target = nf.format(Number(goal.target_value ?? 0));
  const remaining = nf.format(
    Math.max(0, Number(goal.target_value ?? 0) - Number(goal.current_value ?? 0)),
  );

  const renderValue = (v: string) =>
    goal.unit_prefix ? `${goal.unit}${v}` : `${v} ${goal.unit}`;

  const parts: string[] = [];
  parts.push(`- ${goal.title}`);
  parts.push(`  ${renderValue(current)} / ${renderValue(target)}`);
  if (goal.completed_at) {
    parts.push(`  status: complete`);
  } else {
    parts.push(`  remaining: ${renderValue(remaining)}`);
  }
  if (goal.deadline) parts.push(`  deadline: ${goal.deadline}`);
  if (goal.is_primary) parts.push(`  primary goal`);
  return parts.join("\n");
}

/** Format an absolute date for prompt context — short, human, no timezone
 *  noise. We use the user's day in en-GB. */
function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Builds the FOUNDER CONTEXT prompt block for the given user. Returns "" if
 *  the user row can't be found — callers can pass the result directly into
 *  the system prompt and an empty context naturally degrades to the default
 *  prompt. */
export async function getReidContext(userId: string): Promise<string> {
  if (!userId) return "";

  const { data: userRow } = await supabase
    .from("users")
    .select(
      "id, name, email, onboarding_complete, onboarding_summary, onboarding_task, last_session_at, last_review_at, session_count, streak_days",
    )
    .eq("id", userId)
    .maybeSingle();
  const user = userRow as ContextUser | null;
  if (!user) return "";

  // Goals: primary first, then chronological.
  const { data: goalRows } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  const goals = (goalRows ?? []) as Goal[];

  // Recent sessions: only those that have actually wrapped (summary not null).
  // We limit to 5 and ignore in-flight sessions — callers will already have
  // the active session's transcript in `messages`.
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("id, user_id, started_at, ended_at, summary, task_set, message_count")
    .eq("user_id", userId)
    .not("summary", "is", null)
    .order("started_at", { ascending: false })
    .limit(5);
  const recentSessions = (sessionRows ?? []) as Session[];

  // Recent goal events with parent goal title joined.
  const { data: eventRows } = await supabase
    .from("goal_events")
    .select("id, goal_id, user_id, session_id, delta, note, created_at, goals(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const eventsRaw = (eventRows ?? []) as Array<
    GoalEvent & { goals: { title: string } | { title: string }[] | null }
  >;
  const events = eventsRaw
    .map((e) => {
      // supabase-js may return the join as array-or-object depending on the
      // foreign-key cardinality the inference picked. Normalise both.
      const joined = e.goals as { title: string } | { title: string }[] | null;
      const title = Array.isArray(joined)
        ? joined[0]?.title ?? null
        : joined?.title ?? null;
      if (!title) return null;
      return {
        delta: e.delta,
        note: e.note,
        created_at: e.created_at,
        goal_title: title,
      };
    })
    .filter(
      (e): e is { delta: number; note: string | null; created_at: string; goal_title: string } =>
        e !== null,
    );

  const lines: string[] = [];
  lines.push("=== FOUNDER CONTEXT ===");
  lines.push("");

  // --- Identity ---------------------------------------------------------
  lines.push("FOUNDER");
  lines.push(`- name: ${user.name ?? "unknown"}`);
  if (user.email) lines.push(`- email: ${user.email}`);
  lines.push(`- sessions completed: ${user.session_count ?? 0}`);
  lines.push(`- streak: ${user.streak_days ?? 0} day${(user.streak_days ?? 0) === 1 ? "" : "s"}`);
  const lastSession = formatDate(user.last_session_at);
  if (lastSession) lines.push(`- last session: ${lastSession}`);
  const lastReview = formatDate(user.last_review_at);
  if (lastReview) lines.push(`- last review: ${lastReview}`);
  lines.push("");

  // --- Onboarding summary (the original framing) ------------------------
  if (user.onboarding_summary) {
    lines.push("WHAT YOU LEARNED IN ONBOARDING");
    lines.push(user.onboarding_summary);
    lines.push("");
  }
  if (user.onboarding_task) {
    lines.push("THE TASK YOU SET THEM");
    lines.push(user.onboarding_task);
    lines.push("");
  }

  // --- Goals ------------------------------------------------------------
  if (goals.length > 0) {
    lines.push("ACTIVE GOALS");
    for (const g of goals) lines.push(formatGoal(g));
    lines.push("");
  }

  // --- Recent goal events ----------------------------------------------
  if (events.length > 0) {
    lines.push("RECENT PROGRESS EVENTS");
    for (const ev of events) {
      const sign = ev.delta >= 0 ? "+" : "";
      const when = formatDate(ev.created_at) ?? ev.created_at;
      const noteSuffix = ev.note ? ` — ${ev.note}` : "";
      lines.push(`- ${when}: ${ev.goal_title} ${sign}${ev.delta}${noteSuffix}`);
    }
    lines.push("");
  }

  // --- Recent sessions --------------------------------------------------
  if (recentSessions.length > 0) {
    lines.push("RECENT SESSIONS");
    for (const s of recentSessions) {
      const when = formatDate(s.started_at) ?? s.started_at;
      lines.push(`- ${when}: ${s.summary}`);
      if (s.task_set) lines.push(`  task set: ${s.task_set}`);
    }
    lines.push("");
  }

  // --- Trailer / instructions ------------------------------------------
  lines.push(
    "Use this context. Reference goals by their exact title when emitting [GOAL_UPDATE]. Notice when they come back having done — or not done — the task you set. Don't recap the context at them; let it inform your questions.",
  );
  lines.push("=== END CONTEXT ===");

  return lines.join("\n");
}
