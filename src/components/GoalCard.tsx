"use client";
import type { Goal } from "@/types/db";
import { formatGoalValue } from "@/lib/format";
import { useCountUp } from "@/lib/useCountUp";

/** Compact secondary goal card — used for every non-primary goal in the
 *  supporting grid on /goals. ~140px tall, similar visual rhythm to
 *  PrimaryGoalHero but quieter: smaller numbers, thinner progress bar.
 *
 *  When the goal is > 80% complete it picks up a faint accent ring and an
 *  "Almost there" label in the top-right corner. */
export default function GoalCard({
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
  const fraction = target > 0 ? goal.current_value / target : 0;
  const toGo = Math.max(0, target - goal.current_value);
  const almostThere = !completed && fraction > 0.8;

  return (
    <div
      className={`relative min-h-[140px] flex flex-col ${
        flash ? "animate-goal-flash" : ""
      }`}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: almostThere
          ? "1px solid rgba(185,28,28,0.35)"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "20px 22px",
        boxShadow: almostThere
          ? "0 0 0 1px rgba(185,28,28,0.20), 0 4px 18px rgba(0,0,0,0.18)"
          : "0 4px 18px rgba(0,0,0,0.18)",
      }}
    >
      {almostThere && (
        <span
          className="absolute font-sans"
          style={{
            top: 14,
            right: 16,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.04em",
            color: "var(--color-accent)",
          }}
        >
          Almost there
        </span>
      )}

      <div
        className="font-sans text-text-dim"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          // Reserve right padding so the "Almost there" label can't collide
          // with a long title.
          paddingRight: almostThere ? 80 : 0,
          // Single-line title, ellipsis if truly excessive.
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={goal.title}
      >
        {goal.title}
      </div>

      {/* "X of Y" line. */}
      <p
        className="font-serif text-text-primary mt-2"
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.015em",
          lineHeight: 1.15,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{formatGoalValue(goal, completed ? target : display)}</span>
        <span
          className="font-sans text-text-dim"
          style={{
            fontSize: 13,
            fontWeight: 400,
            marginLeft: 8,
            letterSpacing: 0,
          }}
        >
          of {formatGoalValue(goal, target)}
        </span>
      </p>

      <div className="mt-auto pt-4">
        <div
          className="rounded-full overflow-hidden"
          style={{ height: 4, background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-full"
            style={{
              width: `${(completed ? 1 : pct) * 100}%`,
              background: "var(--color-accent)",
              transition: completed
                ? "none"
                : "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <p
          className="font-sans mt-2"
          style={{
            fontSize: 12,
            color: completed ? "var(--color-accent)" : "#7A90A8",
            fontWeight: 400,
            fontStyle: completed ? "italic" : "normal",
          }}
        >
          {completed
            ? "Goal reached."
            : `${formatGoalValue(goal, toGo)} to go`}
        </p>
      </div>
    </div>
  );
}
