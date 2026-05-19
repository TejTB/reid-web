"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { BeamsBackground } from "@/components/ui/beams-background";
import { Banner } from "@/components/ui/banner";
import { GoalRing } from "@/components/ui/goal-ring";
import PushOptInBanner from "@/components/PushOptInBanner";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { isPlausibleFirstName } from "@/lib/reid-summary";
import type { Goal, User } from "@/types/db";

type LoadedUser = Pick<
  User,
  | "id"
  | "name"
  | "onboarding_complete"
  | "onboarding_task"
  | "onboarding_task_completed_at"
  | "session_count"
  | "sessions_used_this_month"
  | "streak_days"
  | "subscription_status"
  | "created_at"
>;

function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const childVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

interface TaskRow {
  id: string;
  text: string;
  completedAt: string | null;
  createdAt: string | null;
}

// Helper kept outside HomePage so the impure Date.now() call doesn't run
// in the component render scope (react-hooks/purity). The cost: the banner
// gate effectively reads "wall-clock now at render time", which is fine —
// the page re-renders frequently enough that the threshold flips well
// before the user notices.
function isOlderThan24h(createdAtIso: string | null | undefined): boolean {
  if (!createdAtIso) return false;
  const createdAtMs = new Date(createdAtIso).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs > 24 * 60 * 60 * 1000;
}

