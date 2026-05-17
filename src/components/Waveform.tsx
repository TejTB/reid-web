"use client";

// Three vertical bars used inside VoiceButton while audio is fetching or
// playing. Height-animation is intentional here: bars are 3px wide and 4-16px
// tall, so the per-frame layout cost is trivial and the visual is the right
// primitive. This is the one place in the app where animating `height` is
// permitted; do not lift the technique elsewhere.
//
// The bars stagger by 150ms so the eye reads them as a wave. When `playing`
// is false the component renders an inert (height: 4px) trio so the button
// width stays stable — no layout shift between idle and active states.

interface WaveformProps {
  playing: boolean;
}

export default function Waveform({ playing }: WaveformProps) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        height: 16,
        width: 13,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: 3,
            borderRadius: 2,
            background: "currentColor",
            height: playing ? undefined : 4,
            willChange: "height",
            animation: playing
              ? `reid-waveform-bar 600ms ease-in-out ${i * 150}ms infinite alternate`
              : undefined,
          }}
        />
      ))}
    </span>
  );
}
