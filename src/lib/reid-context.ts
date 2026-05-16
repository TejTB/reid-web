// Server-side context builder for the Reid system prompt.
//
// `getReidContext(db, userId)` returns a multi-line string prepended to the
// system prompt before each generation. The caller passes a request-scoped
// SupabaseClient so RLS evaluates against the signed-in user.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Goal,
  GoalEvent,
  Observation,
  Session,
  User,
} from "@/types/db";

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

export async function getReidContext(
  db: SupabaseClient,
  userId: string,
): Promise<string> {
  if (!userId) return "";

  const { data: userRow } = await db
    .from("users")
    .select(
      "id, name, email, onboarding_complete, onboarding_summary, onboarding_task, last_session_at, last_review_at, session_count, streak_days",
    )
    .eq("id", userId)
    .maybeSingle();
  const user = userRow as ContextUser | null;
  if (!user) return "";

  const { data: goalRows } = await db
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  const goals = (goalRows ?? []) as Goal[];

  const { data: sessionRows } = await db
    .from("sessions")
    .select("id, user_id, started_at, ended_at, summary, task_set, message_count")
    .eq("user_id", userId)
    .not("summary", "is", null)
    .order("started_at", { ascending: false })
    .limit(5);
  const recentSessions = (sessionRows ?? []) as Session[];

  const { data: observationRows } = await db
    .from("observations")
    .select("id, user_id, session_id, text, confidence, created_at")
    .eq("user_id", userId)
    .in("confidence", ["medium", "high"])
    .order("created_at", { ascending: false })
    .limit(8);
  const observations = (observationRows ?? []) as Observation[];

  const { data: eventRows } = await db
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

  if (goals.length > 0) {
    lines.push("ACTIVE GOALS");
    for (const g of goals) lines.push(formatGoal(g));
    lines.push("");
  }

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

  // PRIOR TASK — the most recent task_set from a closed session. Reid is
  // expected to open this session by asking about it unless the founder
  // leads with progress on it themselves.
  const priorTaskSession = recentSessions.find(
    (s) => s.task_set && s.task_set.trim().length > 0,
  );
  if (priorTaskSession?.task_set) {
    const when = formatDate(priorTaskSession.started_at);
    lines.push("PRIOR TASK");
    lines.push(`- task: ${priorTaskSession.task_set}`);
    if (when) lines.push(`- set on: ${when}`);
    lines.push("");
  }

  if (observations.length > 0) {
    lines.push("WHAT YOU'VE NOTICED");
    for (const o of observations) {
      lines.push(`- (${o.confidence}) ${o.text}`);
    }
    lines.push("");
  }

  if (recentSessions.length > 0) {
    lines.push("RECENT SESSIONS");
    for (const s of recentSessions) {
      const when = formatDate(s.started_at) ?? s.started_at;
      lines.push(`- ${when}: ${s.summary}`);
      if (s.task_set) lines.push(`  task set: ${s.task_set}`);
    }
    lines.push("");
  }

  lines.push(
    "Use this context. Reference goals by their exact title when emitting [GOAL_UPDATE]. If PRIOR TASK is present, your first question this session should be about it — unless the founder leads with progress on it themselves. Lean on WHAT YOU'VE NOTICED to push them where they avoid pushing themselves. Don't recap the context at them; let it inform your questions.",
  );
  lines.push("=== END CONTEXT ===");

  return lines.join("\n");
}
