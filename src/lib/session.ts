"use client";
import { supabase } from "./supabase";
import type { User } from "@/types/db";

const KEY = "reid:userId";

export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
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
): Promise<Pick<User, "id" | "name" | "onboarding_complete" | "onboarding_summary"> | null> {
  const { data } = await supabase
    .from("users")
    .select("id, name, onboarding_complete, onboarding_summary")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function markOnboardingComplete(userId: string, summary?: string | null): Promise<void> {
  const update: { onboarding_complete: boolean; onboarding_summary?: string } = {
    onboarding_complete: true,
  };
  if (summary && summary.trim()) update.onboarding_summary = summary.trim();
  await supabase.from("users").update(update).eq("id", userId);
}
