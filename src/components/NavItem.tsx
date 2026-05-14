"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

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
      ? "rgba(255,255,255,0.06)"
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
          padding: "10px 20px",
          borderRadius: 8,
          background,
          color,
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 14,
          fontWeight: 400,
          transition: "all 150ms ease",
          borderLeft: active
            ? "2px solid #B91C1C"
            : "2px solid transparent",
        }}
      >
        <Icon
          size={16}
          strokeWidth={1.7}
          style={{ marginRight: 10 }}
        />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`relative flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
        active
          ? "text-text-primary"
          : "text-text-dim hover:text-text-secondary"
      }`}
    >
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
      )}
      <Icon size={22} strokeWidth={1.6} />
      <span className="text-[11px] tracking-wide">{label}</span>
    </Link>
  );
}
