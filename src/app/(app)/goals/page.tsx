"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import {
  getMyGoals,
  getMyGoalEvents,
  type GoalEventWithGoal,
} from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { Goal } from "@/types/db";
import PrimaryGoalHero from "@/components/PrimaryGoalHero";
import GoalCard from "@/components/GoalCard";
import GoalEventFeed from "@/components/GoalEventFeed";
import GoalCompleteOverlay from "@/components/GoalCompleteOverlay";
import CompletedGoalsSection from "@/components/CompletedGoalsSection";
import LogoMark from "@/components/LogoMark";
import { GlowCard } from "@/components/ui/glow-card";

const FLASH_MS = 2000;

export default function GoalsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const userId = me?.id ?? null;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<GoalEventWithGoal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(
    () => new Set(),
  );
  const [completedGoal, setCompletedGoal] = useState<Goal | null>(null);
  const celebratedRef = useRef<Set<string>>(new Set());

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const flashGoal = useCallback((id: string) => {
    setRecentlyUpdated((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setRecentlyUpdated((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, FLASH_MS);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [goalsRows, eventRows] = await Promise.all([
          getMyGoals(),
          getMyGoalEvents(30),
        ]);
        if (cancelled) return;
        setGoals(goalsRows);
        setEvents(eventRows);
        for (const g of goalsRows) {
          if (g.completed_at) celebratedRef.current.add(g.id);
        }
        setLoaded(true);
      } catch {
        if (cancelled) return;
        setError(true);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, me, router]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`goals:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "goals",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload.new ?? null) as Goal | null;
          if (!row || !row.id) {
            const oldRow = (payload.old ?? null) as Partial<Goal> | null;
            if (oldRow?.id) {
              setGoals((prev) => prev.filter((g) => g.id !== oldRow.id));
            }
            return;
          }
          setGoals((prev) => {
            const before = prev.find((g) => g.id === row.id);
            const next = before
              ? prev.map((g) => (g.id === row.id ? row : g))
              : [...prev, row].sort((a, b) => {
                  if (a.is_primary !== b.is_primary)
                    return a.is_primary ? -1 : 1;
                  return (
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                  );
                });
            if (
              row.completed_at &&
              before &&
              !before.completed_at &&
              !celebratedRef.current.has(row.id)
            ) {
              celebratedRef.current.add(row.id);
              setCompletedGoal(row);
            }
            return next;
          });
          flashGoal(row.id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "goal_events",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          const id = userIdRef.current;
          if (!id) return;
          void getMyGoalEvents(30).then((rows) => {
            setEvents(rows);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, flashGoal]);

  const activeGoals = goals.filter((g) => !g.completed_at);
  const completedGoals = goals.filter((g) => g.completed_at);
  const primary =
    activeGoals.find((g) => g.is_primary) ?? activeGoals[0] ?? null;
  const supportingGoals = activeGoals.filter((g) => g.id !== primary?.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-[1100px] px-6 md:px-8"
      style={{ paddingTop: 56, paddingBottom: 48 }}
    >
      <header style={{ marginBottom: 40 }}>
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          Your Goals
        </h1>
        <p
          className="font-sans"
          style={{ color: "#7A90A8", fontSize: 15, marginTop: 8 }}
        >
          What you said you wanted. Reid&apos;s holding you to it.
        </p>
      </header>

      {error ? (
        <div className="flex flex-col items-center justify-center pt-16 gap-4">
          <p
            className="font-serif italic"
            style={{ fontSize: 18, color: "#7A90A8" }}
          >
            My end&apos;s jammed.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-sans"
            style={{
              fontSize: 13,
              color: "#B91C1C",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      ) : !loaded ? (
        <GoalsSkeleton />
      ) : activeGoals.length === 0 && completedGoals.length === 0 ? (
        <GoalsEmptyState />
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-3"
          style={{ gap: 32 }}
        >
          <div className="md:col-span-2 flex flex-col" style={{ gap: 20 }}>
            {primary ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0 }}
              >
                <GlowCard customSize glowColor="red" className="w-full">
                  <PrimaryGoalHero
                    goal={primary}
                    flash={recentlyUpdated.has(primary.id)}
                  />
                </GlowCard>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <GlowCard customSize glowColor="red" className="w-full">
                  <div style={{ padding: "24px" }}>
                    <p
                      className="font-serif italic text-text-secondary [text-wrap:pretty]"
                      style={{ fontSize: 18, lineHeight: 1.5 }}
                    >
                      Every active goal is done. Open a session and tell Reid
                      what&apos;s next.
                    </p>
                    <Link
                      href="/chat"
                      className="cta-shadow inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px"
                      style={{
                        marginTop: 18,
                        height: 48,
                        padding: "0 22px",
                        borderRadius: 10,
                        fontFamily: "var(--font-sans), sans-serif",
                        fontSize: 14,
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
            )}

            {supportingGoals.length > 0 && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.06 } },
                }}
                className="grid grid-cols-1 sm:grid-cols-2"
                style={{ gap: 16 }}
              >
                {supportingGoals.map((g) => (
                  <motion.div
                    key={g.id}
                    variants={{
                      hidden: { opacity: 0, y: 12 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.35 }}
                  >
                    <GoalCard
                      goal={g}
                      flash={recentlyUpdated.has(g.id)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}

            <CompletedGoalsSection goals={completedGoals} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="md:col-span-1"
          >
            <GlowCard customSize glowColor="red" className="w-full">
              <GoalEventFeed events={events} />
            </GlowCard>
          </motion.div>
        </div>
      )}

      {completedGoal && (
        <GoalCompleteOverlay
          goal={completedGoal}
          onDismiss={() => setCompletedGoal(null)}
        />
      )}
    </motion.div>
  );
}

function GoalsEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center text-center animate-fade-up"
      style={{ paddingTop: 64, paddingBottom: 80, gap: 24 }}
    >
      <LogoMark size={64} glow={false} />
      <div className="flex flex-col" style={{ gap: 8 }}>
        <h2
          className="font-serif italic"
          style={{
            fontSize: 32,
            fontWeight: 400,
            color: "#F2EDE3",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          No goals yet.
        </h2>
        <p
          className="font-sans"
          style={{
            fontSize: 16,
            color: "#7A90A8",
            lineHeight: 1.55,
            maxWidth: 380,
          }}
        >
          They&apos;ll appear after our first real session.
        </p>
      </div>
      <Link
        href="/chat"
        className="cta-shadow inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px"
        style={{
          height: 48,
          padding: "0 22px",
          borderRadius: 10,
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "0.04em",
        }}
      >
        <span>Open session</span>
        <ArrowRight size={16} strokeWidth={2} />
      </Link>
    </div>
  );
}

function GoalsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 32 }}>
      <div className="md:col-span-2 flex flex-col" style={{ gap: 20 }}>
        <div
          className="rounded-2xl animate-pulse"
          style={{ height: 240, background: "rgba(255,255,255,0.03)" }}
        />
        <div
          className="grid grid-cols-1 sm:grid-cols-2"
          style={{ gap: 16 }}
        >
          <div
            className="rounded-2xl animate-pulse"
            style={{
              height: 140,
              background: "rgba(255,255,255,0.03)",
              animationDelay: "80ms",
            }}
          />
          <div
            className="rounded-2xl animate-pulse"
            style={{
              height: 140,
              background: "rgba(255,255,255,0.03)",
              animationDelay: "160ms",
            }}
          />
        </div>
      </div>
      <div
        className="md:col-span-1 rounded-2xl animate-pulse"
        style={{
          height: 360,
          background: "rgba(255,255,255,0.03)",
          animationDelay: "240ms",
        }}
      />
    </div>
  );
}
