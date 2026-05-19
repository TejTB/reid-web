"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { GlowCard } from "@/components/ui/glow-card";
import PushOptInBanner from "@/components/PushOptInBanner";
import StreakIndicator from "@/components/StreakIndicator";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { FREE_SESSIONS } from "@/lib/session";
import { isPlausibleFirstName } from "@/lib/reid-summary";
import type { User } from "@/types/db";

type LoadedUser = Pick<
  User,
  | "id"
  | "name"
  | "onboarding_complete"
  | "onboarding_summary"
  | "onboarding_task"
  | "onboarding_task_completed_at"
  | "last_session_at"
  | "session_count"
  | "streak_days"
  | "subscription_status"
>;

function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const last = new Date(iso);
  const lastStart = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((start - lastStart) / dayMs));
}

function subtitleFor(days: number | null): string {
  if (days == null) return "Here's where things stand.";
  if (days === 0) return "Here's where things stand.";
  if (days === 1) return "Reid's been thinking since yesterday.";
  if (days === 2) return "Two days. Reid's been watching.";
  return `${days} days. Reid's been waiting.`;
}

function continueCopyFor(days: number | null): string {
  if (days == null || days === 0) return "Pick up where you left off.";
  if (days === 1) return "Reid's been thinking overnight.";
  return "Reid has questions.";
}

