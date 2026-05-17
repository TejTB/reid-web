// GET /api/cron/reengage
//
// Sprint 7 Agent 3 — daily 48h re-engagement nag.
//
// Vercel cron hits this at 09:00 UTC daily (see vercel.json). For every
// founder who has:
//   1. an email on file
//   2. last_session_at older than 48 hours
//   3. an open onboarding task (no onboarding_task_completed_at)
//   4. no re-engage email in the last 48 hours (last_reengage_email_at)
//
// …we send a plain-text "You went quiet" email in Reid's voice and stamp
// last_reengage_email_at = now() so the next run debounces correctly.
//
// Auth: Vercel cron attaches `Authorization: Bearer ${CRON_SECRET}` when the
// CRON_SECRET env var is set. If it isn't, we accept the `x-vercel-cron`
// header as a fall-back (Vercel always sets this on cron-originated GETs).
//
// Database access goes through the service-role admin client because we
// need to read every user; RLS on `users` only permits self-reads.
//
// Per-user errors are caught and logged so a single bad row does not abort
// the batch. Returns a summary { processed, sent, skipped, errored }.

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { reengageEmail, sendEmail } from "@/lib/email";

const HOUR_MS = 60 * 60 * 1000;
const QUIET_HOURS = 48;
const DEBOUNCE_HOURS = 48;

interface ReengageUser {
  id: string;
  email: string | null;
  onboarding_task: string | null;
  onboarding_task_completed_at: string | null;
  last_session_at: string | null;
  last_reengage_email_at: string | null;
}

interface RunSummary {
  processed: number;
  sent: number;
  skipped: number;
  errored: number;
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    return auth === `Bearer ${expected}`;
  }
  // Fall-back: Vercel always sets x-vercel-cron on cron-originated GETs.
  return req.headers.get("x-vercel-cron") !== null;
}

async function handleOne(
  db: SupabaseClient,
  user: ReengageUser,
  now: Date,
): Promise<"sent" | "skipped"> {
  if (!user.email) return "skipped";
  if (!user.onboarding_task) return "skipped";
  if (user.onboarding_task_completed_at) return "skipped";
  if (!user.last_session_at) return "skipped";

  const lastSession = new Date(user.last_session_at);
  if (Number.isNaN(lastSession.getTime())) return "skipped";
  const sessionAgeHours = (now.getTime() - lastSession.getTime()) / HOUR_MS;
  if (sessionAgeHours < QUIET_HOURS) return "skipped";

  if (user.last_reengage_email_at) {
    const lastSent = new Date(user.last_reengage_email_at);
    if (Number.isNaN(lastSent.getTime()) === false) {
      const sentAgeHours = (now.getTime() - lastSent.getTime()) / HOUR_MS;
      if (sentAgeHours < DEBOUNCE_HOURS) return "skipped";
    }
  }

  const daysQuiet = Math.max(1, Math.floor(sessionAgeHours / 24));
  const { subject, text } = reengageEmail(daysQuiet, user.onboarding_task);
  const sent = await sendEmail({ to: user.email, subject, text });
  if (!sent) return "skipped";

  await db
    .from("users")
    .update({ last_reengage_email_at: new Date().toISOString() })
    .eq("id", user.id);

  return "sent";
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = new Date();
  const summary: RunSummary = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errored: 0,
  };

  const cutoffIso = new Date(now.getTime() - QUIET_HOURS * HOUR_MS).toISOString();

  const { data: userRows, error: userErr } = await db
    .from("users")
    .select(
      "id, email, onboarding_task, onboarding_task_completed_at, last_session_at, last_reengage_email_at",
    )
    .eq("onboarding_complete", true)
    .not("email", "is", null)
    .not("onboarding_task", "is", null)
    .is("onboarding_task_completed_at", null)
    .lt("last_session_at", cutoffIso);

  if (userErr) {
    console.error("[reengage] user fetch failed:", userErr);
    return Response.json({ error: "user fetch failed" }, { status: 500 });
  }

  const users = (userRows ?? []) as ReengageUser[];
  for (const user of users) {
    summary.processed += 1;
    try {
      const outcome = await handleOne(db, user, now);
      if (outcome === "sent") summary.sent += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.errored += 1;
      console.error(`[reengage] user ${user.id} failed:`, err);
    }
  }

  return Response.json({
    ok: true,
    processed: summary.processed,
    sent: summary.sent,
    skipped: summary.skipped,
    errored: summary.errored,
  });
}
