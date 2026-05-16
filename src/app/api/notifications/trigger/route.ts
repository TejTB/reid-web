// POST /api/notifications/trigger
//
// Vercel cron hits this endpoint daily at 09:13 UTC (see vercel.json). Walks
// every onboarded user with an email on file and decides which of three
// notifications to fire:
//
//   1. task_overdue — fired when last_session_at is >48h ago AND a task is
//      still on the books, dedup'd per 48h via the notifications log.
//   2. goal_near    — fired per open goal once it crosses 80% of target,
//      dedup'd per goal per 7d.
//   3. weekly_review (Mondays only, dedup'd to once every 6+ days) — a
//      digest of the user's last 7 days.
//
// Auth: Vercel cron jobs auto-attach `Authorization: Bearer ${CRON_SECRET}`
// when CRON_SECRET is in env. We refuse anything that does not match.
//
// Database access uses the service-role admin client because we read every
// user (RLS on `users` only permits self-reads under authenticated sessions).

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  sendEmail,
  taskOverdueEmail,
  goalNearEmail,
  weeklyReviewEmail,
  type WeeklyReviewSummary,
} from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import type { Goal, GoalEvent, Notification, User } from "@/types/db";

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

function isoHoursAgo(now: Date, hoursAgo: number): string {
  return new Date(now.getTime() - hoursAgo * HOURS).toISOString();
}

async function recentNotification(
  db: SupabaseClient,
  userId: string,
  type: Notification["type"],
  sinceIso: string,
  payloadFilter?: { key: string; value: string },
): Promise<boolean> {
  let query = db
    .from("notifications")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("type", type)
    .gte("sent_at", sinceIso);
  if (payloadFilter) {
    query = query.eq(`payload->>${payloadFilter.key}`, payloadFilter.value);
  }
  const { count } = await query;
  return (count ?? 0) > 0;
}

async function logNotification(
  db: SupabaseClient,
  userId: string,
  type: Notification["type"],
  channel: Notification["channel"],
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("notifications").insert({
    user_id: userId,
    type,
    channel,
    payload,
  });
  if (error) {
    console.error("[trigger] log insert failed:", error);
  }
}

interface RunCounters {
  processed: number;
  errors: number;
}

type CronUser = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "onboarding_task"
  | "last_session_at"
  | "last_review_at"
  | "push_enabled"
>;

async function handleTaskOverdue(
  db: SupabaseClient,
  user: CronUser,
  now: Date,
): Promise<void> {
  if (!user.email || !user.onboarding_task || !user.last_session_at) return;
  const lastSession = new Date(user.last_session_at);
  if (Number.isNaN(lastSession.getTime())) return;
  if (now.getTime() - lastSession.getTime() < 48 * HOURS) return;

  const since = isoHoursAgo(now, 48);
  const recently = await recentNotification(db, user.id, "task_overdue", since);
  if (recently) return;

  const { subject, html } = taskOverdueEmail(user.name, user.onboarding_task);
  const sent = await sendEmail({ to: user.email, subject, html });
  if (user.push_enabled) {
    await sendPushToUser(db, user.id, {
      title: "You went quiet.",
      body: `The task hasn't moved. ${user.onboarding_task.slice(0, 80)}`,
      url: "/chat",
    });
  }
  if (sent) {
    await logNotification(db, user.id, "task_overdue", "email", {
      task: user.onboarding_task,
    });
  }
}

async function handleGoalNear(
  db: SupabaseClient,
  user: CronUser,
  now: Date,
): Promise<void> {
  if (!user.email) return;

  const { data: goalRows } = await db
    .from("goals")
    .select(
      "id, user_id, title, target_value, current_value, unit, unit_prefix, completed_at",
    )
    .eq("user_id", user.id)
    .is("completed_at", null);
  const goals = (goalRows ?? []) as Array<
    Pick<
      Goal,
      | "id"
      | "user_id"
      | "title"
      | "target_value"
      | "current_value"
      | "unit"
      | "unit_prefix"
      | "completed_at"
    >
  >;

  if (goals.length === 0) return;

  const since = new Date(now.getTime() - 7 * DAYS).toISOString();
  for (const g of goals) {
    const target = Number(g.target_value ?? 0);
    const current = Number(g.current_value ?? 0);
    if (target <= 0) continue;
    const pct = current / target;
    if (pct < 0.8 || pct >= 1) continue;

    const recently = await recentNotification(
      db,
      user.id,
      "goal_near",
      since,
      { key: "goal_id", value: g.id },
    );
    if (recently) continue;

    const remaining = Math.max(0, target - current);
    const { subject, html } = goalNearEmail(
      user.name,
      g.title,
      remaining,
      g.unit,
      g.unit_prefix,
    );
    const sent = await sendEmail({ to: user.email, subject, html });
    if (sent) {
      await logNotification(db, user.id, "goal_near", "email", {
        goal_id: g.id,
      });
    }
  }
}

