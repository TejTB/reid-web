"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Goal } from "@/types/db";
import { formatGoalValue } from "@/lib/format";

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

function formatCompletedDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Collapsed-by-default trophy shelf at the bottom of /goals. Hides
 *  completely if the user has no completed goals so the empty-of-completed
 *  state never reads as a stub. */
export default function CompletedGoalsSection({
  goals,
}: {
  goals: Goal[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (goals.length === 0) return null;

  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="flex items-center gap-2 font-sans transition-colors hover:text-text-primary"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#7A90A8",
          background: "transparent",
          border: "none",
          padding: "8px 0",
          cursor: "pointer",
        }}
        aria-expanded={expanded}
      >
        <ChevronRight
          size={14}
          strokeWidth={2}
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 180ms ease",
          }}
        />
        <span>Completed · {goals.length}</span>
      </button>

      {expanded && (
        <ul
          className="flex flex-col mt-3 animate-fade-up"
          style={{ gap: 10 }}
        >
          {goals.map((g) => (
            <li
              key={g.id}
              className="flex items-baseline justify-between gap-4"
              style={{
                padding: "12px 16px",
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10,
              }}
            >
              <div className="min-w-0">
                <p
                  className="font-serif text-text-secondary truncate"
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {g.title}
                </p>
                <p
                  className="font-sans text-text-dim mt-0.5"
                  style={{ fontSize: 11, letterSpacing: "0.02em" }}
                >
                  {formatGoalValue(g, g.target_value)}
                </p>
              </div>
              <span
                className="font-sans shrink-0"
                style={{ fontSize: 11, color: "#3A5070" }}
              >
                {formatCompletedDate(g.completed_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
