"use client";
import { motion } from "framer-motion";

// Animated conic-gradient sweep that rotates around a card's inner edge to
// draw the eye to the "Annual" plan in PaywallModal. Pointer-events:none and
// absolutely positioned so it never blocks the underlying button.
//
// Defaults reproduce the original paywall look (#B91C1C accent, 12px blur).
// Callers can override: the voice orb's thinking accent passes the brand
// orb-core (#8E1616) with blur disabled for a crisp edge ring.
interface BorderTrailProps {
  /** Accent colour of the rotating sweep. Defaults to the paywall red. */
  color?: string;
  /** Gaussian blur radius in px. Pass 0 for a crisp (un-blurred) edge. */
  blur?: number;
}

export function BorderTrail({ color = "#B91C1C", blur = 12 }: BorderTrailProps = {}) {
  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-24 h-24 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${color} 60deg, transparent 120deg)`,
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
          opacity: 0.6,
          top: "-48px",
          left: "-48px",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}
