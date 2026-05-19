"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { GlowCard } from "@/components/ui/glow-card";
import { supabase } from "@/lib/supabase";
import { triggerObserve } from "@/lib/observe-trigger";
import type { Observation } from "@/types/db";

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
        // Best-effort generation; render whatever the table holds.
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto"
      style={{ maxWidth: 960, padding: "48px 24px 96px" }}
    >
      <div
        className="flex items-start justify-between"
        style={{ gap: 16, marginBottom: 32 }}
      >
        <div>
          <h1
            className="font-serif text-text-primary"
            style={{
              fontSize: 36,
              fontWeight: 500,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            What Reid&apos;s noticed
          </h1>
          <p
            className="font-sans"
            style={{ color: "#7A90A8", fontSize: 15 }}
          >
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
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            color: "#F2EDE3",
            cursor: refreshing ? "default" : "pointer",
            opacity: refreshing ? 0.7 : 1,
            transition: "background 150ms ease, border-color 150ms ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (refreshing) return;
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
          }}
          onMouseLeave={(e) => {
            if (refreshing) return;
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
          }}
        >
          {refreshing ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <RefreshCw size={14} strokeWidth={2} />
          )}
        </button>
      </div>

      {!loaded ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ gap: 16 }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-skeleton"
              style={{
                height: 140,
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
              }}
            />
          ))}
        </div>
      ) : errored ? (
        <div
          className="flex flex-col items-center text-center"
          style={{ padding: "64px 24px", gap: 16 }}
        >
          <p
            className="font-serif italic"
            style={{
              fontSize: 18,
              color: "#7A90A8",
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            My end&apos;s jammed.
          </p>
          <button
            type="button"
            onClick={refresh}
            className="font-sans"
            style={{
              fontSize: 13,
              color: "#B91C1C",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      ) : observations.length === 0 ? (
        <div
          className="flex flex-col items-center text-center"
          style={{ paddingTop: 80, paddingBottom: 80, gap: 12 }}
        >
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
            Reid&apos;s still watching.
          </h2>
          <p
            className="font-sans"
            style={{
              fontSize: 15,
              color: "#7A90A8",
              lineHeight: 1.55,
              maxWidth: 380,
            }}
          >
            Patterns take time to surface. Come back after a few sessions.
          </p>
        </div>
      ) : observations.length === 1 ? (
        <div
          className="grid grid-cols-1"
          style={{ gap: 16 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
          >
            <ObservationTile observation={observations[0]} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
          >
            <GlowCard customSize glowColor="red" className="w-full">
              <div
                style={{
                  padding: "32px 24px",
                  minHeight: 140,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <p
                  className="font-serif italic text-center"
                  style={{
                    fontSize: 16,
                    color: "#7A90A8",
                    lineHeight: 1.5,
                    maxWidth: 320,
                  }}
                >
                  One pattern found. Reid&apos;s looking for more.
                </p>
              </div>
            </GlowCard>
          </motion.div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
          {observations.map((o, i) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <ObservationTile observation={o} />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ObservationTile({ observation }: { observation: Observation }) {
  return (
    <GlowCard customSize glowColor="red" className="w-full">
      <div
        style={{
          padding: "20px 22px",
          minHeight: 140,
          borderRadius: 14,
        }}
      >
        <div
          className="flex items-start justify-between"
          style={{ marginBottom: 12 }}
        >
          <CategoryBadge category={observation.category ?? "avoidance"} />
          <span
            className="font-sans"
            style={{ fontSize: 12, color: "#3A5070" }}
          >
            {formatShortDate(observation.created_at)}
          </span>
        </div>
        <p
          className="font-serif italic [text-wrap:pretty]"
          style={{
            fontSize: 14,
            color: "rgba(242,237,227,0.78)",
            lineHeight: 1.55,
          }}
        >
          {observation.text}
        </p>
      </div>
    </GlowCard>
  );
}
