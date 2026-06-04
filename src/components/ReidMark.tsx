// Brand mark — circular variant. Reuses LogoMark's EXACT "R" glyph (same path +
// line data — do NOT redraw it) set inside a circle instead of LogoMark's
// rounded square. Sized for small surfaces: the chat↔voice toggle and inline
// icons.
//
// Like LogoMark, the two hex literals here (#B91C1C, #F2EDE3) are the
// intentional brand definition and are the only hex colours allowed outside
// globals.css.
//
// Pure SVG, no state — intentionally NOT a client component so it can be used
// from server components too.

type ReidMarkProps = {
  /** Pixel diameter. Defaults to 24. */
  size?: number;
  className?: string;
  /** When set, the mark is announced as an image; otherwise it is decorative
   *  (aria-hidden) — the right default inside a labelled button/control. */
  ariaLabel?: string;
};

export default function ReidMark({
  size = 24,
  className,
  ariaLabel,
}: ReidMarkProps) {
  const labelled = typeof ariaLabel === "string" && ariaLabel.length > 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      className={className}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? ariaLabel : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      <circle cx="15" cy="15" r="15" fill="#B91C1C" />
      {/* R glyph — identical geometry to LogoMark, just inside a circle. */}
      <path
        d="M8.5 7.5H15a5 5 0 0 1 0 10H8.5V7.5Z"
        stroke="#F2EDE3"
        strokeWidth="1.7"
        fill="none"
        strokeLinejoin="round"
      />
      <line
        x1="8.5"
        y1="12.5"
        x2="17"
        y2="12.5"
        stroke="#F2EDE3"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <line
        x1="14.5"
        y1="17.5"
        x2="21.5"
        y2="23"
        stroke="#F2EDE3"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
