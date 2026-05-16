"use client";
import { supabase } from "./supabase";
import type { Goal, GoalEvent, Session, User } from "@/types/db";

const CHAT_SESSION_KEY = "reid:chatSessionId";

/** The active /chat sessionId, set the first time the user POSTs to /api/reid
 *  from the chat page (server returns it via the X-Reid-Session-Id header).
 *  Kept separate from the auth session so /chat never shows the onboarding
 *  conversation. Cleared by `signOut`. */
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

export async function getClientSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signInWithMagicLink(
  email: string,
  next?: string | null,
): Promise<{ error: { message: string } | null }> {
  const redirectTo = (() => {
    const base = `${window.location.origin}/auth/callback`;
    if (!next) return base;
    return `${base}?next=${encodeURIComponent(next)}`;
  })();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  return { error: error ? { message: error.message } : null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  try {
    for (const k of [
      "reid:userId",
      "reid:onboarded",
      "reid:chatSessionId",
      "reid:push:asked",
    ]) {
      localStorage.removeItem(k);
    }
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("reid:task:")) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore — best-effort cleanup
  }
}

/** Profile reads — RLS scopes to the signed-in user automatically.
 *  Returns null if not signed in or no row exists. */
export async function getMe(): Promise<User | null> {
  const { data } = await supabase.from("users").select("*").maybeSingle();
  return (data as User | null) ?? null;
}

/** Returns the user's goals — primary first, then oldest first. RLS scopes to
 *  the signed-in user. */
export async function getMyGoals(): Promise<Goal[]> {
  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, user_id, title, description, target_value, current_value, unit, unit_prefix, deadline, is_primary, completed_at, created_at, updated_at",
    )
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

export async function getMyGoalEvents(
  limit: number = 20,
): Promise<GoalEventWithGoal[]> {
  const { data, error } = await supabase
    .from("goal_events")
    .select(
      "id, goal_id, user_id, session_id, delta, note, created_at, goals(title, unit, unit_prefix)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((e) => {
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

/** Returns the signed-in user's sessions, newest first. RLS scopes the read. */
export async function getMySessions(): Promise<Session[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, user_id, started_at, ended_at, summary, task_set, message_count",
    )
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return data as Session[];
}