export default function HomePage() {
  const router = useRouter();
  const { me, session, loading } = useAuth();
  const [taskOverride, setTaskOverride] = useState<TaskRow | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(true);
  const [primaryGoal, setPrimaryGoal] = useState<Goal | null>(null);
  const [bannerVisible, setBannerVisible] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (me && me.onboarding_complete === false) {
      router.replace("/onboarding");
    }
  }, [loading, me, session, router]);

  // Fetch push message + primary goal once user is loaded.
  useEffect(() => {
    if (!me || me.onboarding_complete !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/push-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!cancelled && res.ok) {
          const json = (await res.json()) as { message?: string | null };
          setPushMessage(
            typeof json.message === "string" && json.message.trim().length > 0
              ? json.message
              : null,
          );
        }
      } catch (err) {
        console.error("[home] push-message fetch failed:", err);
      } finally {
        if (!cancelled) setPushLoading(false);
      }
    })();
    (async () => {
      const { data } = await supabase
        .from("goals")
        .select(
          "id, user_id, title, description, target_value, current_value, unit, unit_prefix, deadline, is_primary, completed_at, created_at, updated_at",
        )
        .eq("is_primary", true)
        .is("completed_at", null)
        .maybeSingle();
      if (!cancelled) setPrimaryGoal((data as Goal | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

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
        createdAt: null,
      },
    ];
  }, [user]);

  const tasks: TaskRow[] = useMemo(() => {
    if (!taskOverride) return baseTasks;
    return baseTasks.map((t) =>
      t.id === taskOverride.id ? taskOverride : t,
    );
  }, [baseTasks, taskOverride]);

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

  const trimmedName = user.name?.trim() ?? "";
  const greetName = isPlausibleFirstName(trimmedName) ? trimmedName : "";
  const sessionCount = user.session_count ?? 0;
  const streak = user.streak_days ?? 0;

  // Banner condition logic. Sprint 11: only fire when ALL true:
  //   - account is more than 24 hours old
  //   - user has had at least one session (either monthly or lifetime)
  //   - their streak has dropped to 0
  // Day-0 / zero-session accounts must never see this banner.
  let bannerTitle: string | null = null;
  const accountOlderThan24h = isOlderThan24h(user.created_at);
  const hasHadAtLeastOneSession =
    (user.sessions_used_this_month ?? 0) > 0 || sessionCount > 0;
  if (
    accountOlderThan24h &&
    hasHadAtLeastOneSession &&
    streak === 0 &&
    user.onboarding_complete === true
  ) {
    bannerTitle = "Reid hasn't heard from you yet this week.";
  }
  // Tasks-overdue banner takes precedence if we have a stale incomplete task.
  // For now the only task we surface on home is the onboarding task — it has
  // no createdAt, so we leave that branch open for /tasks-fed data later.

  const doneCount = tasks.filter((t) => !!t.completedAt).length;
  const totalTasks = tasks.length;
  const allDone = totalTasks > 0 && doneCount === totalTasks;

  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <BeamsBackground intensity="subtle" />
      </div>

      <motion.div
        className="relative z-10 mx-auto w-full"
        style={{ maxWidth: 860, padding: "48px 32px" }}
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
        </motion.div>

        <motion.div variants={childVariants} style={{ marginTop: 24 }}>
          {pushLoading ? (
            <div
              aria-hidden="true"
              className="animate-skeleton"
              style={{
                height: 24,
                width: "70%",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
              }}
            />
          ) : pushMessage ? (
            <p
              style={{
                fontFamily: "'Playfair Display', serif",
                fontStyle: "italic",
                fontSize: 20,
                lineHeight: 1.6,
                color: "#F2EDE3",
              }}
            >
              {pushMessage}
            </p>
          ) : null}
        </motion.div>

        {bannerTitle && (
          <motion.div variants={childVariants} style={{ marginTop: 20 }}>
            <Banner
              variant="reid"
              title={bannerTitle}
              show={bannerVisible}
              onHide={() => setBannerVisible(false)}
              closable
              autoHide={8000}
            />
          </motion.div>
        )}

        {primaryGoal && (
          <motion.div variants={childVariants} style={{ marginTop: 28 }}>
            <Link href="/goals" aria-label="Open goals">
              <GlowCard customSize glowColor="red" className="w-full">
                <div
                  className="flex flex-col items-center justify-center"
                  style={{ padding: "24px 16px 20px" }}
                >
                  <GoalRing
                    currentValue={Number(primaryGoal.current_value ?? 0)}
                    targetValue={Number(primaryGoal.target_value ?? 0)}
                    unit={primaryGoal.unit ?? ""}
                    unitPrefix={primaryGoal.unit_prefix ?? true}
                    label={primaryGoal.title ?? ""}
                    deadline={primaryGoal.deadline}
                    size="md"
                  />
                </div>
              </GlowCard>
            </Link>
          </motion.div>
        )}

        <div className="flex flex-col" style={{ marginTop: 24, gap: 16 }}>
          <motion.div variants={childVariants}>
            <GlowCard customSize glowColor="red" className="w-full">
              <div
                className="home-card"
                style={{ borderLeft: "3px solid rgba(185,28,28,0.4)" }}
              >
                <div className="text-accent text-[10px] uppercase tracking-[0.16em] font-sans font-semibold mb-[10px]">
                  Today&apos;s Task
                </div>
                {totalTasks === 0 ? (
                  <p
                    className="font-sans"
                    style={{ fontSize: 15, color: "#7A90A8" }}
                  >
                    Reid will assign your task at the end of your next session.
                  </p>
                ) : allDone ? (
                  <div
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontStyle: "italic",
                      fontSize: 20,
                      color: "#F2EDE3",
                      lineHeight: 1.5,
                    }}
                  >
                    <p>All done.</p>
                    <p>Reid will assign more next session.</p>
                  </div>
                ) : (
                  <ul
                    className="flex flex-col"
                    style={{ gap: 12, listStyle: "none", padding: 0, margin: 0 }}
                  >
                    {tasks.map((t) => {
                      const done = !!t.completedAt;
                      return (
                        <li
                          key={t.id}
                          className="flex items-start"
                          style={{ gap: 14 }}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={done}
                            aria-label={
                              done
                                ? "Mark task incomplete"
                                : "Mark task complete"
                            }
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
                              transition:
                                "background-color 200ms ease, border-color 200ms ease, opacity 200ms ease",
                              marginTop: 2,
                            }}
                          >
                            {done && (
                              <Check size={12} strokeWidth={2.5} color="#F2EDE3" />
                            )}
                          </button>
                          <p
                            style={{
                              fontFamily: "'Playfair Display', serif",
                              fontStyle: "italic",
                              fontSize: 18,
                              color: done ? "#7A90A8" : "#F2EDE3",
                              textDecoration: done ? "line-through" : "none",
                              opacity: done ? 0.5 : 1,
                              transition:
                                "color 300ms ease, opacity 300ms ease",
                              lineHeight: 1.5,
                            }}
                          >
                            {t.text}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </GlowCard>
          </motion.div>

          <motion.div variants={childVariants}>
            <GlowCard customSize glowColor="red" className="w-full">
              <div className="home-card">
                <div className="text-accent text-[10px] uppercase tracking-[0.16em] font-sans font-semibold mb-[10px]">
                  Continue
                </div>
                <p
                  className="font-sans"
                  style={{
                    fontSize: 15,
                    color: "#7A90A8",
                    marginBottom: 20,
                  }}
                >
                  Pick up where you left off.
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
              </div>
            </GlowCard>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
