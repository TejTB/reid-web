"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GlowCard } from "@/components/ui/glow-card";
import { supabase } from "@/lib/supabase";
import type { Observation } from "@/types/db";

// Home dashboard preview of the latest three observations Reid has logged.
// Hides entirely when there are none yet — empty-state lives on the
// /observations page, not here, so the home dashboard doesn't carry dead
// surface area for new users.
//
// Visual DNA matches /observations: GlowCard wrapper, dark inner surface,
// CategoryBadge in the four standard hues (avoidance / pattern /
// contradiction / strength). Legacy [OBSERVATION] rows that arrived without
// a category fall back to the avoidance badge so they still read as "noted
// by Reid" without inventing a category they don't have.

const CATEGORY_STYLES: Record<string, string> = {
  avoidance: "bg-[#B91C1C]/15 text-[#f87171] border border-[#B91C1C]/25",
  pattern: "bg-amber-900/20 text-amber-400 border border-amber-700/30",
  contradiction:
    "bg-purple-900/20 text-purple-400 border border-purple-700/30",
  strength: "bg-green-900/20 text-green-400 border border-green-700/30",
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-sans ${
        CATEGORY_STYLES[category] ?? CATEGORY_STYLES.avoidance
      }`}
    >
      {category}
    </span>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function ObservationsCard({ userId }: { userId: string }) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("observations")
        .select(
          "id, user_id, session_id, text, confidence, category, created_at",
        )
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
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/30 uppercase tracking-widest font-sans">
          What Reid Noticed
        </span>
        <Link
          href="/observations"
          className="text-xs text-white/25 hover:text-white/50 transition-colors font-sans"
        >
          See all →
        </Link>
      </div>
      <div className="space-y-2">
        {observations.slice(0, 3).map((o) => (
          <GlowCard
            key={o.id}
            customSize
            glowColor="red"
            className="w-full"
          >
            <div className="px-4 py-3 bg-[#111111] rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <CategoryBadge category={o.category ?? "avoidance"} />
                <span className="text-white/20 text-xs font-sans">
                  {formatShortDate(o.created_at)}
                </span>
              </div>
              <p className="text-white/65 text-sm font-serif italic leading-relaxed line-clamp-2 [text-wrap:pretty]">
                {o.text}
              </p>
            </div>
          </GlowCard>
        ))}
      </div>
    </div>
  );
}
