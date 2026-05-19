// Thin horizontal progress bar used at the top of the onboarding chat.
// Replaces ProgressDots — reads as continuous progress rather than discrete
// steps, which matches the conversation arc more honestly. Width is clamped
// to [0, total] so a runaway turn count cannot overflow the rail.

export default function ProgressLine({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const clamped = Math.max(0, Math.min(current, total));
  const percent = total > 0 ? (clamped / total) * 100 : 0;

  return (
    <div
      className="w-full flex items-center"
      style={{
        padding: "0 24px",
      }}
      aria-label="Onboarding progress"
    >
      <div
        style={{
          flex: 1,
          height: 2,
          borderRadius: 2,
          background: "rgba(58,80,112,0.4)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "#B91C1C",
            borderRadius: 2,
            transition: "width 400ms ease-out",
          }}
        />
      </div>
    </div>
  );
}
