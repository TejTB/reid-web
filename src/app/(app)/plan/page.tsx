"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth, useEntitlement } from "@/components/AuthProvider";
import { GlowCard } from "@/components/ui/glow-card";
import { getMySessions } from "@/lib/session";
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

// Active-session detection: a row is the "active" one if its `ended_at` is
// null. Only the most-recent such row counts (defensive — there should be at
// most one open session per user under the current write path).
function isSessionActive(s: Session): boolean {
  return s.ended_at === null;
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
      summary: string;
      title: string | null;
      reidNote: string | null;
    }
  | {
      kind: "active";
      label: string;
      date: string;
    }
  | {
      kind: "locked";
      label: string;
    };

export default function PlanPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const entitlement = useEntitlement();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      setUser(me);
      try {
        const sessionRows = await getMySessions();
        if (cancelled) return;
        setSessions(sessionRows);
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

  // Build the rendered rows: oldest first.
  //
  // - First row is always STARTING POINT (the onboarding summary). It counts
  //   as user-facing "Session 1" so chat sessions are labelled SESSION 2…
  // - Each completed chat session (ended_at IS NOT NULL) renders its summary.
  // - The single active chat session (ended_at IS NULL, if any) shows the
  //   pulsing red dot and "Active now". Only ONE row can be active.
  // - For free users, dim "Not yet" rows with a lock icon fill the remaining
  //   slots up to the live free allowance of chat sessions, showing the user
  //   the rest of the road. Pro users see no locks — their roadmap is unbounded.
  const rows: TimelineRow[] = [];
  const onboardingSummary = user?.onboarding_summary?.trim() ?? "";
  const isPro = user?.subscription_status === "pro";

  if (onboardingSummary) {
    rows.push({
      kind: "starting",
      label: "STARTING POINT",
      date: formatNodeDate(user?.created_at),
      summary: onboardingSummary,
    });

    // `sessions` arrives newest-first; reverse to oldest-first. Drop completed
    // sessions that never produced a summary (abandoned/failed) — they
    // clutter the roadmap and shouldn't count toward the free-tier cap UX.
    // Active sessions (ended_at === null) are always kept.
    const oldestFirst = [...sessions]
      .reverse()
      .filter((s) => isSessionActive(s) || (s.summary && s.summary.trim().length > 0));
    let actualSessionCount = 0;
    oldestFirst.forEach((s, i) => {
      const label = `SESSION ${i + 2}`;
      if (isSessionActive(s)) {
        rows.push({ kind: "active", label, date: formatNodeDate(s.started_at) });
      } else {
        rows.push({
          kind: "session",
          label,
          date: formatNodeDate(s.ended_at ?? s.started_at),
          summary: s.summary?.trim() || "Session ended without a summary.",
          title: s.title?.trim() ? s.title.trim() : null,
          reidNote: s.reid_note?.trim() ? s.reid_note.trim() : null,
        });
      }
      actualSessionCount += 1;
    });

    // Free-tier roadmap: pad with locked rows up to the live free allowance.
    if (!isPro) {
      const allowance = entitlement?.allowance ?? 0;
      const remaining = Math.max(0, allowance - actualSessionCount);
      for (let k = 0; k < remaining; k += 1) {
        const label = `SESSION ${actualSessionCount + 2 + k}`;
        rows.push({ kind: "locked", label });
      }
    }
  }

  return (
    <div
      className="mx-auto w-full max-w-[680px] px-6 md:px-6"
      style={{ paddingTop: 56, paddingBottom: 40 }}
    >
      <header style={{ marginBottom: 48 }}>
        <h1 className="font-serif text-3xl text-white mb-1">Your Plan</h1>
        <p className="text-white/30 text-sm font-sans">
          Built session by session.
        </p>
      </header>

      {error ? (
        <div className="flex flex-col items-center justify-center pt-24 gap-4">
          <p className="font-serif italic text-text-dim text-lg">
            My end is jammed.
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
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <p className="text-white/20 text-sm italic font-serif">
            Your plan builds after each completed session.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical dim-red line connecting all dots — stops 6px before the
              last dot so the timeline visibly terminates. */}
          {rows.length > 1 && (
            <div
              aria-hidden
              className="absolute"
              style={{
                left: 5.5,
                top: 10,
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
                      className="font-serif italic whitespace-pre-wrap [text-wrap:pretty]"
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
                    {row.title && (
                      <p
                        className="font-serif italic [text-wrap:pretty]"
                        style={{
                          fontSize: 20,
                          color: "#F2EDE3",
                          marginTop: 6,
                          lineHeight: 1.3,
                          fontWeight: 500,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {row.title}
                      </p>
                    )}
                    <p
                      className="font-serif italic whitespace-pre-wrap [text-wrap:pretty]"
                      style={{
                        fontSize: row.title ? 16 : 18,
                        color: row.title ? "#C8D5E3" : "#F2EDE3",
                        marginTop: row.title ? 6 : 6,
                        lineHeight: 1.5,
                      }}
                    >
                      {row.summary}
                    </p>
                    {row.reidNote && (
                      <p
                        className="font-serif italic [text-wrap:pretty]"
                        style={{
                          fontSize: 14,
                          color: "#7A90A8",
                          marginTop: 10,
                          lineHeight: 1.5,
                        }}
                      >
                        {row.reidNote}
                      </p>
                    )}
                  </TimelineNode>
                );
              }
              if (row.kind === "active") {
                return (
                  <TimelineNode
                    key={`active-${i}`}
                    label={row.label}
                    date={row.date}
                    delay={delay}
                    dot={<PulsingDot />}
                  >
                    <p
                      className="font-sans [text-wrap:pretty]"
                      style={{
                        fontSize: 14,
                        color: "#C8D5E3",
                        marginTop: 6,
                        lineHeight: 1.6,
                      }}
                    >
                      Active now
                    </p>
                    <p
                      className="font-serif italic [text-wrap:pretty]"
                      style={{
                        fontSize: 16,
                        color: "#7A90A8",
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      Reid is building this with you.
                    </p>
                  </TimelineNode>
                );
              }
              // locked — dim, lock icon, "Not yet".
              return (
                <TimelineNode
                  key={`locked-${i}`}
                  label={row.label}
                  delay={delay}
                  dot={<LockedDot />}
                  dim
                >
                  <p
                    className="font-sans flex items-center"
                    style={{
                      fontSize: 13,
                      color: "rgba(242,237,227,0.35)",
                      marginTop: 6,
                      lineHeight: 1.6,
                      gap: 6,
                    }}
                  >
                    <Lock size={12} strokeWidth={1.8} aria-hidden />
                    <span>Not yet</span>
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

function LockedDot() {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.14)",
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
  dim,
}: {
  label: string;
  date?: string;
  dot: React.ReactNode;
  children: React.ReactNode;
  delay: string;
  dim?: boolean;
}) {
  return (
    <div
      className="flex items-start animate-fade-up"
      style={{
        gap: 20,
        animationDelay: delay,
        opacity: dim ? 0.55 : 1,
      }}
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
        <GlowCard customSize glowColor="red" className="w-full p-4">
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
        </GlowCard>
      </div>
    </div>
  );
}
