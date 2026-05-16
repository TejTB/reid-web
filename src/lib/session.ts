"use client";
import { supabase } from "./supabase";
import type { Goal, GoalEvent, Session, User } from "@/types/db";

const KEY = "reid:userId";
const ONBOARDED_KEY = "reid:onboarded";
const CHAT_SESSION_KEY = "reid:chatSessionId";

/** The active /chat sessionId, set the first time the user POSTs to /api/reid
 *  from the chat page (server returns it via the X-Reid-Session-Id header).
 *  Kept separate from the onboarding session so /chat never shows the
 *  onboarding conversation. Cleared by `clearSession`. */
export function getChatSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CHAT_SESSION_KEY);
}

export function setChatSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  if (!sessionId) return;
  localStorage.setItem(CHAT_SESSION_KEY, sessionId);
}

export function clearChatSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHAT_SESSION_KEY);
}

export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDED_KEY) === "true";
}

export function setOnboardedFlag(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, userId);
  localStorage.setItem(ONBOARDED_KEY, "true");
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(ONBOARDED_KEY);
  localStorage.removeItem(CHAT_SESSION_KEY);
  // Clear the push opt-in "asked" flag so a fresh onboarding can re-prompt
  // for notifications on the next session-1 / session-2 home visit.
  localStorage.removeItem("reid:push:asked");
  // Also wipe per-task done flags — leftover flags from the previous session
  // would otherwise resurrect (in /tasks or /home) once a new user reaches a
  // task with the same id under a fresh userId.
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("reid:task:")) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
  } catch {
    // ignore — best-effort cleanup
  }
}

export function ensureUserId(): string {
  if (typeof window === "undefined") throw new Error("ensureUserId server-side");
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    void supabase.from("users").insert({ id, onboarding_complete: false });
  }
  return id;
}

export function setUserName(userId: string, name: string): void {
  void supabase.from("users").update({ name }).eq("id", userId);
}

export async function getUser(
  userId: string,
): Promise<Pick<
  User,
  | "id"
  | "name"
  | "onboarding_complete"
  | "onboarding_summary"
  | "onboarding_task"
  | "last_session_at"
  | "session_count"
  | "streak_days"
> | null> {
  const { data } = await supabase
    .from("users")
    .select(
      "id, name, onboarding_complete, onboarding_summary, onboarding_task, last_session_at, session_count, streak_days",
    )
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function markOnboardingComplete(
  userId: string,
  summary?: string | null,
  task?: string | null,
): Promise<boolean> {
  const update: {
    onboarding_complete: boolean;
    onboarding_summary?: string;
    onboarding_task?: string;
  } = {
    onboarding_complete: true,
  };
  if (summary && summary.trim()) update.onboarding_summary = summary.trim();
  if (task && task.trim()) update.onboarding_task = task.trim();

  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase
      .from("users")
      .update(update)
      .eq("id", userId)
      .select("id, onboarding_complete")
      .maybeSingle();
    if (!error) {
      const confirmed = await getUser(userId);
      if (confirmed?.onboarding_complete === true) return true;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return false;
}

export function persistUserId(userId: string): void {
  if (typeof window === "undefined") return;
  if (!userId) return;
  localStorage.setItem(KEY, userId);
}

/** Client-side mirror of `getSessions` from `session-server.ts`. Used by the
 *  /plan page to render the timeline directly from the browser — RLS on
 *  public.sessions is anon-permissive, so no server round-trip is needed. */
export async function getSessions(userId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, user_id, started_at, ended_at, summary, task_set, message_count",
    )
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return data as Session[];
}

/** Returns the user's goals — primary first, then oldest first. RLS on
 *  public.goals is anon-permissive so this can run from the browser. */
export async function getGoals(userId: string): Promise<Goal[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, user_id, title, description, target_value, current_value, unit, unit_prefix, deadline, is_primary, completed_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as Goal[];
}

/** A goal event flattened with the joined goal's title + unit metadata,
 *  so the feed UI can render "+£500 New revenue" without a second round-trip. */
export type GoalEventWithGoal = GoalEvent & {
  goal_title: string;
  goal_unit: string;
  goal_unit_prefix: boolean;
};

/** Returns the most recent goal events for a user with the parent goal's
 *  title + unit + unit_prefix pre-joined. Each row is flattened to a
 *  `GoalEventWithGoal`. */
export async function getGoalEvents(
  userId: string,
  limit: number = 20,
): Promise<GoalEventWithGoal[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("goal_events")
    .select(
      "id, goal_id, user_id, session_id, delta, note, created_at, goals(title, unit, unit_prefix)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((e) => {
    // supabase-js types embedded relations as an array OR object depending on
    // inferred FK cardinality. Normalise both shapes through the same cast.
    const joinedRaw = e.goals as unknown as
      | { title: string; unit: string; unit_prefix: boolean }
      | { title: string; unit: string; unit_prefix: boolean }[]
      | null;
    const joined = Array.isArray(joinedRaw) ? joinedRaw[0] ?? null : joinedRaw;
    return {
      id: e.id as string,
      goal_id: e.goal_id as string,
      user_id: e.user_id as string,
      session_id: (e.session_id as string | null) ?? null,
      delta: e.delta as number,
      note: (e.note as string | null) ?? null,
      created_at: e.created_at as string,
      goal_title: joined?.title ?? "",
      goal_unit: joined?.unit ?? "",
      goal_unit_prefix: joined?.unit_prefix ?? true,
    };
  });
}
