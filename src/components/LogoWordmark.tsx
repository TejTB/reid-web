type Size = "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-4xl",
};

export default function LogoWordmark({ size = "md", className = "" }: { size?: Size; className?: string }) {
  return (
    <span className={`font-serif tracking-[-0.01em] text-text-primary ${sizeClass[size]} ${className}`}>
      Reid
    </span>
  );
}
