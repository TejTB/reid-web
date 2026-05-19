"use client";
import { supabase } from "./supabase";
import { FREE_SESSIONS } from "./session-shared";
import type { Goal, GoalEvent, Session, User } from "@/types/db";

const CHAT_SESSION_KEY = "reid:chatSessionId";

/** Free-tier session quota — re-exported from session-shared.ts so the value
 *  can also be read from server code (which can't import this "use client"
 *  module). */
export { FREE_SESSIONS };

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

export {
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validatePassword,
} from "./validators";

const GENERIC_LOGIN_ERROR =
  "That's not right. Check your email and password.";

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: { message: string } | null }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });
    if (res.ok) {
      // The server set HTTP-only cookies. The browser supabase client needs a
      // nudge to read them — without this the next `getSession()` (which
      // AuthProvider runs on mount) sees stale state and the post-auth route
      // gate (e.g. /onboarding) bounces back to /login.
      await primeBrowserSession();
      return { error: null };
    }
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as {
        retryAfter?: number;
      };
      const seconds = data.retryAfter ?? 60;
      return {
        error: {
          message: `Too many tries. Wait ${seconds}s and try again.`,
        },
      };
    }
    return { error: { message: GENERIC_LOGIN_ERROR } };
  } catch {
    return { error: { message: GENERIC_LOGIN_ERROR } };
  }
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ error: { message: string } | null }> {
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });
    if (res.ok) {
      // Same browser-session priming dance as login — see signInWithPassword.
      await primeBrowserSession();
      return { error: null };
    }
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as {
        retryAfter?: number;
      };
      const seconds = data.retryAfter ?? 60;
      return {
        error: {
          message: `Too many tries. Wait ${seconds}s and try again.`,
        },
      };
    }
    return { error: { message: "Could not create account. Try again." } };
  } catch {
    return { error: { message: "Could not create account. Try again." } };
  }
}

/** Force the browser supabase client to re-read the auth cookies the server
 *  just set. Without this the in-memory session stays stale until the next
 *  full reload, which makes router.replace("/onboarding"|"/home") bounce
 *  back to /login on the very first attempt. */
async function primeBrowserSession(): Promise<void> {
  try {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) return;
    await supabase.auth.getSession();
  } catch {
    // Best-effort — failure here means the next route load just sees the
    // pre-auth state and falls through to its own redirect.
  }
}

export async function requestPasswordReset(
  email: string,
): Promise<{ error: null }> {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/reset-password`
      : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) console.error("[requestPasswordReset]", error.message);
  return { error: null };
}

export async function updatePassword(
  password: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[updatePassword]", error.message);
    return { error: { message: "Could not update password. Try again." } };
  }
  return { error: null };
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
