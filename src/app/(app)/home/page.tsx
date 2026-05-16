"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { getUserId, getUser } from "@/lib/session";
import type { User } from "@/types/db";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type LoadedUser = Pick<
  User,
  | "id"
  | "name"
  | "onboarding_complete"
  | "onboarding_summary"
  | "onboarding_task"
  | "last_session_at"
  | "session_count"
  | "streak_days"
>;

// Bucketed milestone copy for the momentum bar — the visual bar caps at 100%
// but the label keeps progressing past 10 sessions.
function milestoneFor(sessionCount: number): string {
  if (sessionCount <= 2) return "Getting started";
  if (sessionCount <= 4) return "Building momentum";
  if (sessionCount <= 9) return "Pattern emerging";
  return "First checkpoint";
}

// "Active today" / "{n} day streak" / "Last active {n} days ago".
// Streak text is intentionally restrained — no fire emoji, no bold weight.
function streakTextFor(user: LoadedUser, now: Date = new Date()): string | null {
  const last = user.last_session_at ? new Date(user.last_session_at) : null;
  if (last && !Number.isNaN(last.getTime())) {
    const sameDay =
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate();
    if (sameDay) return "Active today";
  }
  if ((user.streak_days ?? 0) > 1) return `${user.streak_days} day streak`;
  if (last && !Number.isNaN(last.getTime())) {
    const dayMs = 1000 * 60 * 60 * 24;
    const days = Math.max(
      1,
      Math.floor((now.getTime() - last.getTime()) / dayMs),
    );
    return `Last active ${days} day${days === 1 ? "" : "s"} ago`;
  }
  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<LoadedUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [taskDone, setTaskDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        router.replace("/onboarding");
        return;
      }
      const u = await getUser(id);
      if (cancelled) return;
      if (!u || u.onboarding_complete === false) {
        router.replace("/onboarding");
        return;
      }
      setUser(u);
      // Task 0 is the onboarding task — tasks page uses the same index.
      try {
        const stored = localStorage.getItem(`reid:task:${id}:0:done`);
        setTaskDone(stored === "true");
      } catch {
        setTaskDone(false);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-6 pt-[60px] pb-12 flex flex-col gap-4">
        <div className="h-12 w-2/3 rounded-md bg-bg-card animate-skeleton" />
        <div className="h-32 rounded-2xl bg-bg-card animate-skeleton" />
        <div className="h-32 rounded-2xl bg-bg-card animate-skeleton" />
      </div>
    );
  }

  const summary = user?.onboarding_summary?.trim() ?? "";
  const task = user?.onboarding_task?.trim() ?? "";
  const greetName = user?.name?.trim() || "there";
  const sessionCount = user?.session_count ?? 0;
  const streakText = user ? streakTextFor(user) : null;
  const milestoneLabel = milestoneFor(sessionCount);
  const progressPct = Math.min(100, (sessionCount / 10) * 100);

  function toggleTask() {
    if (!user) return;
    const next = !taskDone;
    setTaskDone(next);
    try {
      localStorage.setItem(
        `reid:task:${user.id}:0:done`,
        next ? "true" : "false",
      );
    } catch {
      // localStorage unavailable; in-memory state still reflects the toggle.
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 md:px-6 pt-[60px] pb-12 flex flex-col">
      <div
        className="animate-fade-up"
        style={{ animationDelay: "0ms" }}
      >
        <h1
          className="font-serif text-text-primary text-[36px] md:text-[46px]"
          style={{
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          {greeting()}, {greetName}.
        </h1>
        <p
          className="font-sans"
          style={{
            color: "#7A90A8",
            fontSize: 16,
            fontWeight: 300,
            marginTop: 10,
          }}
        >
          Here&apos;s where things stand.
        </p>
        {sessionCount > 0 && streakText && (
          <p
            className="font-sans text-text-dim text-sm"
            style={{ marginTop: 12, fontWeight: 400 }}
          >
            Session {sessionCount} · {streakText}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4" style={{ marginTop: 48 }}>
        <div
          className="animate-fade-up"
          style={{ animationDelay: "0ms" }}
        >
          <GlassCard title="YOUR FOCUS">
            {summary ? (
              <p className="font-serif italic text-text-primary text-[20px] leading-[1.55] whitespace-pre-wrap">
                {summary}
              </p>
            ) : (
              <p
                className="font-sans"
                style={{ fontSize: 15, color: "#7A90A8" }}
              >
                Complete your first session with Reid.
              </p>
            )}
            {/* Momentum bar — caps visually at 100%, milestone label keeps
                progressing for sessions ≥ 10. */}
            <div className="mt-4">
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-text-dim font-sans">
                Session {sessionCount} of 10 — {milestoneLabel}
              </p>
            </div>
          </GlassCard>
        </div>

        <div
          className="animate-fade-up"
          style={{ animationDelay: "80ms" }}
        >
          <GlassCard title="TODAY'S TASK">
            {task ? (
              <div className="flex items-start" style={{ gap: 14 }}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={taskDone}
                  aria-label={taskDone ? "Mark task incomplete" : "Mark task complete"}
                  onClick={toggleTask}
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: taskDone
                      ? "1.5px solid transparent"
                      : "1.5px solid rgba(255,255,255,0.2)",
                    background: taskDone ? "#B91C1C" : "transparent",
                    cursor: "pointer",
                    transition: "all 200ms ease",
                    marginTop: 2,
                  }}
                >
                  {taskDone && (
                    <Check size={12} strokeWidth={2.5} color="#F2EDE3" />
                  )}
                </button>
                <p
                  className="font-sans"
                  style={{
                    fontSize: 16,
                    fontWeight: 400,
                    color: taskDone ? "#7A90A8" : "#F2EDE3",
                    textDecoration: taskDone ? "line-through" : "none",
                    transition:
                      "color 300ms ease, text-decoration-color 300ms ease",
                    lineHeight: 1.55,
                  }}
                >
                  {task}
                </p>
              </div>
            ) : (
              <p
                className="font-sans"
                style={{ fontSize: 15, color: "#7A90A8" }}
              >
                Reid will assign your task at the end of your next session.
              </p>
            )}
          </GlassCard>
        </div>

        <div
          className="animate-fade-up"
          style={{ animationDelay: "160ms" }}
        >
          <GlassCard title="CONTINUE">
            <p
              className="font-sans"
              style={{
                fontSize: 15,
                color: "#7A90A8",
                marginBottom: 20,
              }}
            >
              Your co-founder is ready.
            </p>
            <Link
              href="/chat"
              className="cta-shadow w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px"
              style={{
                height: 46,
                borderRadius: 9,
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.04em",
              }}
            >
              <span>Open session</span>
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          </GlassCard>
        </div>
      </div>

    </div>
  );
}
