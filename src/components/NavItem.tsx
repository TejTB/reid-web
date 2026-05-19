"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";
import { motion } from "framer-motion";

type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string }
>;

export default function NavItem({
  href,
  label,
  icon: Icon,
  variant,
}: {
  href: string;
  label: string;
  icon: IconComponent;
  variant: "sidebar" | "bottom";
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(`${href}/`);
  const [hovered, setHovered] = useState(false);

  if (variant === "sidebar") {
    const background = active
      ? "rgba(185,28,28,0.06)"
      : hovered
      ? "rgba(255,255,255,0.03)"
      : "transparent";
    const color = active ? "#F2EDE3" : hovered ? "#C8D5E3" : "#7A90A8";

    return (
      <Link
        href={href}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex items-center"
        style={{
          height: 40,
          paddingRight: 14,
          paddingLeft: 16,
          borderRadius: 8,
          background,
          color,
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 14,
          fontWeight: 400,
          transition: "background-color 150ms ease, color 150ms ease",
        }}
      >
        {active && (
          <motion.span
            layoutId="reid-nav-indicator"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              top: 6,
              bottom: 6,
              width: 2,
              borderRadius: 1,
              background: "#B91C1C",
            }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />
        )}
        <Icon size={15} strokeWidth={1.7} style={{ marginRight: 8 }} />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="relative flex flex-col items-center justify-center gap-1 flex-1 transition-colors"
      style={{
        minHeight: 44,
        padding: "8px 4px",
        color: active ? "#B91C1C" : "#7A90A8",
      }}
    >
      {active && (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
          style={{ background: "#B91C1C" }}
        />
      )}
      <Icon size={20} strokeWidth={1.6} />
      <span className="text-[10px] font-medium tracking-[0.04em]">{label}</span>
    </Link>
  );
}
