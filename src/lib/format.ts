// Relative time formatter used by /chat header subtitle, /tasks "Assigned …",
// and /plan node date stamps. All callers want short, human phrasing — not
// strict Intl.RelativeTimeFormat semantics — so this is intentionally bespoke.
export function relativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "just now";
  const then = new Date(iso);
  const seconds = Math.max(
    0,
    Math.round((now.getTime() - then.getTime()) / 1000),
  );
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks} wk${weeks === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} mo ago`;
}
