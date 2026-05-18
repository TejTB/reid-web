"use client";
import React, { type ReactNode } from "react";

interface CardCanvasProps {
  children: ReactNode;
  className?: string;
}

interface CardProps {
  children: ReactNode;
  className?: string;
  category?: string;
}

const categoryGlow: Record<string, string> = {
  avoidance: "#B91C1C",
  pattern: "#d97706",
  contradiction: "#7c3aed",
  strength: "#16a34a",
  default: "#B91C1C",
};

// CardCanvas provides the SVG filter once per page. Render it ONCE at the
// top of a page that uses <Card>. Card children reference url(#reid-bloom).
// Do NOT wrap every Card in its own CardCanvas — that duplicates the filter
// id and is invalid HTML.
export const CardCanvas = ({ children, className = "" }: CardCanvasProps) => (
  <div className={`relative ${className}`}>
    <svg
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <filter
          id="reid-bloom"
          width="3000%"
          x="-1000%"
          height="3000%"
          y="-1000%"
        >
          <feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 3 0" />
        </filter>
      </defs>
    </svg>
    {children}
  </div>
);

export const Card = ({
  children,
  className = "",
  category = "default",
}: CardProps) => {
  const color = categoryGlow[category] ?? categoryGlow.default;
  return (
    <div
      className={`relative rounded-xl bg-[#111111] overflow-hidden ${className}`}
      style={{ isolation: "isolate" }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          filter: "url(#reid-bloom)",
          zIndex: 0,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: "5%", height: "90%", width: "1px", background: color, opacity: 0.8 }} />
        <div style={{ position: "absolute", right: 0, top: "5%", height: "90%", width: "1px", background: color, opacity: 0.8 }} />
        <div style={{ position: "absolute", top: 0, left: "5%", width: "90%", height: "1px", background: color, opacity: 0.8 }} />
        <div style={{ position: "absolute", bottom: 0, left: "5%", width: "90%", height: "1px", background: color, opacity: 0.8 }} />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
};
