"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";
import type { User } from "@/types/db";

// Split onboarding_summary into a first sentence/line (title) and remainder
// (body). Prefer a sentence boundary; fall back to a newline boundary.
function splitSummary(summary: string): { title: string; body: string } {
  const trimmed = summary.trim();
  if (!trimmed) return { title: "", body: "" };
  // First, look for sentence end (. ! ?) followed by whitespace or EOL.
  const sentenceMatch = trimmed.match(/^([^\n.!?]+[.!?])\s+([\s\S]+)$/);
  if (sentenceMatch) {
    return { title: sentenceMatch[1].trim(), body: sentenceMatch[2].trim() };
  }
  // No mid-string sentence break — try a paragraph (blank-line) split.
  const paraIdx = trimmed.search(/\n\s*\n/);
  if (paraIdx !== -1) {
    return {
      title: trimmed.slice(0, paraIdx).trim(),
      body: trimmed.slice(paraIdx).trim(),
    };
  }
  // Try first single newline.
  const nlIdx = trimmed.indexOf("\n");
  if (nlIdx !== -1) {
    return {
      title: trimmed.slice(0, nlIdx).trim(),
      body: trimmed.slice(nlIdx + 1).trim(),
    };
  }
  // One line, no remainder.
  return { title: trimmed, body: "" };
}

export default function PlanPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        router.replace("/onboarding");
        return;
      }
      const { data } = await supabase
        .from("users")
        .select(
          "id, email, name, onboarding_complete, onboarding_summary, onboarding_task, created_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      setUser((data as User | null) ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const summary = user?.onboarding_summary?.trim() ?? "";
  const task = user?.onboarding_task?.trim() ?? "";
  const { title: summaryTitle, body: summaryBody } = splitSummary(summary);

  // Compute node visibility/stagger ordering once.
  const nodes: Array<"starting" | "first" | "progress"> = [];
  if (summary) nodes.push("starting");
  if (task) nodes.push("first");
  nodes.push("progress");

  return (
    <div
      className="mx-auto w-full max-w-[680px] px-6 md:px-6"
      style={{ paddingTop: 56, paddingBottom: 40 }}
    >
      <header style={{ marginBottom: 48 }}>
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          Your Plan
        </h1>
        <p
          className="font-sans"
          style={{ color: "#7A90A8", fontSize: 15, marginTop: 8 }}
        >
          Built session by session.
        </p>
      </header>

      {!loaded ? (
        <div className="flex flex-col gap-6">
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 96 }}
          />
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 80, animationDelay: "100ms" }}
          />
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 80, animationDelay: "200ms" }}
          />
        </div>
      ) : (
        <div className="relative" style={{ paddingLeft: 0 }}>
          {/* The vertical line sits behind the node circles. Circles render at
              left: 0 with width 10px; the line is at left:4.5px (so it passes
              through the dot centers) but spec says left:10px — using the
              node row's gap, the spec value is for an absolute layout where
              circles are at left:10px. We render circles inline inside each
              row at width 10; centerline of dots ends up at 5px. */}
          <div
            aria-hidden
            className="absolute"
            style={{
              left: 4.5,
              top: 6,
              bottom: 6,
              width: 1,
              background: "rgba(242,237,232,0.08)",
              pointerEvents: "none",
            }}
          />

          <div className="flex flex-col" style={{ gap: 40 }}>
            {nodes.map((kind, i) => {
              const delay = `${i * 80}ms`;
              if (kind === "starting") {
                return (
                  <Node
                    key="starting"
                    label="STARTING POINT"
                    delay={delay}
                    circle={
                      <span
                        aria-hidden
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "#B91C1C",
                          boxShadow: "0 0 12px rgba(185,28,28,0.5)",
                          display: "block",
                        }}
                      />
                    }
                  >
                    {summaryTitle && (
                      <p
                        className="font-serif italic whitespace-pre-wrap"
                        style={{
                          fontSize: 18,
                          color: "#F2EDE3",
                          marginTop: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {summaryTitle}
                      </p>
                    )}
                    {summaryBody && (
                      <p
                        className="font-sans whitespace-pre-wrap"
                        style={{
                          fontSize: 14,
                          color: "#C8D5E3",
                          marginTop: 6,
                          lineHeight: 1.6,
                        }}
                      >
                        {summaryBody}
                      </p>
                    )}
                    <p
                      className="font-sans"
                      style={{
                        fontSize: 12,
                        color: "#3A5070",
                        marginTop: 8,
                      }}
                    >
                      {relativeTime(user?.created_at)}
                    </p>
                  </Node>
                );
              }
              if (kind === "first") {
                return (
                  <Node
                    key="first"
                    label="FIRST TASK"
                    delay={delay}
                    circle={
                      <span
                        aria-hidden
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "rgba(185,28,28,0.5)",
                          display: "block",
                        }}
                      />
                    }
                  >
                    <p
                      className="font-serif italic whitespace-pre-wrap"
                      style={{
                        fontSize: 18,
                        color: "#F2EDE3",
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {task}
                    </p>
                    <p
                      className="font-sans"
                      style={{
                        fontSize: 14,
                        color: "#C8D5E3",
                        marginTop: 6,
                        lineHeight: 1.6,
                      }}
                    >
                      Assigned by Reid after session 1.
                    </p>
                  </Node>
                );
              }
              // IN PROGRESS — always visible.
              return (
                <Node
                  key="progress"
                  label="IN PROGRESS"
                  delay={delay}
                  circle={
                    <span
                      aria-hidden
                      className="relative"
                      style={{
                        width: 10,
                        height: 10,
                        display: "inline-block",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "50%",
                          border: "1.5px solid #B91C1C",
                          background: "transparent",
                        }}
                      />
                      <span
                        className="node-pulse"
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "50%",
                          border: "1.5px solid #B91C1C",
                          background: "transparent",
                          pointerEvents: "none",
                        }}
                      />
                    </span>
                  }
                >
                  <p
                    className="font-serif italic"
                    style={{
                      fontSize: 18,
                      color: "#F2EDE3",
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    Reid is building your plan.
                  </p>
                  <p
                    className="font-sans"
                    style={{
                      fontSize: 14,
                      color: "#7A90A8",
                      marginTop: 6,
                      lineHeight: 1.6,
                    }}
                  >
                    Keep having sessions. The plan takes shape from what you do.
                  </p>
                </Node>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Node({
  label,
  circle,
  children,
  delay,
}: {
  label: string;
  circle: React.ReactNode;
  children: React.ReactNode;
  delay: string;
}) {
  return (
    <div
      className="flex items-start animate-fade-up"
      style={{ gap: 20, animationDelay: delay }}
    >
      <div
        className="shrink-0 relative"
        style={{
          width: 10,
          // Circle is vertically aligned with the label baseline ish — 6px
          // matches the spec margin-top:6px.
          marginTop: 6,
        }}
      >
        {circle}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="font-sans"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#7A90A8",
          }}
        >
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}
