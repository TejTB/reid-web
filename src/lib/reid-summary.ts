// Parser for Reid's onboarding-complete closing message.
//
// Two shapes are accepted:
//
// 1. New (Sprint 4+) structured one-liner — what Reid emits today:
//
//      [ONBOARDING_COMPLETE] summary="…one sentence…" task="…one concrete action…"
//
// 2. Legacy labeled block (kept for backward compatibility with historical
//    conversations already persisted):
//
//      [ONBOARDING_COMPLETE]
//      Here is what I heard: ...
//      The real opportunity: ...
//      Your task for tomorrow: ...
//
// `summary`/`task` are the canonical fields going forward.
// `heard`/`opportunity` are populated only when the legacy block is detected.

export const ONBOARDING_SENTINEL = "[ONBOARDING_COMPLETE]";

export type OnboardingClose = {
  hasSentinel: boolean;
  /** New canonical one-sentence summary (structured format), or derived from
   *  the legacy "heard" line when only the old format is present. */
  summary: string | null;
  /** Single concrete next action. Populated from either format. */
  task: string | null;
  /** Legacy: kept so old persisted conversations still parse cleanly. */
  heard: string | null;
  /** Legacy: kept so old persisted conversations still parse cleanly. */
  opportunity: string | null;
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
      summary: null,
      task: null,
      heard: null,
      opportunity: null,
      body,
    };
  }

  // Structured form: summary="…" task="…" — match against the original
  // trimmed text so we don't depend on label order or whitespace.
  const summaryMatch = trimmed.match(/summary="([^"]*)"/i);
  const taskMatchStructured = trimmed.match(/task="([^"]*)"/i);
  let summary: string | null = summaryMatch ? summaryMatch[1].trim() || null : null;
  let task: string | null = taskMatchStructured
    ? taskMatchStructured[1].trim() || null
    : null;

  // Legacy labeled form — fill in whatever the structured match didn't catch.
  const heard = extractLabeled(body, /here\s+is\s+what\s+i\s+heard:/i);
  const opportunity = extractLabeled(body, /the\s+real\s+opportunity:/i);
  const legacyTask = extractLabeled(body, /your\s+task\s+for\s+tomorrow:/i);
  if (!task && legacyTask) task = legacyTask;
  if (!summary) {
    const legacyParts: string[] = [];
    if (heard) legacyParts.push(heard);
    if (opportunity) legacyParts.push(opportunity);
    if (legacyParts.length > 0) summary = legacyParts.join(" ");
  }

  return { hasSentinel, summary, task, heard, opportunity, body };
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

/** Summary string for the home "YOUR FOCUS" card. Prefers the new structured
 *  `summary` field. Falls back to the legacy heard+opportunity pair, then to
 *  the raw body. */
export function summaryForHome(close: OnboardingClose): string | null {
  if (close.summary && close.summary.trim()) return close.summary.trim();
  const parts: string[] = [];
  if (close.heard) parts.push(close.heard);
  if (close.opportunity) parts.push(close.opportunity);
  if (parts.length > 0) return parts.join("\n\n");
  return close.body.trim() || null;
}

/** Pulls a likely first name out of an early user message — "I'm Theo",
 *  "my name is Theo", "I am Theo", "it's Theo". Captures the first
 *  capitalized-looking token after the prefix. Returns null on no match. */
export function extractName(firstUserMessage: string): string | null {
  if (!firstUserMessage) return null;
  const m = firstUserMessage
    .trim()
    .match(/^(?:i'?m|my\s+name\s+is|i\s+am|it'?s)\s+([A-Z][a-z]+)/i);
  if (!m) return null;
  const raw = m[1];
  // Normalize casing — store as "Theo" not "theo" or "THEO".
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}
