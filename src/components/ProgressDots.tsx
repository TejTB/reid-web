export default function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div
      className="flex items-center justify-center py-4"
      style={{ gap: 10 }}
      aria-label={`Progress ${current} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        // Treat the (current - 1)th dot as the "active" one (the question
        // currently being asked). Dots before it are completed; dots at or
        // after current are inactive.
        let backgroundColor = "rgba(255,255,255,0.12)";
        if (i < current - 1) backgroundColor = "rgba(185,28,28,0.4)";
        else if (i === current - 1) backgroundColor = "#B91C1C";
        return (
          <span
            key={i}
            className="block rounded-full"
            style={{
              width: 7,
              height: 7,
              backgroundColor,
              transition: "background-color 300ms ease",
            }}
          />
        );
      })}
    </div>
  );
}
