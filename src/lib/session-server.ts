// Server-side helpers for the new sessions + messages tables.
//
// These run inside route handlers (server runtime) and use the same anon
// supabase client as the rest of the app — RLS on public.sessions and
// public.messages is anon-permissive (see migration 20260516120000). No
// service role key is involved.

import { supabase } from "./supabase";
import type { Message, Session } from "@/types/db";

/** Returns the user's sessions, newest first, with the seven columns the
 *  UI cares about. */
export async function getSessions(userId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, user_id, started_at, ended_at, summary, task_set, message_count")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error || !data) return [];
  return data as Session[];
}

/** Creates a new session row and returns its id. Throws on failure — the
 *  route handler is responsible for surfacing the error. */
export async function createSession(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId })
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
 *  We read the current session_count first because there is no atomic
 *  increment available via supabase-js with anon RLS. This is best-effort
 *  — concurrent turns on the same user could under-count, which is fine
 *  for the current single-device, single-tab usage model. */
export async function endSession(
  sessionId: string,
  options: {
    userId: string;
    summary?: string | null;
    taskSet?: string | null;
    messageCountDelta?: number;
    bumpUserCounters?: boolean;
  },
): Promise<void> {
  const {
    userId,
    summary,
    taskSet,
    messageCountDelta = 0,
    bumpUserCounters = false,
  } = options;

  // Read current message_count so we can apply the delta without a
  // service-role atomic increment.
  const { data: current } = await supabase
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

  await supabase.from("sessions").update(sessionUpdate).eq("id", sessionId);

  if (bumpUserCounters) {
    const { data: u } = await supabase
      .from("users")
      .select("session_count")
      .eq("id", userId)
      .maybeSingle();
    await supabase
      .from("users")
      .update({
        last_session_at: new Date().toISOString(),
        session_count: (u?.session_count ?? 0) + 1,
      })
      .eq("id", userId);
  } else {
    // Even without bumping the counter, keep last_session_at fresh — the
    // home screen uses it for the "Last session: …" subtitle.
    await supabase
      .from("users")
      .update({ last_session_at: new Date().toISOString() })
      .eq("id", userId);
  }
}

/** Bulk-inserts message rows for the given session/user. */
export async function appendMessages(
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
  await supabase.from("messages").insert(rows);
}

/** Loads all messages for a single session in ascending order. The user_id
 *  filter is defensive — even with anon-permissive RLS, we never want a
 *  client mis-supplying a sessionId to read another user's history. Returns
 *  empty array on miss/error. */
export async function getMessagesForSession(
  userId: string,
  sessionId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
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
  userId: string,
  limit: number,
): Promise<{ session: Session; messages: Message[] }[]> {
  const { data: sessionRows, error } = await supabase
    .from("sessions")
    .select("id, user_id, started_at, ended_at, summary, task_set, message_count")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error || !sessionRows || sessionRows.length === 0) return [];

  const sessions = sessionRows as Session[];
  const ids = sessions.map((s) => s.id);

  const { data: msgRows } = await supabase
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

  // Return chronological (oldest session first) so the UI can render top→bottom.
  return sessions
    .slice()
    .reverse()
    .map((session) => ({
      session,
      messages: grouped.get(session.id) ?? [],
    }));
}

/** Returns true iff the session exists AND belongs to the given user.
 *  Used by the API route to decide whether to honor a client-supplied
 *  sessionId or create a fresh one. */
export async function sessionBelongsTo(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  return !!data && data.user_id === userId;
}
