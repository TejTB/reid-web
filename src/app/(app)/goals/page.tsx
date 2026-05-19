"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { getMyGoals } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { Goal } from "@/types/db";
import LogoMark from "@/components/LogoMark";
import { GlowCard } from "@/components/ui/glow-card";
import {
  FullScreenCard,
  type FullScreenGoalData,
} from "@/components/ui/full-screen-card";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDeadline(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Due ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function formatGoalValue(
  value: number,
  unit: string,
  unitPrefix: boolean,
): string {
  const rounded = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2).replace(/\.?0+$/, "");
  if (unitPrefix) return `${unit}${rounded}`;
  return `${rounded} ${unit}`.trim();
}

function progressPct(g: Pick<Goal, "current_value" | "target_value">): number {
  if (!g.target_value || g.target_value <= 0) return 0;
  const p = (g.current_value / g.target_value) * 100;
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

export default function GoalsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const userId = me?.id ?? null;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeHistory, setActiveHistory] = useState<
    { value: number; created_at: string }[]
  >([]);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const goalsRows = await getMyGoals();
        if (cancelled) return;
        setGoals(goalsRows);
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
            return before
              ? prev.map((g) => (g.id === row.id ? row : g))
              : [...prev, row].sort((a, b) => {
                  if (a.is_primary !== b.is_primary)
                    return a.is_primary ? -1 : 1;
                  return (
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                  );
                });
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Lazily load goal_events history for the active goal — used by the
  // FullScreenCard's LineChart when there are >=3 data points.
  const loadHistory = useCallback(
    async (goalId: string, baseValue: number) => {
      const { data } = await supabase
        .from("goal_events")
        .select("delta, created_at")
        .eq("goal_id", goalId)
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as { delta: number; created_at: string }[];
      // Convert deltas to a cumulative running value; the chart wants the
      // total at each point, not the increment. Anchor at zero so the line
      // starts where the founder started.
      let running = 0;
      const points = rows.map((e) => {
        running += e.delta;
        return { value: running, created_at: e.created_at };
      });
      // If running !== baseValue, the goal had a different starting position
      // or unrecorded movement — append a final synthetic "now" point so the
      // chart always ends on the current_value the user sees on the card.
      if (points.length === 0 || points[points.length - 1].value !== baseValue) {
        points.push({ value: baseValue, created_at: new Date().toISOString() });
      }
      setActiveHistory(points);
    },
    [],
  );

  function openGoal(g: Goal) {
    setActiveId(g.id);
    setActiveHistory([]);
    void loadHistory(g.id, g.current_value);
  }

  const activeContext = useMemo<
    | {
        type: "goal";
        layoutId: string;
        data: FullScreenGoalData;
      }
    | null
  >(() => {
    if (!activeId) return null;
    const g = goals.find((x) => x.id === activeId);
    if (!g) return null;
    return {
      type: "goal",
      layoutId: `goal-${g.id}`,
      data: {
        id: g.id,
        title: g.title,
        description: g.description,
        current_value: g.current_value,
        target_value: g.target_value,
        unit: g.unit,
        unit_prefix: g.unit_prefix,
        deadline: g.deadline,
        history: activeHistory,
        blocking: null,
      },
    };
  }, [activeId, goals, activeHistory]);

  const activeGoals = goals.filter((g) => !g.completed_at);
  const completedGoals = goals.filter((g) => g.completed_at);
  const allEmpty = activeGoals.length === 0 && completedGoals.length === 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto w-full max-w-[960px] px-6 md:px-8"
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
        ) : allEmpty ? (
          <GoalsEmptyState />
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.06 } },
            }}
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ gap: 16 }}
          >
            {activeGoals.map((g) => (
              <motion.div
                key={g.id}
                layoutId={`goal-${g.id}`}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.35 }}
                onClick={() => openGoal(g)}
                style={{ cursor: "pointer" }}
              >
                <GoalTile goal={g} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>

      <FullScreenCard
        context={activeContext}
        onClose={() => setActiveId(null)}
      />
    </>
  );
}

function GoalTile({ goal }: { goal: Goal }) {
  const pct = progressPct(goal);
  const current = formatGoalValue(
    goal.current_value,
    goal.unit,
    goal.unit_prefix,
  );
  const target = formatGoalValue(
    goal.target_value,
    goal.unit,
    goal.unit_prefix,
  );
  const deadline = formatDeadline(goal.deadline);
  return (
    <GlowCard customSize glowColor="red" className="w-full">
      <div
        style={{
          padding: "24px",
          minHeight: 160,
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h3
          className="font-serif italic [text-wrap:pretty]"
          style={{
            fontSize: 22,
            color: "#F2EDE3",
            lineHeight: 1.25,
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {goal.title}
        </h3>
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <span
            className="font-sans"
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "#F2EDE3",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
            }}
          >
            {current}
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "#7A90A8",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            / {target}
          </span>
        </div>
        <div
          style={{
            height: 4,
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ height: "100%", background: "#B91C1C" }}
          />
        </div>
        {deadline && (
          <p
            className="font-sans"
            style={{
              fontSize: 12,
              color: "#7A90A8",
              letterSpacing: "0.02em",
              margin: 0,
            }}
          >
            {deadline}
          </p>
        )}
      </div>
    </GlowCard>
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
    <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-2xl animate-pulse"
          style={{
            height: 160,
            background: "rgba(255,255,255,0.03)",
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
}
