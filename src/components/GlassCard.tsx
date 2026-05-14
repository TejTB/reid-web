import type { ReactNode } from "react";

export default function GlassCard({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={`home-card ${className}`.trim()}>
      {title && (
        <div className="text-accent text-[10px] uppercase tracking-[0.16em] font-sans font-semibold mb-[10px]">
          {title}
        </div>
      )}
      <div className="text-text-primary">{children}</div>
    </div>
  );
}
