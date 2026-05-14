"use client";
import { useState } from "react";

// Brand mark. The two hex literals inside the SVG (#B91C1C, #F2EDE3) are the
// intentional brand definition. They are the only hex colors allowed outside
// globals.css. Every other surface in the app references @theme tokens.

type LogoMarkProps = {
  size?: number;
  glow?: boolean;
  interactive?: boolean;
  className?: string;
};

const BASE_GLOW =
  "drop-shadow(0 0 8px rgba(185,28,28,0.55)) drop-shadow(0 0 20px rgba(185,28,28,0.25))";
const INTENSE_GLOW =
  "drop-shadow(0 0 12px rgba(185,28,28,0.75)) drop-shadow(0 0 28px rgba(185,28,28,0.35))";

export default function LogoMark({
  size = 30,
  glow = false,
  interactive = false,
  className = "",
}: LogoMarkProps) {
  const [hovered, setHovered] = useState(false);
  const intense = glow || (interactive && hovered);
  const wrapClass = `inline-block ${className}`.trim();

  return (
    <span
      className={wrapClass}
      aria-hidden
      style={{ lineHeight: 0 }}
      onMouseEnter={interactive ? () => setHovered(true) : undefined}
      onMouseLeave={interactive ? () => setHovered(false) : undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 30 30"
        fill="none"
        style={{
          filter: intense ? INTENSE_GLOW : BASE_GLOW,
          transition: "filter 250ms ease",
        }}
      >
        <rect width="30" height="30" rx="7" fill="#B91C1C" />
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
    </span>
  );
}
