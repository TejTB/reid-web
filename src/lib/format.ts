import type { Goal } from "@/types/db";

// Relative time formatter used by /tasks "Assigned …",
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

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(then: Date, now: Date): boolean {
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  return isSameCalendarDay(then, y);
}

function formatTime12h(d: Date): string {
  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const period = hours24 >= 12 ? "pm" : "am";
  let hours = hours24 % 12;
  if (hours === 0) hours = 12;
  const mm = minutes.toString().padStart(2, "0");
  return `${hours}:${mm}${period}`;
}

/** Subtitle for the chat header's "Last session: …" line.
 *  - same calendar day  → `Today 2:34pm`
 *  - previous calendar day → `Yesterday`
 *  - within 7 days       → `{n} days ago`
 *  - older               → `MMM d`
 *  - null/undefined      → `First session.` */
export function formatLastSession(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "First session.";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "First session.";
  if (isSameCalendarDay(then, now)) {
    return `Today ${formatTime12h(then)}`;
  }
  if (isYesterday(then, now)) return "Yesterday";
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor((now.getTime() - then.getTime()) / dayMs);
  if (diffDays >= 2 && diffDays < 7) return `${diffDays} days ago`;
  return `${MONTHS_SHORT[then.getMonth()]} ${then.getDate()}`;
}

/** Session-divider date label: "May 9" / "Today" / "Yesterday". */
export function formatSessionDate(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  if (isSameCalendarDay(then, now)) return "Today";
  if (isYesterday(then, now)) return "Yesterday";
  return `${MONTHS_SHORT[then.getMonth()]} ${then.getDate()}`;
}

const EN_GB_NUMBER = new Intl.NumberFormat("en-GB");

/** Render a goal-valued number with the goal's unit attached on the correct
 *  side. unit_prefix = true → "£500"; false → "5 clients". Numbers are
 *  formatted via Intl.NumberFormat('en-GB') so thousands get separators and
 *  fractional zeros are dropped. */
export function formatGoalValue(
  goal: Pick<Goal, "unit" | "unit_prefix">,
  value: number,
): string {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = EN_GB_NUMBER.format(safe);
  if (goal.unit_prefix) return `${goal.unit}${formatted}`;
  const unit = goal.unit ? ` ${goal.unit}` : "";
  return `${formatted}${unit}`;
}

/** Goal-event feed timestamp. Today → "2:34pm"; older → "May 16, 4:32pm". */
export function formatEventTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  if (isSameCalendarDay(then, now)) return formatTime12h(then);
  return `${MONTHS_SHORT[then.getMonth()]} ${then.getDate()}, ${formatTime12h(then)}`;
}
