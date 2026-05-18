"use client";
import { motion } from "framer-motion";

// Animated conic-gradient blur that rotates around a card's inner edge to
// draw the eye to the "Annual" plan in PaywallModal. Pointer-events:none and
// absolutely positioned so it never blocks the underlying button.
export function BorderTrail() {
  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-24 h-24 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, #B91C1C 60deg, transparent 120deg)",
          filter: "blur(12px)",
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
