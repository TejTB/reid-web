"use client";
import type { ReactNode } from "react";
import { GlowCard } from "@/components/ui/glow-card";

interface SettingsCardProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export default function SettingsCard({
  label,
  children,
  className = "",
}: SettingsCardProps) {
  return (
    <GlowCard customSize glowColor="red" className={`w-full ${className}`}>
      <div style={{ padding: "24px" }}>
        <p
          className="font-sans"
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#7A90A8",
            marginBottom: 18,
          }}
        >
          {label}
        </p>
        {children}
      </div>
    </GlowCard>
  );
}
