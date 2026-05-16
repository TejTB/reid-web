"use client";
import { useEffect, useRef, useState } from "react";

/** Animates a displayed number from its previous value to the new `target`
 *  over `duration` ms using a simple easeOut curve. Returns the displayed
 *  value, which equals `target` on first mount (no entrance animation) and
 *  on every subsequent change interpolates from the prior value.
 *
 *  Used by goal cards + the primary hero to give "current_value" updates a
 *  short, dignified count-up rather than a hard cut. */
export function useCountUp(target: number, duration: number = 600): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState<number>(safeTarget);
  const prevRef = useRef<number>(safeTarget);
  const mountedRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // First mount: snap to the target, never animate.
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = safeTarget;
      setDisplay(safeTarget);
      return;
    }

    const from = prevRef.current;
    const to = safeTarget;
    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic — gentle decay into final value.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      // If we unmount mid-animation, commit prev to the latest target so the
      // next mount under a fresh value doesn't replay the old interpolation.
      prevRef.current = safeTarget;
    };
  }, [safeTarget, duration]);

  return display;
}
