"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import { GlowCard } from "@/components/ui/glow-card";

const FLASH_MS = 2000;

/** Goals dashboard.
 *
 *  Loads goals + recent events in parallel for the current user, then opens
 *  a Realtime subscription on both tables. Realtime events drive three
 *  things:
 *    1. Splice the updated row into local goals state.
 *    2. Mark the affected goal id as recently-updated for 2s so the card
 *       can pulse via the goal-flash keyframe.
 *    3. Detect the null → timestamp transition on completed_at and show
 *       the completion overlay.
 *  On a goal_events INSERT we just refetch the feed — it's bounded (~30
 *  rows) and refetching keeps ordering deterministic without merging the
 *  realtime row by hand.
 *
 *  No service-role key — RLS on public.goals / public.goal_events is
 *  anon-permissive (see migration 20260516180000). */
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
  // Tracks goals we've already celebrated this session so a re-render of
  // the overlay doesn't double-fire if Realtime echoes back.
  const celebratedRef = useRef<Set<string>>(new Set());

  // Bring `userId` into a stable ref so the Realtime callback can refetch
  // events without re-subscribing on every state change.
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

  // Initial load.
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

  // Realtime subscription. Re-subscribes only when userId changes.
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
            // DELETE — drop the row from state. The brief doesn't surface
            // a delete flow in the UI but we want the page to stay coherent
            // if a row disappears.
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
                  // Mirror getGoals: primary first, then oldest-first by created_at.
                  if (a.is_primary !== b.is_primary)
                    return a.is_primary ? -1 : 1;
                  return (
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                  );
                });
            // Completion detection (local-state version — survives a
            // partial `old` payload from REPLICA IDENTITY DEFAULT).
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
          // Refetch — cheap (limit 30) and keeps deterministic order +
          // joined goal title/unit without merge gymnastics.
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
    <div
      className="mx-auto w-full max-w-[1100px] px-6 md:px-8"
      style={{ paddingTop: 56, paddingBottom: 48 }}
    >
      <header style={{ marginBottom: 40 }}>
        <h1 className="font-serif text-3xl text-white mb-1">Your Goals</h1>
        <p className="text-white/30 text-sm font-sans">
          The numbers Reid is helping you move.
        </p>
      </header>

      {error ? (
        <div className="flex flex-col items-center justify-center pt-16 gap-4">
          <p className="font-serif italic text-text-dim text-lg">
            Something went wrong.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-accent underline font-sans"
          >
            Try again
          </button>
        </div>
      ) : !loaded ? (
        <GoalsSkeleton />
      ) : activeGoals.length === 0 && completedGoals.length === 0 ? (
        <GoalsEmptyState />
      ) : (
        <div className="flex flex-col lg:flex-row" style={{ gap: 32 }}>
          {/* Left column: hero + supporting grid + completed shelf. */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 20 }}>
            {primary ? (
              <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
                <GlowCard customSize glowColor="red" className="w-full">
                  <PrimaryGoalHero
                    goal={primary}
                    flash={recentlyUpdated.has(primary.id)}
                  />
                </GlowCard>
              </div>
            ) : (
              // No active goals but we DO have completed ones — render a
              // light prompt instead of the hero so the page still feels
              // alive.
              <div
                className="animate-fade-up"
                style={{ animationDelay: "0ms" }}
              >
                <GlowCard customSize glowColor="red" className="w-full">
                  <div className="home-card">
                    <p
                      className="font-serif italic text-text-secondary [text-wrap:pretty]"
                      style={{ fontSize: 18, lineHeight: 1.5 }}
                    >
                      Every active goal is done. Open a session and tell Reid
                      what's next.
                    </p>
                    <Link
                      href="/chat"
                      className="cta-shadow inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px"
                      style={{
                        marginTop: 18,
                        height: 42,
                        padding: "0 22px",
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
              </div>
            )}

            {supportingGoals.length > 0 && (
              <div
                className="grid animate-fade-up"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 16,
                  animationDelay: "80ms",
                }}
              >
                {supportingGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    flash={recentlyUpdated.has(g.id)}
                  />
                ))}
              </div>
            )}

            <CompletedGoalsSection goals={completedGoals} />
          </div>

          {/* Right rail: feed. */}
          <div
            className="lg:w-[300px] lg:shrink-0 animate-fade-up"
            style={{ animationDelay: "160ms" }}
          >
            <GlowCard customSize glowColor="red" className="w-full">
              <GoalEventFeed events={events} />
            </GlowCard>
          </div>
        </div>
      )}

      {completedGoal && (
        <GoalCompleteOverlay
          goal={completedGoal}
          onDismiss={() => setCompletedGoal(null)}
        />
      )}
    </div>
  );
}

/** Shown when the user has no goals at all. Routes them back to Reid where
 *  goals get captured. */
function GoalsEmptyState() {
  return (
    <div className="home-card flex flex-col items-start" style={{ gap: 20 }}>
      <p
        className="font-serif italic text-text-secondary [text-wrap:pretty]"
        style={{ fontSize: 20, lineHeight: 1.55 }}
      >
        No goals yet. Open a session and tell Reid the number you're trying
        to move — he'll keep score from there.
      </p>
      <Link
        href="/chat"
        className="cta-shadow inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px"
        style={{
          height: 46,
          padding: "0 22px",
          borderRadius: 9,
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.04em",
        }}
      >
        <span>Open session with Reid</span>
        <ArrowRight size={16} strokeWidth={2} />
      </Link>
    </div>
  );
}

/** Layout-matched skeleton — same column structure as the loaded view, so
 *  the page doesn't shift when content arrives. Pure white/03 blocks; no
 *  accent red on the loading state. */
function GoalsSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row" style={{ gap: 32 }}>
      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 20 }}>
        <div
          className="rounded-2xl animate-pulse"
          style={{ height: 240, background: "rgba(255,255,255,0.03)" }}
        />
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
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
        className="lg:w-[300px] lg:shrink-0 rounded-2xl animate-pulse"
        style={{
          height: 360,
          background: "rgba(255,255,255,0.03)",
          animationDelay: "240ms",
        }}
      />
    </div>
  );
}
