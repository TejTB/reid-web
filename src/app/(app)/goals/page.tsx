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
import { GlowCard } from "@/components/ui/glow-card";
import { GoalRing } from "@/components/ui/goal-ring";
import {
  FullScreenCard,
  type FullScreenGoalData,
} from "@/components/ui/full-screen-card";

const ADD_GOAL_PREFILL = "I want to set a new goal: ";

function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

  const loadHistory = useCallback(
    async (goalId: string, baseValue: number) => {
      const { data } = await supabase
        .from("goal_events")
        .select("delta, created_at")
        .eq("goal_id", goalId)
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as { delta: number; created_at: string }[];
      let running = 0;
      const points = rows.map((e) => {
        running += e.delta;
        return { value: running, created_at: e.created_at };
      });
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
  const primaryGoal = activeGoals.find((g) => g.is_primary) ?? null;
  const secondaryGoals = activeGoals.filter((g) => !g.is_primary);
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
          <div className="flex flex-col" style={{ gap: 32 }}>
            {primaryGoal && (
              <PrimaryGoalCard
                goal={primaryGoal}
                onOpen={() => openGoal(primaryGoal)}
              />
            )}

            {secondaryGoals.length > 0 && (
              <>
                {primaryGoal && (
                  <div
                    className="flex items-center"
                    style={{ gap: 16 }}
                  >
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 11,
                        color: "#7A90A8",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      Other goals
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        background: "rgba(255,255,255,0.06)",
                      }}
                    />
                  </div>
                )}
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
                  {secondaryGoals.map((g) => (
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
              </>
            )}
            <AddGoalButton />
          </div>
        )}
      </motion.div>

      <FullScreenCard
        context={activeContext}
        onClose={() => setActiveId(null)}
      />
    </>
  );
}

function PrimaryGoalCard({
  goal,
  onOpen,
}: {
  goal: Goal;
  onOpen: () => void;
}) {
  const pct = Math.round(progressPct(goal));
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
  const deadlineText = formatDeadline(goal.deadline);
  const daysLeft = daysUntil(goal.deadline);
  const urgentDeadline = daysLeft !== null && daysLeft >= 0 && daysLeft < 14;

  return (
    <motion.div
      layoutId={`goal-${goal.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      onClick={onOpen}
      style={{ cursor: "pointer" }}
    >
      <GlowCard customSize glowColor="red" className="w-full">
        <div
          style={{
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            boxShadow: "inset 0 0 0 1px rgba(185,28,28,0.16)",
            borderRadius: 14,
          }}
        >
          <div
            className="flex flex-col md:flex-row md:items-center"
            style={{ gap: 28 }}
          >
            <div className="flex-shrink-0 self-center md:self-auto">
              <GoalRing
                currentValue={Number(goal.current_value ?? 0)}
                targetValue={Number(goal.target_value ?? 0)}
                unit={goal.unit ?? ""}
                unitPrefix={goal.unit_prefix ?? true}
                label={goal.title ?? ""}
                deadline={goal.deadline}
                size="lg"
                hideMeta
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 10 }}>
              <span
                className="font-sans"
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#B91C1C",
                  alignSelf: "flex-start",
                  background: "rgba(185,28,28,0.10)",
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                Primary goal
              </span>
              <h2
                className="font-serif italic [text-wrap:pretty]"
                style={{
                  fontSize: 24,
                  fontWeight: 500,
                  color: "#F2EDE3",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                  margin: 0,
                }}
              >
                {goal.title}
              </h2>
              <p
                className="font-sans"
                style={{
                  fontSize: 14,
                  color: "#C8D5E3",
                  margin: 0,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {current} of {target}
              </p>
              <div className="flex items-center" style={{ gap: 10 }}>
                {deadlineText && (
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 12,
                      color: urgentDeadline ? "#B91C1C" : "#7A90A8",
                    }}
                  >
                    {urgentDeadline && daysLeft !== null
                      ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`
                      : deadlineText}
                  </span>
                )}
                <span
                  className="font-sans"
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#B91C1C",
                    background: "rgba(185,28,28,0.15)",
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {pct}% complete
                </span>
              </div>
            </div>
          </div>
        </div>
      </GlowCard>
    </motion.div>
  );
}

function GoalTile({ goal }: { goal: Goal }) {
  const pct = Math.round(progressPct(goal));
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
          padding: "20px",
          minHeight: 120,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div className="flex-shrink-0">
          <GoalRing
            currentValue={Number(goal.current_value ?? 0)}
            targetValue={Number(goal.target_value ?? 0)}
            unit={goal.unit ?? ""}
            unitPrefix={goal.unit_prefix ?? true}
            label={goal.title ?? ""}
            deadline={goal.deadline}
            size="sm"
            hideMeta
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 6 }}>
          <h3
            className="[text-wrap:pretty]"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "#F2EDE3",
              lineHeight: 1.3,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {goal.title}
          </h3>
          <p
            className="font-sans"
            style={{
              fontSize: 12,
              color: "#C8D5E3",
              margin: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {current} of {target} · {pct}%
          </p>
          {deadline && (
            <p
              className="font-sans"
              style={{
                fontSize: 11,
                color: "#7A90A8",
                letterSpacing: "0.02em",
                margin: 0,
              }}
            >
              {deadline}
            </p>
          )}
        </div>
      </div>
    </GlowCard>
  );
}

function AddGoalButton() {
  return (
    <Link
      href={`/chat?prefill=${encodeURIComponent(ADD_GOAL_PREFILL)}`}
      className="font-sans inline-flex items-center justify-center w-full transition-colors"
      style={{
        height: 48,
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        color: "#7A90A8",
        fontSize: 14,
        letterSpacing: "0.02em",
        cursor: "pointer",
      }}
    >
      + Tell Reid about another goal
    </Link>
  );
}

function GoalsEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center text-center animate-fade-up"
      style={{ paddingTop: 96, paddingBottom: 80, gap: 24 }}
    >
      <p
        className="font-serif italic [text-wrap:pretty]"
        style={{
          fontSize: 24,
          fontWeight: 400,
          color: "#7A90A8",
          letterSpacing: "-0.01em",
          lineHeight: 1.35,
          maxWidth: 440,
        }}
      >
        Reid doesn&apos;t know what you&apos;re building toward yet.
      </p>
      <Link
        href={`/chat?prefill=${encodeURIComponent(ADD_GOAL_PREFILL)}`}
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
        <span>Open a session</span>
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
