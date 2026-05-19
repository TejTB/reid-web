// ============================================================
// SPRINT 10 COMPONENTS — Save this file to:
// ~/Documents/reid-app/sprint10-components.tsx
// Claude Code will read this file during Phase 3 execution.
// Each component is ready to be split into its own file.
// ============================================================

// ============================================================
// 1. BEAMS BACKGROUND
// Save to: src/components/ui/beams-background.tsx
// Usage: Home page only, full-bleed background layer
// ============================================================

"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BeamsBackgroundProps {
  className?: string;
  children?: React.ReactNode;
  intensity?: "subtle" | "medium" | "strong";
}

interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}

function createBeam(width: number, height: number): Beam {
  const angle = -35 + Math.random() * 10;
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle,
    speed: 0.4 + Math.random() * 0.8,
    // Reid: deep reds only, very subtle
    opacity: 0.04 + Math.random() * 0.06,
    hue: Math.random() * 20, // 0-20: deep reds
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
  };
}

export function BeamsBackground({
  className,
  intensity = "subtle",
}: BeamsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<Beam[]>([]);
  const animationFrameRef = useRef<number>(0);
  const MINIMUM_BEAMS = 15;

  const opacityMap = {
    subtle: 0.6,
    medium: 0.8,
    strong: 1,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      beamsRef.current = Array.from({ length: MINIMUM_BEAMS }, () =>
        createBeam(canvas.width, canvas.height)
      );
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    function resetBeam(beam: Beam, index: number) {
      if (!canvas) return beam;
      const column = index % 3;
      const spacing = canvas.width / 3;
      beam.y = canvas.height + 100;
      beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
      beam.width = 80 + Math.random() * 80;
      beam.speed = 0.3 + Math.random() * 0.5;
      beam.hue = Math.random() * 20;
      beam.opacity = 0.04 + Math.random() * 0.05;
      return beam;
    }

    function drawBeam(ctx: CanvasRenderingContext2D, beam: Beam) {
      ctx.save();
      ctx.translate(beam.x, beam.y);
      ctx.rotate((beam.angle * Math.PI) / 180);
      const pulsingOpacity = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * opacityMap[intensity];
      const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);
      gradient.addColorStop(0, `hsla(${beam.hue}, 90%, 45%, 0)`);
      gradient.addColorStop(0.1, `hsla(${beam.hue}, 90%, 45%, ${pulsingOpacity * 0.5})`);
      gradient.addColorStop(0.4, `hsla(${beam.hue}, 90%, 45%, ${pulsingOpacity})`);
      gradient.addColorStop(0.6, `hsla(${beam.hue}, 90%, 45%, ${pulsingOpacity})`);
      gradient.addColorStop(0.9, `hsla(${beam.hue}, 90%, 45%, ${pulsingOpacity * 0.5})`);
      gradient.addColorStop(1, `hsla(${beam.hue}, 90%, 45%, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx.restore();
    }

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "blur(35px)";
      beamsRef.current.forEach((beam, index) => {
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;
        if (beam.y + beam.length < -100) resetBeam(beam, index);
        drawBeam(ctx, beam);
      });
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animate();
    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [intensity]);

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ filter: "blur(15px)" }} />
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.03, 0.08, 0.03] }}
        transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }}
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(185,28,28,0.08) 0%, transparent 70%)" }}
      />
    </div>
  );
}


// ============================================================
// 2. LOCATION TAG
// Save to: src/components/ui/location-tag.tsx
// Usage: Sidebar bottom section
// ============================================================

"use client";
import { useState, useEffect } from "react";

interface LocationTagProps {
  city?: string;
  country?: string;
  timezone?: string;
}

export function LocationTag({
  city = "Newcastle",
  country = "UK",
  timezone = "GMT",
}: LocationTagProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300"
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        background: isHovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
      }}
    >
      {/* Live pulse */}
      <div className="relative flex items-center justify-center flex-shrink-0">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      </div>

      {/* Text flip */}
      <div className="relative overflow-hidden h-4" style={{ width: "90px" }}>
        <span
          className="absolute text-xs font-medium transition-all duration-300 whitespace-nowrap"
          style={{
            color: "#7A90A8",
            transform: isHovered ? "translateY(-100%)" : "translateY(0)",
            opacity: isHovered ? 0 : 1,
          }}
        >
          {city}, {country}
        </span>
        <span
          className="absolute text-xs font-medium transition-all duration-300 whitespace-nowrap"
          style={{
            color: "#C8D5E3",
            transform: isHovered ? "translateY(0)" : "translateY(100%)",
            opacity: isHovered ? 1 : 0,
          }}
        >
          {currentTime} {timezone}
        </span>
      </div>
    </button>
  );
}


// ============================================================
// 3. BANNER
// Save to: src/components/ui/banner.tsx
// Usage: Home page contextual nudges from Reid
// ============================================================

"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const bannerVariants: Record<string, string> = {
  default: "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#C8D5E3]",
  reid: "bg-[rgba(185,28,28,0.08)] border-[rgba(185,28,28,0.20)] text-[#F2EDE3]",
  warning: "bg-[rgba(217,119,6,0.08)] border-[rgba(217,119,6,0.20)] text-[#F2EDE3]",
  success: "bg-[rgba(22,163,74,0.08)] border-[rgba(22,163,74,0.20)] text-[#F2EDE3]",
};

interface BannerProps extends React.ComponentProps<"div"> {
  variant?: "default" | "reid" | "warning" | "success";
  title: string;
  description?: string;
  icon?: React.ReactNode;
  show?: boolean;
  onHide?: () => void;
  action?: React.ReactNode;
  closable?: boolean;
  autoHide?: number;
}

export function Banner({
  variant = "default",
  title,
  description,
  icon,
  show,
  onHide,
  action,
  closable = false,
  className,
  autoHide,
  ...props
}: BannerProps) {
  React.useEffect(() => {
    if (autoHide && show) {
      const timer = setTimeout(() => onHide?.(), autoHide);
      return () => clearTimeout(timer);
    }
  }, [autoHide, onHide, show]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border text-sm px-4 py-3",
        bannerVariants[variant] || bannerVariants.default,
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon && <div className="flex-shrink-0 opacity-70">{icon}</div>}
          <div className="min-w-0 flex-1">
            <p
              className="font-medium truncate"
              style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}
            >
              {title}
            </p>
            {description && (
              <p className="text-xs opacity-70 mt-0.5" style={{ color: "#7A90A8" }}>
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
          {closable && (
            <button
              onClick={onHide}
              className="p-1 rounded-md transition-colors hover:bg-white/10"
              style={{ color: "#7A90A8" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ============================================================
// 4. GOAL RING
// Save to: src/components/ui/goal-ring.tsx
// Usage: Goals page primary goal hero + Home page mini ring
// ============================================================

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
  const gradIdRef = useRef(`goal-grad-${Math.random().toString(36).slice(2, 6)}`);
  const gradId = gradIdRef.current;

  const sizeMap = { sm: 60, md: 100, lg: 160 };
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
      { duration: 1400, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" }
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
            {/* Track */}
            <circle
              r={radius}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray={`${distHalf} ${distHalf}`}
              strokeLinecap="round"
              transform="rotate(-180)"
            />
            {/* Progress */}
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

        {/* Centre value */}
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

      {/* Label */}
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


// ============================================================
// END OF SPRINT 10 COMPONENTS
// ============================================================
// Installation instructions for Claude Code:
//
// 1. src/components/ui/beams-background.tsx  ← BeamsBackground
// 2. src/components/ui/location-tag.tsx      ← LocationTag  
// 3. src/components/ui/banner.tsx            ← Banner
// 4. src/components/ui/goal-ring.tsx         ← GoalRing
//
// All components are adapted for Reid's design system:
// - Background: #0A1628
// - Text primary: #F2EDE3
// - Text secondary: #C8D5E3
// - Text dim: #7A90A8
// - Accent red: #B91C1C
// - Fonts: Playfair Display italic + Inter
// ============================================================
