"use client";
import { useMemo } from "react";
import type { Goal } from "@/types/db";
import { formatGoalValue } from "@/lib/format";
import { useCountUp } from "@/lib/useCountUp";

/** The big top-of-page card for the user's primary goal.
 *
 *  - Title in dim uppercase tracked, deadline chip top-right if set.
 *  - Big current-value number, animated on change. "of {target}" beside it.
 *  - Tall progress bar (8px) with easeOut width transition.
 *  - Bottom row: "£X to go" left, "{n}% there" right.
 *  - Completed state replaces the to-go line with "Goal reached." in accent
 *    italic and freezes the bar at 100%. */
export default function PrimaryGoalHero({
  goal,
  flash,
}: {
  goal: Goal;
  flash: boolean;
}) {
  const display = useCountUp(goal.current_value);
  const target = Number(goal.target_value ?? 0);
  const completed = Boolean(goal.completed_at);
  const pct = target > 0 ? Math.max(0, Math.min(1, display / target)) : 0;
  const pctLabel = target > 0 ? Math.round((goal.current_value / target) * 100) : 0;
  const toGo = Math.max(0, target - goal.current_value);

  const deadline = useMemo(() => parseDeadline(goal.deadline), [goal.deadline]);

  const nearComplete = !completed && target > 0 && goal.current_value / target > 0.75;

  return (
    <section
      className={flash ? "animate-goal-flash" : ""}
      style={{
        padding: "24px",
        borderRadius: 14,
        boxShadow: nearComplete
          ? "inset 4px 0 0 var(--color-accent)"
          : undefined,
      }}
    >
      {/* Header row: title + optional deadline chip. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className="font-sans text-text-dim"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Primary Goal
          </div>
          <h2
            className="font-serif text-text-primary mt-2 [text-wrap:pretty]"
            style={{
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {goal.title}
          </h2>
        </div>
        {deadline && (
          <span
            className="font-sans shrink-0"
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: deadline.color,
              background: deadline.bg,
              borderRadius: 999,
              padding: "5px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {deadline.label}
          </span>
        )}
      </div>

      {/* Big value line. */}
      <div className="mt-7 flex items-baseline gap-3 flex-wrap">
        <span
          className="font-serif text-text-primary"
          style={{
            fontSize: 56,
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatGoalValue(goal, completed ? target : display)}
        </span>
        <span
          className="font-sans text-text-dim"
          style={{ fontSize: 16, fontWeight: 400 }}
        >
          of {formatGoalValue(goal, target)}
        </span>
      </div>

      {/* Tall progress bar. */}
      <div className="mt-7">
        <div
          className="rounded-full overflow-hidden"
          style={{
            height: 8,
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="h-full"
            style={{
              width: `${(completed ? 1 : pct) * 100}%`,
              background: "var(--color-accent)",
              transition: completed
                ? "none"
                : "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow: "0 0 18px rgba(185, 28, 28, 0.35)",
            }}
          />
        </div>

        {/* Bottom row: "X to go" left, "{n}% there" right. */}
        <div className="mt-3 flex items-baseline justify-between gap-4">
          {completed ? (
            <p
              className="font-serif italic"
              style={{
                fontSize: 16,
                color: "var(--color-accent)",
                lineHeight: 1.4,
              }}
            >
              Done.
            </p>
          ) : (
            <p
              className="font-sans text-text-dim"
              style={{ fontSize: 13, fontWeight: 400 }}
            >
              {formatGoalValue(goal, toGo)} to go
            </p>
          )}
          {!completed && (
            <p
              className="font-sans"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: pctLabel >= 75 ? "var(--color-accent)" : "#C8D5E3",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {pctLabel}% there
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Renders a chip for the deadline: green-tinted when far, amber when near
 *  (≤ 14 days), accent-red when close (≤ 3 days) or past. Returns null if
 *  the deadline is unset or unparseable. */
function parseDeadline(
  deadline: string | null,
): { label: string; color: string; bg: string } | null {
  if (!deadline) return null;
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return null;
  const days = Math.ceil((target.getTime() - Date.now()) / 86400000);
  let label: string;
  let color: string;
  let bg: string;
  if (days < 0) {
    label = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    color = "#FCA5A5";
    bg = "rgba(185, 28, 28, 0.18)";
  } else if (days === 0) {
    label = "Due today";
    color = "#FCA5A5";
    bg = "rgba(185, 28, 28, 0.18)";
  } else if (days <= 3) {
    label = `${days} day${days === 1 ? "" : "s"} left`;
    color = "#FCA5A5";
    bg = "rgba(185, 28, 28, 0.14)";
  } else if (days <= 14) {
    label = `${days} days left`;
    color = "#FDE68A";
    bg = "rgba(202, 138, 4, 0.14)";
  } else {
    label = `${days} days left`;
    color = "#C8D5E3";
    bg = "rgba(255, 255, 255, 0.05)";
  }
  return { label, color, bg };
}
