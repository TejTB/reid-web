"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId, getSessions } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@/types/db";

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

// Local "May 14" / "Today" / "Yesterday" formatter for timeline node dates.
// Kept self-contained on this page so it doesn't depend on parallel work
// in src/lib/format.ts.
function formatNodeDate(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const isYesterday =
    then.getFullYear() === y.getFullYear() &&
    then.getMonth() === y.getMonth() &&
    then.getDate() === y.getDate();
  if (isYesterday) return "Yesterday";
  return `${MONTHS_SHORT[then.getMonth()]} ${then.getDate()}`;
}

type TimelineRow =
  | {
      kind: "starting";
      label: string;
      date: string;
      summary: string;
    }
  | {
      kind: "session";
      label: string;
      date: string;
      summary: string | null;
    }
  | {
      kind: "progress";
      label: string;
    };

export default function PlanPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        router.replace("/onboarding");
        return;
      }
      // Pull user + sessions in parallel — both are anon-RLS, no server roundtrip.
      const [userRes, sessionRows] = await Promise.all([
        supabase
          .from("users")
          .select(
            "id, email, name, onboarding_complete, onboarding_summary, onboarding_task, last_session_at, session_count, streak_days, created_at",
          )
          .eq("id", id)
          .maybeSingle(),
        getSessions(id),
      ]);
      if (cancelled) return;
      setUser((userRes.data as User | null) ?? null);
      setSessions(sessionRows);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Build the rendered rows: oldest first.
  //
  // - First row is always STARTING POINT, sourced from users.onboarding_summary.
  //   That row sits BEFORE the first chat session in the timeline (onboarding
  //   precedes session 1 in the user-facing count).
  // - Each subsequent session row is labelled SESSION 2, SESSION 3, … —
  //   STARTING POINT counts as Session 1 in the user-facing numbering.
  // - Last row is always IN PROGRESS with the pulsing dot.
  //
  // If onboarding_summary is null/empty (incomplete onboarding — should not
  // happen because /home redirects, but handle defensively), render only the
  // IN PROGRESS row.
  const rows: TimelineRow[] = [];
  const onboardingSummary = user?.onboarding_summary?.trim() ?? "";
  if (onboardingSummary) {
    rows.push({
      kind: "starting",
      label: "STARTING POINT",
      date: formatNodeDate(user?.created_at),
      summary: onboardingSummary,
    });
    // Reverse to oldest-first.
    const oldestFirst = [...sessions].reverse();
    oldestFirst.forEach((s, i) => {
      rows.push({
        kind: "session",
        label: `SESSION ${i + 2}`,
        date: formatNodeDate(s.started_at),
        summary: s.summary?.trim() || null,
      });
    });
  }
  rows.push({ kind: "progress", label: "IN PROGRESS" });

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
        <div className="relative">
          {/* Vertical dim-red line connecting all dots — stops 6px before the
              last (IN PROGRESS) dot so the timeline visibly terminates. */}
          {rows.length > 1 && (
            <div
              aria-hidden
              className="absolute"
              style={{
                left: 5.5,
                top: 10,
                // Each row is ~80px tall avg; the line should reach the last
                // dot's centre. Stretch bottom:0 and let the last dot sit on
                // top — visually clean enough.
                bottom: 10,
                width: 1,
                background: "rgba(185,28,28,0.18)",
                pointerEvents: "none",
              }}
            />
          )}

          <div className="flex flex-col" style={{ gap: 40 }}>
            {rows.map((row, i) => {
              const delay = `${i * 80}ms`;
              if (row.kind === "starting") {
                return (
                  <TimelineNode
                    key={`starting-${i}`}
                    label={row.label}
                    date={row.date}
                    delay={delay}
                    dot={<SolidDot />}
                  >
                    <p
                      className="font-serif italic whitespace-pre-wrap"
                      style={{
                        fontSize: 18,
                        color: "#F2EDE3",
                        marginTop: 6,
                        lineHeight: 1.45,
                      }}
                    >
                      {row.summary}
                    </p>
                  </TimelineNode>
                );
              }
              if (row.kind === "session") {
                return (
                  <TimelineNode
                    key={`session-${i}`}
                    label={row.label}
                    date={row.date}
                    delay={delay}
                    dot={<SolidDot />}
                  >
                    {row.summary ? (
                      <p
                        className="font-serif italic whitespace-pre-wrap"
                        style={{
                          fontSize: 18,
                          color: "#F2EDE3",
                          marginTop: 6,
                          lineHeight: 1.45,
                        }}
                      >
                        {row.summary}
                      </p>
                    ) : (
                      <p
                        className="font-sans italic"
                        style={{
                          fontSize: 14,
                          color: "#7A90A8",
                          marginTop: 6,
                          lineHeight: 1.6,
                        }}
                      >
                        Session in progress
                      </p>
                    )}
                  </TimelineNode>
                );
              }
              // IN PROGRESS — pulsing red dot, italic Playfair second line.
              return (
                <TimelineNode
                  key={`progress-${i}`}
                  label={row.label}
                  delay={delay}
                  dot={<PulsingDot />}
                >
                  <p
                    className="font-sans"
                    style={{
                      fontSize: 14,
                      color: "#C8D5E3",
                      marginTop: 6,
                      lineHeight: 1.6,
                    }}
                  >
                    Reid is building this with you.
                  </p>
                  <p
                    className="font-serif italic"
                    style={{
                      fontSize: 16,
                      color: "#7A90A8",
                      marginTop: 4,
                      lineHeight: 1.5,
                    }}
                  >
                    Keep showing up.
                  </p>
                </TimelineNode>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SolidDot() {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: "#B91C1C",
        boxShadow: "0 0 12px rgba(185,28,28,0.5)",
        display: "block",
      }}
    />
  );
}

function PulsingDot() {
  return (
    <span
      aria-hidden
      className="relative animate-pulse"
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: "#B91C1C",
        boxShadow: "0 0 12px rgba(185,28,28,0.5)",
        display: "block",
      }}
    />
  );
}

function TimelineNode({
  label,
  date,
  dot,
  children,
  delay,
}: {
  label: string;
  date?: string;
  dot: React.ReactNode;
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
          width: 12,
          // Visually align dot centre with the label baseline.
          marginTop: 6,
        }}
      >
        {dot}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline" style={{ gap: 12 }}>
          <span
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
          </span>
          {date && (
            <span
              className="font-sans"
              style={{
                fontSize: 12,
                color: "#3A5070",
                fontWeight: 400,
              }}
            >
              {date}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