async function handleWeeklyReview(
  db: SupabaseClient,
  user: CronUser,
  now: Date,
): Promise<void> {
  if (!user.email) return;
  if (now.getUTCDay() !== 1) return;

  if (user.last_review_at) {
    const last = new Date(user.last_review_at);
    if (
      !Number.isNaN(last.getTime()) &&
      now.getTime() - last.getTime() < 6 * DAYS
    ) {
      return;
    }
  }
  const sinceIso = isoHoursAgo(now, 6 * 24);
  const recently = await recentNotification(
    db,
    user.id,
    "weekly_review",
    sinceIso,
  );
  if (recently) return;

  const weekStart = new Date(now.getTime() - 7 * DAYS).toISOString();
  const { count: sessionCount } = await db
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("started_at", weekStart);

  const { data: eventRows } = await db
    .from("goal_events")
    .select(
      "id, goal_id, user_id, session_id, delta, note, created_at, goals(title, unit, unit_prefix)",
    )
    .eq("user_id", user.id)
    .gte("created_at", weekStart);
  type EventRow = GoalEvent & {
    goals:
      | { title: string; unit: string; unit_prefix: boolean }
      | { title: string; unit: string; unit_prefix: boolean }[]
      | null;
  };
  const events = (eventRows ?? []) as EventRow[];

  const perGoal = new Map<
    string,
    { goalTitle: string; delta: number; unit: string; unitPrefix: boolean }
  >();
  for (const e of events) {
    const joinedRaw = e.goals;
    const joined = Array.isArray(joinedRaw) ? joinedRaw[0] ?? null : joinedRaw;
    if (!joined) continue;
    const prior = perGoal.get(e.goal_id);
    if (prior) {
      prior.delta += Number(e.delta ?? 0);
    } else {
      perGoal.set(e.goal_id, {
        goalTitle: joined.title,
        delta: Number(e.delta ?? 0),
        unit: joined.unit,
        unitPrefix: joined.unit_prefix,
      });
    }
  }
  const goalDeltas = Array.from(perGoal.values()).filter((g) => g.delta !== 0);

  const summary: WeeklyReviewSummary = {
    sessionCount: sessionCount ?? 0,
    taskCompleted: false,
    lastTask: user.onboarding_task,
    goalDeltas,
  };

  const { subject, html } = weeklyReviewEmail(user.name, summary);
  const sent = await sendEmail({ to: user.email, subject, html });
  if (sent) {
    await db
      .from("users")
      .update({ last_review_at: new Date().toISOString() })
      .eq("id", user.id);
    await logNotification(db, user.id, "weekly_review", "email", {
      sessionCount: summary.sessionCount,
      goalDeltas: summary.goalDeltas,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const db = supabaseAdmin();
    const now = new Date();
    const counters: RunCounters = { processed: 0, errors: 0 };

    const { data: userRows, error: userErr } = await db
      .from("users")
      .select(
        "id, name, email, onboarding_task, last_session_at, last_review_at, push_enabled",
      )
      .eq("onboarding_complete", true)
      .not("email", "is", null);

    if (userErr) {
      console.error("[trigger] user fetch failed:", userErr);
      return Response.json({ error: "user fetch failed" }, { status: 500 });
    }

    const users = (userRows ?? []) as CronUser[];
    for (const user of users) {
      try {
        await handleTaskOverdue(db, user, now);
        await handleGoalNear(db, user, now);
        await handleWeeklyReview(db, user, now);
        counters.processed += 1;
      } catch (err) {
        counters.errors += 1;
        console.error(`[trigger] user ${user.id} failed:`, err);
      }
    }

    return Response.json({
      ok: true,
      processed: counters.processed,
      errors: counters.errors,
    });
  } catch (err) {
    console.error("[trigger] top-level failure:", err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
