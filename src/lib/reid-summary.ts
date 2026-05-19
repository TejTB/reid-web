// Parser for Reid's onboarding-complete closing message.
//
// DEPRECATED for new code paths: as of Sprint 5 the route uses
// `parseSentinels` from `./reid-sentinels` which supersedes
// `parseOnboardingClose` and `summaryForHome`. Those exports are kept here
// because:
//   - the onboarding client still parses raw streamed text for legacy reasons
//   - `extractName` is still the canonical name extractor used by the route
//
// New code should call `parseSentinels` instead.
//
// Two shapes are accepted by the legacy parser:
//
// 1. Structured one-liner:
//
//      [ONBOARDING_COMPLETE] summary="…one sentence…" task="…one concrete action…"
//
// 2. Legacy labeled block (very old persisted conversations):
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

/** @deprecated Use `parseSentinels` from `./reid-sentinels` instead. */
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
 *  the raw body.
 *  @deprecated Use the cleaned `summary` from `parseSentinels` instead. */
export function summaryForHome(close: OnboardingClose): string | null {
  if (close.summary && close.summary.trim()) return close.summary.trim();
  const parts: string[] = [];
  if (close.heard) parts.push(close.heard);
  if (close.opportunity) parts.push(close.opportunity);
  if (parts.length > 0) return parts.join("\n\n");
  return close.body.trim() || null;
}

export function extractName(input: string | Array<{ role: string; content: string }>): string | null {
  const messages = typeof input === "string"
    ? [{ role: "user" as const, content: input }]
    : input.filter((m) => m.role === "user").slice(0, 4);

  for (const msg of messages) {
    if (!msg.content) continue;
    const text = msg.content.trim();

    // Sentence-anchored intro patterns first — these handle the common
    // "I'm Theo, building X" / "I am Theo. Founder of Y" / "This is Theo"
    // forms that the older single regex missed because it required the name
    // to be followed by sentence-end punctuation only.
    const introPatterns: RegExp[] = [
      /^I'?m\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^I am\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^This is\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^([A-Z][a-z]{1,20})\s+here(?=[,.!?\s]|$)/,
    ];
    for (const re of introPatterns) {
      const m = text.match(re);
      if (m) {
        const raw = m[1];
        return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      }
    }

    const phraseMatch = text.match(
      /(?:^|\s)(?:i'?m|i am|my name(?:'s| is)|it'?s|call me)\s+([A-Z][a-z]{1,20})/i,
    );
    if (phraseMatch) {
      const raw = phraseMatch[1];
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
    const firstWord = text.match(/^([A-Z][a-z]{1,20})[.,!\s]/);
    if (firstWord && !["The", "My", "Hi", "Hey", "So", "Ok"].includes(firstWord[1])) {
      const raw = firstWord[1];
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
  }
  return null;
}
