"use client";
import type { GoalEventWithGoal } from "@/lib/session";
import { formatEventTime, formatGoalValue } from "@/lib/format";

/** Right-rail live feed of every goal_event for the current user, newest
 *  first. The list is small (≤ 30 rows); each row shows a relative
 *  timestamp, a green/red delta badge with the goal name, and the optional
 *  note in Reid's voice (Playfair italic).
 *
 *  Wrapped externally in <GlowCard> by /goals — this component renders only
 *  the inner column. */
export default function GoalEventFeed({
  events,
}: {
  events: GoalEventWithGoal[];
}) {
  return (
    <aside
      className="lg:sticky lg:top-6 flex flex-col"
      style={{
        padding: "24px",
        borderRadius: 14,
        maxHeight: "calc(100vh - 96px)",
        overflow: "hidden",
      }}
    >
      <header
        className="font-sans shrink-0"
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#7A90A8",
          marginBottom: 18,
        }}
      >
        Live activity
      </header>

      {events.length === 0 ? (
        <p
          className="font-serif italic [text-wrap:pretty]"
          style={{
            fontSize: 15,
            color: "#7A90A8",
            lineHeight: 1.55,
            padding: "8px 0",
          }}
        >
          Tell me what moved. I&apos;ll log it.
        </p>
      ) : (
        <ul
          className="flex flex-col overflow-y-auto pr-1"
          style={{ gap: 18 }}
        >
          {events.map((e, i) => (
            <li
              key={e.id}
              className={i === 0 ? "animate-fade-up" : ""}
              style={{ animationDelay: i === 0 ? "0ms" : undefined }}
            >
              <FeedRow event={e} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function FeedRow({ event }: { event: GoalEventWithGoal }) {
  const positive = event.delta >= 0;
  const sign = positive ? "+" : "-";
  const magnitude = formatGoalValue(
    { unit: event.goal_unit, unit_prefix: event.goal_unit_prefix },
    Math.abs(event.delta),
  );
  const badgeText = `${sign}${magnitude}`;

  return (
    <div className="flex items-start" style={{ gap: 10 }}>
      <span
        aria-hidden
        className="rounded-full shrink-0"
        style={{
          width: 8,
          height: 8,
          background: "var(--color-accent)",
          marginTop: 6,
          boxShadow: "0 0 8px rgba(185,28,28,0.45)",
        }}
      />
      <div className="min-w-0 flex-1">
        <div
          className="font-sans"
          style={{
            fontSize: 11,
            color: "#3A5070",
            letterSpacing: "0.03em",
          }}
        >
          {formatEventTime(event.created_at)}
        </div>
        <div className="mt-1 flex items-baseline flex-wrap" style={{ gap: 8 }}>
          <span
            className="font-mono"
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "2px 7px",
              borderRadius: 6,
              background: positive
                ? "rgba(74, 222, 128, 0.08)"
                : "rgba(185, 28, 28, 0.10)",
              color: positive ? "#4ADE80" : "var(--color-accent)",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {badgeText}
          </span>
          <span
            className="font-sans truncate"
            style={{
              fontSize: 13,
              color: "#C8D5E3",
              fontWeight: 400,
              minWidth: 0,
            }}
          >
            {event.goal_title}
          </span>
        </div>
        {event.note && (
          <p
            className="font-serif italic mt-1.5 [text-wrap:pretty]"
            style={{
              fontSize: 14,
              color: "#F2EDE3",
              lineHeight: 1.5,
            }}
          >
            {event.note}
          </p>
        )}
      </div>
    </div>
  );
}
