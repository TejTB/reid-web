export default function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-4"
      aria-label={`Progress ${current} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < current;
        return (
          <span
            key={i}
            className="block rounded-full transition-colors duration-300"
            style={{
              width: 6,
              height: 6,
              backgroundColor: filled
                ? "#B91C1C"
                : "rgba(255,255,255,0.15)",
            }}
          />
        );
      })}
    </div>
  );
}