function milestoneLabel(sessionCount: number, isPro: boolean): string {
  if (isPro) return `Unlimited · Session ${sessionCount}`;
  if (sessionCount === 0) return "New ground";
  if (sessionCount === 1) return "Stacking sessions";
  if (sessionCount === 2) return "Halfway in";
  if (sessionCount === 3) return "Final free session — upgrade to continue";
  return "Pattern emerging";
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const childVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

interface TaskRow {
  id: string;
  text: string;
  completedAt: string | null;
}

export default function HomePage() {
  const router = useRouter();
  const { me, session, loading } = useAuth();
  const [taskOverride, setTaskOverride] = useState<TaskRow | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    // Explicit `=== false` so a stale `null`/`undefined` me (e.g. mid-fetch
    // after AuthProvider.refresh) never falsely bounces a complete user back
    // to onboarding.
    if (me && me.onboarding_complete === false) {
      router.replace("/onboarding");
    }
  }, [loading, me, session, router]);

  const user: LoadedUser | null = me && me.onboarding_complete === true ? me : null;

  const baseTasks: TaskRow[] = useMemo(() => {
    if (!user) return [];
    const task = user.onboarding_task?.trim();
    if (!task) return [];
    return [
      {
        id: user.id,
        text: task,
        completedAt: user.onboarding_task_completed_at ?? null,
      },
    ];
  }, [user]);

  const tasks: TaskRow[] = useMemo(() => {
    if (!taskOverride) return baseTasks;
    return baseTasks.map((t) =>
      t.id === taskOverride.id ? taskOverride : t,
    );
  }, [baseTasks, taskOverride]);

  const days = useMemo(
    () => daysSince(user?.last_session_at ?? null),
    [user?.last_session_at],
  );

  async function toggleTask(task: TaskRow) {
    if (!user) return;
    const nextCompleted = !task.completedAt;
    const optimisticStamp = nextCompleted ? new Date().toISOString() : null;
    const previousOverride = taskOverride;
    setTaskOverride({ ...task, completedAt: optimisticStamp });

    let accessToken: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }

    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error("[home] task toggle failed:", err);
      setTaskOverride(previousOverride);
    }
  }

  if (!loading && session && !me) {
    return (
      <div className="mx-auto w-full max-w-[480px] px-6 pt-[80px] pb-12 flex flex-col gap-6 text-center">
        <h1
          className="font-serif text-text-primary text-[28px]"
          style={{ fontWeight: 500, letterSpacing: "-0.02em" }}
        >
          Something&apos;s off with your account.
        </h1>
        <p className="font-sans text-text-dim text-[15px]" style={{ lineHeight: 1.55 }}>
          We couldn&apos;t load your profile. Sign out and sign back in.
        </p>
        <button
          type="button"
          onClick={async () => {
            const { signOut } = await import("@/lib/session");
            await signOut();
            router.replace("/login");
          }}
          className="cta-shadow self-center bg-accent hover:bg-accent-hover text-text-primary"
          style={{
            height: 46,
            padding: "0 24px",
            borderRadius: 9,
            fontFamily: "var(--font-sans), sans-serif",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.04em",
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-6 pt-[60px] pb-12 flex flex-col gap-4">
        <div className="h-12 w-2/3 rounded-md bg-bg-card animate-skeleton" />
        <div className="h-32 rounded-2xl bg-bg-card animate-skeleton" />
        <div className="h-32 rounded-2xl bg-bg-card animate-skeleton" />
      </div>
    );
  }

  const summary = user.onboarding_summary?.trim() ?? "";
  // Defensive validate — even if the DB somehow holds a non-name string
  // (legacy row, hand-edited value, future extractor regression), degrade
  // to a no-name greeting rather than render "Good afternoon, Building."
  const trimmedName = user.name?.trim() ?? "";
  const greetName = isPlausibleFirstName(trimmedName) ? trimmedName : "";
  const sessionCount = user.session_count ?? 0;
  const isPro = user.subscription_status === "pro";
  const milestone = milestoneLabel(sessionCount, isPro);
  const progressPct = isPro
    ? 100
    : Math.min(100, (sessionCount / FREE_SESSIONS) * 100);
  const subtitle = subtitleFor(days);
  const continueCopy = continueCopyFor(days);

  const doneCount = tasks.filter((t) => !!t.completedAt).length;
  const totalTasks = tasks.length;
  const allDone = totalTasks > 0 && doneCount === totalTasks;

  return (
    <motion.div
      className="mx-auto w-full max-w-[720px] px-6 md:px-6 pt-[60px] pb-12 flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <PushOptInBanner name={user.name} sessionCount={sessionCount} />

      <motion.div variants={childVariants}>
        <h1
          className="font-serif text-text-primary text-3xl md:text-4xl lg:text-[44px]"
          style={{
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          {timeGreeting()}{greetName ? `, ${greetName}` : ""}.
        </h1>
        <p
          className="font-sans text-text-dim"
          style={{ fontSize: 15, marginTop: 10, lineHeight: 1.5 }}
        >
          {subtitle}
        </p>
        <div style={{ marginTop: 12 }}>
          <StreakIndicator days={user.streak_days ?? 0} />
        </div>
      </motion.div>

      <div className="flex flex-col" style={{ marginTop: 32, gap: 16 }}>
        <motion.div variants={childVariants}>
          <GlowCard customSize glowColor="red" className="w-full">
            <GlassCard title="YOUR FOCUS">
              {summary ? (
                <p className="font-serif italic text-text-primary text-[20px] leading-[1.55] whitespace-pre-wrap [text-wrap:pretty]">
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
              <div className="mt-4">
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-text-dim font-sans">
                  {milestone}
                </p>
              </div>
            </GlassCard>
          </GlowCard>
        </motion.div>

        <motion.div variants={childVariants}>
          <GlowCard customSize glowColor="red" className="w-full">
            <GlassCard title="TODAY'S TASK">
              {totalTasks === 0 ? (
                <p
                  className="font-sans"
                  style={{ fontSize: 15, color: "#7A90A8" }}
                >
                  Reid will assign your task at the end of your next session.
                </p>
              ) : allDone ? (
                <div className="font-serif italic text-text-primary text-[20px] leading-[1.5] [text-wrap:pretty]">
                  <p>All done.</p>
                  <p>Reid will assign more next session.</p>
                </div>
              ) : (
                <>
                  <ul
                    className="flex flex-col"
                    style={{ gap: 12, listStyle: "none", padding: 0, margin: 0 }}
                  >
                    {tasks.map((t) => {
                      const done = !!t.completedAt;
                      return (
                        <li key={t.id} className="flex items-start" style={{ gap: 14 }}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={done}
                            aria-label={done ? "Mark task incomplete" : "Mark task complete"}
                            onClick={() => toggleTask(t)}
                            className="flex items-center justify-center shrink-0"
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              border: done
                                ? "1.5px solid transparent"
                                : "1.5px solid rgba(255,255,255,0.2)",
                              background: done ? "#B91C1C" : "transparent",
                              cursor: "pointer",
                              transition: "background-color 200ms ease, border-color 200ms ease, opacity 200ms ease",
                              marginTop: 2,
                            }}
                          >
                            {done && (
                              <Check size={12} strokeWidth={2.5} color="#F2EDE3" />
                            )}
                          </button>
                          <p
                            className="font-sans"
                            style={{
                              fontSize: 16,
                              fontWeight: 400,
                              color: done ? "#7A90A8" : "#F2EDE3",
                              textDecoration: done ? "line-through" : "none",
                              opacity: done ? 0.5 : 1,
                              transition: "color 300ms ease, opacity 300ms ease",
                              lineHeight: 1.55,
                            }}
                          >
                            {t.text}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  <p
                    className="font-sans text-text-dim"
                    style={{ fontSize: 12, marginTop: 16 }}
                  >
                    {totalTasks} task{totalTasks === 1 ? "" : "s"} · {doneCount} done
                  </p>
                </>
              )}
            </GlassCard>
          </GlowCard>
        </motion.div>

        <motion.div variants={childVariants}>
          <GlowCard customSize glowColor="red" className="w-full">
            <GlassCard title="CONTINUE">
              <p
                className="font-sans"
                style={{
                  fontSize: 15,
                  color: "#7A90A8",
                  marginBottom: 20,
                }}
              >
                {continueCopy}
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
          </GlowCard>
        </motion.div>
      </div>
    </motion.div>
  );
}
