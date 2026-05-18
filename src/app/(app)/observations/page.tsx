"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { GlowCard } from "@/components/ui/glow-card";
import { supabase } from "@/lib/supabase";
import { triggerObserve } from "@/lib/observe-trigger";
import type { Observation, ObservationCategory } from "@/types/db";

const CATEGORY_STYLES: Record<string, string> = {
  avoidance:     "bg-[#B91C1C]/15 text-[#f87171] border border-[#B91C1C]/25",
  pattern:       "bg-amber-900/20 text-amber-400 border border-amber-700/30",
  contradiction: "bg-purple-900/20 text-purple-400 border border-purple-700/30",
  strength:      "bg-green-900/20 text-green-400 border border-green-700/30",
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans ${CATEGORY_STYLES[category] ?? CATEGORY_STYLES.avoidance}`}
    >
      {category}
    </span>
  );
}

// Read-only feed of every observation Reid has noted about the founder.
// Two sources land here:
//   1. /api/reid emits [OBSERVATION] sentinels during a chat session (legacy
//      shape — confidence only, no category).
//   2. /api/observe writes 1–2 clinical notes after each session in the new
//      avoidance / pattern / contradiction / strength taxonomy.
//
// New rows get the coloured category badge; legacy rows fall back to a
// neutral "noted" badge. RLS scopes every read to the signed-in user.

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

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

const CATEGORY_COLOURS: Record<ObservationCategory, string> = {
  avoidance: "#B91C1C",
  pattern: "#d97706",
  contradiction: "#1d4ed8",
  strength: "#16a34a",
};

const LEGACY_BADGE_COLOUR = "#3A5070";

function badgeFor(o: Observation): { label: string; color: string } {
  if (o.category) {
    return {
      label: o.category,
      color: CATEGORY_COLOURS[o.category],
    };
  }
  return { label: "noted", color: LEGACY_BADGE_COLOUR };
}

const OBSERVATION_SELECT =
  "id, user_id, session_id, text, confidence, category, created_at";

export default function ObservationsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errored, setErrored] = useState(false);

  const fetchObservations = useCallback(async () => {
    const { data, error } = await supabase
      .from("observations")
      .select(OBSERVATION_SELECT)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setErrored(true);
      return [] as Observation[];
    }
    setErrored(false);
    return (data ?? []) as Observation[];
  }, []);

  // First load: fire /api/observe for the most recent ended session that has
  // no observations yet, then read the table. Lazy generation, single round
  // trip in the cold path.
  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login?next=/observations");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data: latestSession } = await supabase
          .from("sessions")
          .select("id, ended_at")
          .eq("user_id", me.id)
          .not("ended_at", "is", null)
          .order("ended_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestSession?.id) {
          const { count } = await supabase
            .from("observations")
            .select("id", { head: true, count: "exact" })
            .eq("user_id", me.id)
            .eq("session_id", latestSession.id);
          if ((count ?? 0) === 0) {
            await triggerObserve(latestSession.id);
          }
        }
      } catch {
        // Best-effort; failure here just means we render whatever's already
        // in the table.
      }
      if (cancelled) return;
      const rows = await fetchObservations();
      if (cancelled) return;
      setObservations(rows);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, me, router, fetchObservations]);

  // Re-fetch when the tab regains focus so a session ended elsewhere lands
  // here without a manual refresh.
  useEffect(() => {
    if (!loaded) return;
    function onFocus() {
      void (async () => {
        const rows = await fetchObservations();
        setObservations(rows);
      })();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [loaded, fetchObservations]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    const rows = await fetchObservations();
    setObservations(rows);
    setRefreshing(false);
  }

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 880, padding: "48px 24px 96px" }}
    >
      <div
        className="flex items-start justify-between"
        style={{ gap: 16, marginBottom: 32 }}
      >
        <div>
          <h1 className="font-serif text-3xl text-white mb-1">
            What Reid&apos;s noticed
          </h1>
          <p className="text-white/30 text-sm font-sans">
            Patterns Reid keeps an eye on between sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh observations"
          disabled={refreshing}
          className="flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "#0F1E35",
            color: "#F2EDE3",
            cursor: refreshing ? "default" : "pointer",
            opacity: refreshing ? 0.5 : 1,
            transition: "opacity 150ms ease, transform 150ms ease",
            flexShrink: 0,
          }}
        >
          <RefreshCw
            size={14}
            strokeWidth={2}
            style={{ opacity: refreshing ? 0.4 : 1 }}
          />
        </button>
      </div>

      {!loaded ? (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-skeleton"
              style={{
                height: 96,
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
              }}
            />
          ))}
        </div>
      ) : errored ? (
        <div
          className="flex flex-col items-center text-center"
          style={{ padding: "64px 24px" }}
        >
          <p
            className="font-serif italic"
            style={{
              fontSize: 18,
              color: "rgba(242,237,227,0.45)",
              lineHeight: 1.5,
              maxWidth: 320,
              marginBottom: 16,
            }}
          >
            Couldn&apos;t load observations.
          </p>
          <button
            type="button"
            onClick={refresh}
            className="font-sans"
            style={{
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#F2EDE3",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "10px 18px",
              borderRadius: 9,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      ) : observations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-white/20 text-sm italic font-serif">
            Reid hasn&apos;t noticed anything yet.
          </p>
          <p className="text-white/10 text-xs mt-2 font-sans">Have a few real sessions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {observations.map((o, i) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 6) * 0.04 }}
            >
              <GlowCard customSize glowColor="red" className="w-full">
                <div className="p-5 min-h-[140px] bg-[#111111] rounded-xl">
                  <div className="flex items-start justify-between mb-3">
                    <CategoryBadge category={o.category ?? "avoidance"} />
                    <span className="text-white/25 text-xs font-sans">
                      {formatShortDate(o.created_at)}
                    </span>
                  </div>
                  <p className="text-white/75 text-sm leading-relaxed font-serif italic [text-wrap:pretty]">
                    {o.text}
                  </p>
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
