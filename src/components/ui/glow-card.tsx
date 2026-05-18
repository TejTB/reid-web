"use client";
import React, { useEffect, useRef, type ReactNode } from "react";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: "blue" | "purple" | "green" | "red" | "orange";
  size?: "sm" | "md" | "lg";
  width?: string | number;
  height?: string | number;
  customSize?: boolean;
}

const glowColorMap = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 120, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 },
};

const sizeMap = {
  sm: "w-48 h-64",
  md: "w-64 h-80",
  lg: "w-80 h-96",
};

// GlowCard ships its visual rules in two halves:
//   1. JS sets `--x` / `--y` / `--xp` / `--yp` on the outer div as the
//      pointer moves anywhere on the page — same global listener model the
//      original component used.
//   2. The `[data-glow]::before` / `::after` pseudo-element CSS lives in
//      `src/app/globals.css` (search "GlowCard" there). That keeps it out
//      of per-render `dangerouslySetInnerHTML` injection.

const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = "",
  glowColor = "red",
  size = "md",
  width,
  height,
  customSize = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncPointer = (e: PointerEvent) => {
      const { clientX: x, clientY: y } = e;
      if (cardRef.current) {
        cardRef.current.style.setProperty("--x", x.toFixed(2));
        cardRef.current.style.setProperty(
          "--xp",
          (x / window.innerWidth).toFixed(2),
        );
        cardRef.current.style.setProperty("--y", y.toFixed(2));
        cardRef.current.style.setProperty(
          "--yp",
          (y / window.innerHeight).toFixed(2),
        );
      }
    };
    document.addEventListener("pointermove", syncPointer);
    return () => document.removeEventListener("pointermove", syncPointer);
  }, []);

  const { base, spread } = glowColorMap[glowColor];

  const getSizeClasses = () => {
    if (customSize) return "";
    return sizeMap[size];
  };

  const getInlineStyles = (): React.CSSProperties => {
    // CSS-custom-property bag — TS's CSSProperties doesn't know about
    // arbitrary `--*` vars, hence the cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseStyles: any = {
      "--base": base,
      "--spread": spread,
      "--radius": "14",
      "--border": "3",
      "--backdrop": "hsl(0 0% 8% / 0.95)",
      "--backup-border": "rgba(255,255,255,0.06)",
      "--size": "200",
      "--outer": "1",
      "--border-size": "calc(var(--border, 2) * 1px)",
      "--spotlight-size": "calc(var(--size, 150) * 1px)",
      "--hue": "calc(var(--base) + (var(--xp, 0) * var(--spread, 0)))",
      backgroundImage: `radial-gradient(
        var(--spotlight-size) var(--spotlight-size) at
        calc(var(--x, 0) * 1px)
        calc(var(--y, 0) * 1px),
        hsl(var(--hue, 0) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 70) * 1%) / var(--bg-spot-opacity, 0.06)), transparent
      )`,
      backgroundColor: "var(--backdrop, transparent)",
      backgroundSize:
        "calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))",
      backgroundPosition: "50% 50%",
      backgroundAttachment: "fixed",
      border: "var(--border-size) solid var(--backup-border)",
      position: "relative" as const,
      touchAction: "none" as const,
    };
    if (width !== undefined)
      baseStyles.width = typeof width === "number" ? `${width}px` : width;
    if (height !== undefined)
      baseStyles.height = typeof height === "number" ? `${height}px` : height;
    return baseStyles;
  };

  return (
    <div
      ref={cardRef}
      data-glow
      style={getInlineStyles()}
      className={`${getSizeClasses()} ${!customSize ? "aspect-[3/4]" : ""} rounded-2xl relative grid grid-rows-[1fr_auto] shadow-[0_1rem_2rem_-1rem_black] p-4 gap-4 backdrop-blur-[5px] ${className}`}
    >
      <div ref={innerRef} data-glow></div>
      {children}
    </div>
  );
};

export { GlowCard };
