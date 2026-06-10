"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GlowCard } from "@/components/ui/glow-card";
import { supabase } from "@/lib/supabase";
import { formatSessionDate } from "@/lib/format";

// Sprint 13 Build 2 — the read-only session summary view ("what Reid knows").
// EXPLICITLY NOT a chat resume: no message history is fetched and there is no
// continue button. One GlowCard, Playfair title, the summary, commitments,
// key points, and Reid's note. Foreign/unknown/unsummarised ids 404 at the
// API and render the not-found state here.

interface SessionDetail {
  id: string;
  title: string | null;
  summary: string;
  started_at: string | null;
  ended_at: string | null;
  key_points: string[] | null;
  commitments: string[] | null;
  reid_note: string | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; session: SessionDetail };

const LIST_HEADING_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans), sans-serif",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#7A90A8",
  marginBottom: 8,
};

export default function SessionSummaryPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch(`/api/sessions/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          if (!cancelled) setState({ status: "missing" });
          return;
        }
        const body = (await res.json()) as { session?: SessionDetail };
        if (cancelled) return;
        if (body.session) setState({ status: "ready", session: body.session });
        else setState({ status: "missing" });
      } catch {
        if (!cancelled) setState({ status: "missing" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-12">
        <div
          className="h-48 rounded-2xl bg-bg-card animate-skeleton"
          style={{ width: "100%" }}
        />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16 text-center">
        <p
          className="font-serif italic"
          style={{ fontSize: 20, color: "#C8D5E3" }}
        >
          Reid hasn&apos;t written anything down here.
        </p>
        <Link
          href="/home"
          className="font-sans inline-block mt-4 underline"
          style={{ fontSize: 13, color: "#7A90A8" }}
        >
          Back to home
        </Link>
      </div>
    );
  }

  const s = state.session;
  const dateLabel = formatSessionDate(s.started_at);
  const commitments = (s.commitments ?? []).filter(
    (c) => typeof c === "string" && c.trim().length > 0,
  );
  const keyPoints = (s.key_points ?? []).filter(
    (k) => typeof k === "string" && k.trim().length > 0,
  );

  return (
    <div className="mx-auto max-w-[640px] px-6 py-12">
      <GlowCard customSize width="100%" className="!p-7">
        <div>
          <p
            className="font-sans"
            style={{
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#7A90A8",
              marginBottom: 10,
            }}
          >
            {dateLabel || "Session"}
          </p>
          <h1
            className="font-serif"
            style={{
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              color: "#F2EDE3",
              marginBottom: 16,
            }}
          >
            {s.title?.trim() || `Session — ${dateLabel || "untitled"}`}
          </h1>
          <p
            className="font-sans"
            style={{ fontSize: 14.5, lineHeight: 1.65, color: "#C8D5E3" }}
          >
            {s.summary}
          </p>

          {commitments.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <p style={LIST_HEADING_STYLE}>Commitments</p>
              <ul className="flex flex-col" style={{ gap: 6 }}>
                {commitments.map((c, i) => (
                  <li
                    key={i}
                    className="font-sans"
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      color: "#C8D5E3",
                      paddingLeft: 14,
                      position: "relative",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 0,
                        color: "#B91C1C",
                      }}
                    >
                      —
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {keyPoints.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <p style={LIST_HEADING_STYLE}>Worth remembering</p>
              <ul className="flex flex-col" style={{ gap: 6 }}>
                {keyPoints.map((k, i) => (
                  <li
                    key={i}
                    className="font-sans"
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      color: "#7A90A8",
                      paddingLeft: 14,
                      position: "relative",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{ position: "absolute", left: 0, color: "#3A5070" }}
                    >
                      ·
                    </span>
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.reid_note && (
            <p
              className="font-serif italic"
              style={{
                marginTop: 28,
                fontSize: 16,
                lineHeight: 1.55,
                color: "#F2EDE3",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 18,
              }}
            >
              {s.reid_note}
            </p>
          )}
        </div>
      </GlowCard>
    </div>
  );
}
