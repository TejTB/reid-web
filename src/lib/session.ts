"use client";
import { supabase } from "./supabase";
import type { User } from "@/types/db";

const KEY = "reid:userId";
const ONBOARDED_KEY = "reid:onboarded";

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
