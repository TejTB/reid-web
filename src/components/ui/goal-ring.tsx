"use client";
import * as React from "react";
import { useEffect, useRef } from "react";

interface GoalRingProps {
  currentValue: number;
  targetValue: number;
  unit: string;
  unitPrefix: boolean;
  label: string;
  deadline?: string | null;
  size?: "sm" | "md" | "lg";
  /** When true, omit the label/value text block below the ring. Use this
   *  from layouts that render their own title + metrics next to the ring
   *  (e.g. the goals primary-card layout in Sprint 11). Defaults to false
   *  so existing call sites (home mini-ring) keep their text block. */
  hideMeta?: boolean;
}

function formatValue(value: number, unit: string, unitPrefix: boolean): string {
  const formatted =
    value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return unitPrefix ? `${unit}${formatted}` : `${formatted} ${unit}`;
}

// Sprint 11 GoalRing redesign:
//   - Full 360° circle (not the legacy half-arc)
//   - Centre text is the PERCENTAGE ONLY. Nothing else inside the SVG.
//   - Background arc: rgba(185,28,28,0.2). Progress arc: #B91C1C.
//   - Goal title, current/target values, due date — rendered below the SVG
//     (or hidden via hideMeta and rendered by the parent card layout).
//   - Sizes: sm=60, md=120 (home mini-ring), lg=180 (goals page primary).
export function GoalRing({
  currentValue,
  targetValue,
  unit,
  unitPrefix,
  label,
  deadline,
  size = "lg",
  hideMeta = false,
}: GoalRingProps) {
  const progressRef = useRef<SVGCircleElement>(null);

  const sizeMap = { sm: 60, md: 120, lg: 180 };
  const diameter = sizeMap[size];
  const strokeWidth = 8;
  const radius = (diameter - strokeWidth) / 2;
  const cx = diameter / 2;
  const cy = diameter / 2;
  const circumference = 2 * Math.PI * radius;

  const safeTarget = targetValue > 0 ? targetValue : 1;
  const progress = Math.max(0, Math.min(currentValue / safeTarget, 1));
  const targetOffset = circumference * (1 - progress);
  const pctLabel = Math.round(progress * 100);
  const fontSize = Math.round(diameter * 0.18);

  useEffect(() => {
    if (!progressRef.current) return;
    progressRef.current.animate(
      [
        { strokeDashoffset: String(circumference) },
        { strokeDashoffset: String(targetOffset) },
      ],
      {
        duration: 1100,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "forwards",
      },
    );
  }, [circumference, targetOffset]);

  const aria = `${label}: ${formatValue(currentValue, unit, unitPrefix)} of ${formatValue(
    targetValue,
    unit,
    unitPrefix,
  )} (${pctLabel}%)`;

  return (
    <div className="flex flex-col items-center" style={{ gap: 12 }}>
      <svg
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ width: diameter, height: diameter, display: "block" }}
        role="img"
        aria-label={aria}
      >
        {/* Background arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(185,28,28,0.2)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc — start at 12 o'clock via -90° rotation */}
        <circle
          ref={progressRef}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#B91C1C"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Percentage — the ONLY text inside the SVG */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize,
            fill: "#F2EDE3",
          }}
        >
          {pctLabel}%
        </text>
      </svg>

      {!hideMeta && (
        <div className="text-center">
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: size === "lg" ? 18 : size === "md" ? 14 : 12,
              color: "#F2EDE3",
              lineHeight: 1.3,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              color: "#C8D5E3",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {formatValue(currentValue, unit, unitPrefix)} of{" "}
            {formatValue(targetValue, unit, unitPrefix)}
          </p>
          {deadline && (
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: "#7A90A8",
                marginTop: 4,
              }}
            >
              Due{" "}
              {new Date(deadline).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
