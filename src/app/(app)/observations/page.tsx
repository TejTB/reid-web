"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { GlowCard } from "@/components/ui/glow-card";
import {
  FullScreenCard,
  type FullScreenObservationData,
} from "@/components/ui/full-screen-card";
import { supabase } from "@/lib/supabase";
import { triggerObserve } from "@/lib/observe-trigger";
import type { Observation } from "@/types/db";
import { observationBadge } from "@/lib/observation-badge";

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

function previewBody(text: string, max: number = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

export default function ObservationsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // session_id -> 1-based ordinal (oldest = 1). Used so the FullScreenCard
  // can render "Session N · 19 May 2026" on the "When Reid first noticed
  // this" line instead of a bare date.
  const [sessionOrdinals, setSessionOrdinals] = useState<Map<string, number>>(
    () => new Map(),
  );

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
        // Best-effort generation.
      }

      // Build the session ordinal map. Chat-mode sessions only — onboarding
      // sessions are excluded so "Session 1" lines up with the founder's
      // first real conversation, not the intake form.
      try {
        const { data: chatSessions } = await supabase
          .from("sessions")
          .select("id, started_at")
          .eq("user_id", me.id)
          .eq("mode", "chat")
          .order("started_at", { ascending: true });
        if (!cancelled && chatSessions) {
          const map = new Map<string, number>();
          chatSessions.forEach((s, i) => {
            if (s.id) map.set(s.id as string, i + 1);
          });
          setSessionOrdinals(map);
        }
      } catch {
        // Best-effort — falls back to the date-only label.
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

  const activeContext = useMemo<
    | {
        type: "observation";
        layoutId: string;
        data: FullScreenObservationData;
      }
    | null
  >(() => {
    if (!activeId) return null;
    const o = observations.find((x) => x.id === activeId);
    if (!o) return null;
    const ordinal = o.session_id ? sessionOrdinals.get(o.session_id) : null;
    const dateLabel = (() => {
      const d = new Date(o.created_at);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    })();
    const sessionLabel = ordinal
      ? `Session ${ordinal} · ${dateLabel}`
      : `Session · ${dateLabel}`;
    return {
      type: "observation",
      layoutId: `observation-${o.id}`,
      data: {
        id: o.id,
        text: o.text,
        category: o.category,
        confidence: o.confidence,
        created_at: o.created_at,
        session_id: o.session_id,
        sessionLabel,
      },
    };
  }, [activeId, observations, sessionOrdinals]);

  return (
    <>
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
                  height: 128,
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
          // Empty-state primitives unified with /goals' GoalsEmptyState
          // (Sprint 13 Build 4): serif italic 24px, #7A90A8, 440px measure,
          // fade-up entrance. The copy stays quiet on purpose — observations
          // accrue passively, so no CTA.
          <div
            className="flex flex-col items-center text-center animate-fade-up"
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
              Reid&apos;s still watching.
            </p>
          </div>
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
            {observations.map((o) => (
              <motion.div
                key={o.id}
                layoutId={`observation-${o.id}`}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.35 }}
                onClick={() => setActiveId(o.id)}
                style={{ cursor: "pointer" }}
              >
                <ObservationTile observation={o} />
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

function ObservationTile({ observation }: { observation: Observation }) {
  const badge = observationBadge(observation.category);
  const fullText = observation.text.trim();
  const preview = previewBody(fullText, 80);
  // Show the preview only when it materially differs from the title (i.e.
  // the full text exceeded the 80-char preview cap). For short observations
  // the title is the whole sentence and a duplicate preview is noise.
  const showPreview = fullText.length > 80;
  return (
    <GlowCard customSize glowColor="red" className="w-full">
      <div
        style={{
          padding: "20px 22px",
          minHeight: 132,
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ gap: 12 }}
        >
          <span
            className="font-sans uppercase tracking-wider"
            style={{
              background: badge.bg,
              color: badge.fg,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.1em",
            }}
          >
            {badge.label}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 12, color: "#7A90A8" }}
          >
            {formatShortDate(observation.created_at)}
          </span>
        </div>
        <h3
          className="font-serif italic [text-wrap:pretty]"
          style={{
            fontSize: 18,
            color: "#F2EDE3",
            lineHeight: 1.35,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            letterSpacing: "-0.005em",
          }}
        >
          {fullText}
        </h3>
        {showPreview && (
          <p
            className="font-sans"
            style={{
              fontSize: 13,
              color: "#7A90A8",
              lineHeight: 1.5,
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {preview}
          </p>
        )}
      </div>
    </GlowCard>
  );
}
