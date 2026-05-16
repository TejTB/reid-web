import type { CSSProperties, ReactNode } from "react";

export default function GlassCard({
  children,
  className = "",
  title,
  style,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`home-card ${className}`.trim()} style={style}>
      {title && (
        <div className="text-accent text-[10px] uppercase tracking-[0.16em] font-sans font-semibold mb-[10px]">
          {title}
        </div>
      )}
      <div className="text-text-primary">{children}</div>
    </div>
  );
}
