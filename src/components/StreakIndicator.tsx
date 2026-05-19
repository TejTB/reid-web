interface StreakIndicatorProps {
  days: number;
}

export default function StreakIndicator({ days }: StreakIndicatorProps) {
  if (days < 2) return null;
  return (
    <div
      className="flex items-center font-sans text-text-dim"
      style={{
        gap: 8,
        fontSize: 12,
        letterSpacing: "0.04em",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#22C55E",
          boxShadow: "0 0 8px rgba(34,197,94,0.45)",
          display: "inline-block",
        }}
      />
      <span>Session streak: {days} days</span>
    </div>
  );
}
