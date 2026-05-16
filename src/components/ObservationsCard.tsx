"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import GlassCard from "./GlassCard";
import { supabase } from "@/lib/supabase";
import { formatSessionDate } from "@/lib/format";
import type { Observation } from "@/types/db";

// Home dashboard card surfacing the latest 3 observations Reid has logged.
// Hidden entirely when there are none yet — empty-state lives on the
// /observations page, not here, so the home dashboard doesn't carry dead
// surface area for new users. RLS scopes the read; this is a client fetch
// using the user's anon JWT.
export default function ObservationsCard({ userId }: { userId: string }) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("observations")
        .select("id, user_id, session_id, text, confidence, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (cancelled) return;
      setObservations((data ?? []) as Observation[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!loaded) return null;
  if (observations.length === 0) return null;

  return (
    <GlassCard title="WHAT REID NOTICED">
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {observations.map((o) => (
          <li
            key={o.id}
            className="flex flex-col"
            style={{
              gap: 4,
              paddingLeft: 12,
              borderLeft: "2px solid rgba(185,28,28,0.45)",
            }}
          >
            <p
              className="font-serif text-text-primary"
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                letterSpacing: "-0.005em",
              }}
            >
              {o.text}
            </p>
            <span
              className="font-sans"
              style={{
                fontSize: 11,
                color: "#7A90A8",
                letterSpacing: "0.04em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatSessionDate(o.created_at)}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/observations"
        className="flex items-center font-sans"
        style={{
          marginTop: 18,
          gap: 6,
          fontSize: 12,
          color: "#7A90A8",
          letterSpacing: "0.04em",
          transition: "color 150ms ease",
        }}
      >
        <span>See all</span>
        <ArrowRight size={12} strokeWidth={2} />
      </Link>
    </GlassCard>
  );
}
