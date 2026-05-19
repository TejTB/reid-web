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
        className,
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
              type="button"
              onClick={onHide}
              aria-label="Dismiss"
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
