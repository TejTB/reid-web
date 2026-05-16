// Parser for Reid's onboarding-complete closing message. The closing message
// — when Reid emits the sentinel — has this shape:
//
//   [ONBOARDING_COMPLETE]
//   Here is what I heard: ...
//   The real opportunity: ...
//   Your task for tomorrow: ...
//
// The sentinel is the first line. The three labeled sections follow, in
// order. Labels may be followed by content on the same line, or on the
// next line. This parser is forgiving on whitespace + capitalization.

export const ONBOARDING_SENTINEL = "[ONBOARDING_COMPLETE]";

export type OnboardingClose = {
  hasSentinel: boolean;
  heard: string | null;
  opportunity: string | null;
  task: string | null;
  /** Body with sentinel removed, but otherwise unmodified. Falls back to
   *  the whole text when no sentinel is present. */
  body: string;
};

export function parseOnboardingClose(text: string): OnboardingClose {
  const trimmed = text.trim();
  const hasSentinel =
    trimmed.startsWith(ONBOARDING_SENTINEL) ||
    trimmed.includes(ONBOARDING_SENTINEL);
  const body = hasSentinel
    ? trimmed.replace(ONBOARDING_SENTINEL, "").trim()
    : trimmed;
  if (!hasSentinel) {
    return {
      hasSentinel: false,
      heard: null,
      opportunity: null,
      task: null,
      body,
    };
  }
  const heard = extractLabeled(body, /here\s+is\s+what\s+i\s+heard:/i);
  const opportunity = extractLabeled(body, /the\s+real\s+opportunity:/i);
  const task = extractLabeled(body, /your\s+task\s+for\s+tomorrow:/i);
  return { hasSentinel, heard, opportunity, task, body };
}

function extractLabeled(body: string, label: RegExp): string | null {
  const m = body.match(label);
  if (!m || m.index === undefined) return null;
  // Take everything after the label until the next labeled line or EOF.
  const after = body.slice(m.index + m[0].length);
  const nextLabel = after.search(
    /\n\s*(here\s+is\s+what\s+i\s+heard:|the\s+real\s+opportunity:|your\s+task\s+for\s+tomorrow:)/i,
  );
  const slice = nextLabel === -1 ? after : after.slice(0, nextLabel);
  return slice.trim() || null;
}

/** Summary string for the home "YOUR FOCUS" card: the heard line plus the
 *  opportunity line, joined by a blank line. Falls back to body if neither
 *  is extractable. */
export function summaryForHome(close: OnboardingClose): string | null {
  const parts: string[] = [];
  if (close.heard) parts.push(close.heard);
  if (close.opportunity) parts.push(close.opportunity);
  if (parts.length > 0) return parts.join("\n\n");
  return close.body.trim() || null;
}
