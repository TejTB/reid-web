"use client";
import * as React from "react";
import { useEffect, useId, useRef } from "react";

interface GoalRingProps {
  currentValue: number;
  targetValue: number;
  unit: string;
  unitPrefix: boolean;
  label: string;
  deadline?: string | null;
  size?: "sm" | "md" | "lg";
}

function getProgressColor(current: number, target: number): string {
  if (target === 0) return "#B91C1C";
  const pct = current / target;
  if (pct >= 0.7) return "#16A34A";
  if (pct >= 0.3) return "#D97706";
  return "#B91C1C";
}

function formatValue(value: number, unit: string, unitPrefix: boolean): string {
  const formatted = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return unitPrefix ? `${unit}${formatted}` : `${formatted} ${unit}`;
}

function circumference(r: number): number {
  return 2 * Math.PI * r;
}

export function GoalRing({
  currentValue,
  targetValue,
  unit,
  unitPrefix,
  label,
  deadline,
  size = "lg",
}: GoalRingProps) {
  const strokeRef = useRef<SVGCircleElement>(null);
  const reactId = useId();
  const gradId = `goal-grad-${reactId.replace(/:/g, "")}`;

  const sizeMap = { sm: 60, md: 120, lg: 200 };
  const svgSize = sizeMap[size];
  const radius = svgSize * 0.4;
  const dist = circumference(radius);
  const distHalf = dist / 2;
  const progress = targetValue > 0 ? Math.min(currentValue / targetValue, 1) : 0;
  const strokeDashoffset = progress * -distHalf;
  const color = getProgressColor(currentValue, targetValue);
  const strokeWidth = size === "lg" ? 8 : size === "md" ? 6 : 4;

  useEffect(() => {
    if (!strokeRef.current) return;
    strokeRef.current.animate(
      [
        { strokeDashoffset: "0", offset: 0 },
        { strokeDashoffset: "0", offset: 400 / 1400 },
        { strokeDashoffset: strokeDashoffset.toString() },
      ],
      { duration: 1400, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
    );
  }, [currentValue, targetValue, strokeDashoffset]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: svgSize, height: svgSize / 2 + strokeWidth }}>
        <svg
          viewBox={`0 0 ${svgSize} ${svgSize / 2 + strokeWidth}`}
          style={{ width: svgSize, height: svgSize / 2 + strokeWidth }}
          aria-label={`${label}: ${formatValue(currentValue, unit, unitPrefix)} of ${formatValue(targetValue, unit, unitPrefix)}`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
          </defs>
          <g
            fill="none"
            strokeWidth={strokeWidth}
            transform={`translate(${svgSize / 2}, ${svgSize / 2})`}
          >
            <circle
              r={radius}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray={`${distHalf} ${distHalf}`}
              strokeLinecap="round"
              transform="rotate(-180)"
            />
            <circle
              ref={strokeRef}
              r={radius}
              stroke={`url(#${gradId})`}
              strokeDasharray={`${distHalf} ${distHalf}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              transform="rotate(-180)"
            />
          </g>
        </svg>

        <div
          className="absolute bottom-0 left-0 right-0 text-center"
          style={{ paddingBottom: size === "lg" ? 8 : 4 }}
        >
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: size === "lg" ? 32 : size === "md" ? 22 : 14,
              color: "#F2EDE3",
              lineHeight: 1,
            }}
          >
            {formatValue(currentValue, unit, unitPrefix)}
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              fontSize: size === "lg" ? 12 : 10,
              color: "#7A90A8",
              marginTop: 2,
            }}
          >
            of {formatValue(targetValue, unit, unitPrefix)}
          </div>
        </div>
      </div>

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
        {deadline && (
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              color: "#7A90A8",
              marginTop: 4,
            }}
          >
            Due {new Date(deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </p>
        )}
      </div>
    </div>
  );
}
