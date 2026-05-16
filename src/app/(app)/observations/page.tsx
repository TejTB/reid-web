"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { formatSessionDate } from "@/lib/format";
import type { Observation } from "@/types/db";

// Read-only feed of every observation Reid has noted about the founder.
// Reid writes via [OBSERVATION] sentinel inside /api/reid; the user never
// edits or deletes from here. RLS scopes the read to the signed-in user.

function confidenceColor(c: Observation["confidence"]): string {
  if (c === "high") return "#B91C1C";
  if (c === "medium") return "#7A90A8";
  return "#3A5070";
}

export default function ObservationsPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login?next=/observations");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("observations")
        .select("id, user_id, session_id, text, confidence, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      setObservations((data ?? []) as Observation[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, me, router]);

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 640, padding: "48px 24px 96px" }}
    >
      <div style={{ marginBottom: 32 }}>
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            marginBottom: 8,
          }}
        >
          What Reid&apos;s noticed
        </h1>
        <p
          className="font-sans"
          style={{
            fontSize: 14,
            color: "#7A90A8",
            lineHeight: 1.6,
          }}
        >
          Patterns Reid keeps an eye on between sessions.
        </p>
      </div>

      {!loaded ? (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-skeleton"
              style={{
                height: 78,
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
              }}
            />
          ))}
        </div>
      ) : observations.length === 0 ? (
        <div
          className="home-card"
          style={{
            padding: 28,
            textAlign: "center",
          }}
        >
          <p
            className="font-serif italic text-text-primary"
            style={{ fontSize: 18, lineHeight: 1.5, marginBottom: 6 }}
          >
            Nothing yet.
          </p>
          <p
            className="font-sans"
            style={{ fontSize: 13, color: "#7A90A8", lineHeight: 1.6 }}
          >
            Reid logs observations as he gets to know you. Have a few sessions
            and they&apos;ll start landing here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {observations.map((o) => (
            <article
              key={o.id}
              className="home-card animate-fade-up"
              style={{
                padding: "18px 22px",
                borderLeft: `2px solid ${confidenceColor(o.confidence)}`,
              }}
            >
              <p
                className="font-serif text-text-primary"
                style={{
                  fontSize: 17,
                  lineHeight: 1.5,
                  marginBottom: 10,
                  letterSpacing: "-0.005em",
                }}
              >
                {o.text}
              </p>
              <div
                className="flex items-center font-sans"
                style={{
                  gap: 10,
                  fontSize: 11,
                  color: "#7A90A8",
                  letterSpacing: "0.04em",
                }}
              >
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatSessionDate(o.created_at)}
                </span>
                <span style={{ color: "#3A5070" }}>·</span>
                <span
                  style={{
                    textTransform: "uppercase",
                    color: confidenceColor(o.confidence),
                  }}
                >
                  {o.confidence}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
