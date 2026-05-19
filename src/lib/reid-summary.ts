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

// Known false positives the old firstWord fallback used to surface as names.
// Includes the common opener-verb traps ("Building", "Trying", "Making") plus
// startup-context nouns and discourse markers that would never be a real
// first name. Lowercased so the check is case-insensitive.
const NAME_STOPLIST = new Set([
  // discourse markers / greetings
  "the", "my", "hi", "hey", "so", "ok", "okay", "yeah", "yes", "no", "well",
  "actually", "honestly", "basically", "literally", "currently", "right",
  // hedges & adverbs that follow "I'm" — the "I'm almost ready" trap
  "almost", "nearly", "kind", "kinda", "sort", "sorta", "just", "still", "going",
  "ready", "done", "fine", "good", "great", "happy", "tired", "totally",
  "pretty", "very", "super", "really", "always", "never", "maybe", "probably",
  "trying", "stuck", "lost", "new", "back", "here", "out", "off", "on",
  // common opener verbs (the "Building a SaaS" trap)
  "building", "making", "working", "doing", "thinking", "looking",
  "planning", "starting", "running", "writing", "creating", "developing",
  "selling", "growing", "scaling", "launching", "shipping", "designing",
  "researching", "validating", "testing", "exploring", "considering",
  // pitch nouns
  "founder", "founding", "ceo", "team", "company", "startup", "product",
  "business", "service", "platform", "app", "tool", "idea", "project",
  // grammar fillers
  "an", "a",
]);

/** Returns true when `name` looks like a real first name: 1-20 chars,
 *  alpha-only (with apostrophes/hyphens permitted for "O'Brien" / "Mary-Jane"),
 *  no whitespace, and not on the stoplist of common opener-verb / pitch-noun
 *  false positives. Used at every write site (extractor, sentinel processor,
 *  defensive render) so a bad value can't sneak through. */
export function isPlausibleFirstName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  if (/\s/.test(trimmed)) return false;
  if (!/^[A-Za-zÀ-ÿ'-]+$/.test(trimmed)) return false;
  if (NAME_STOPLIST.has(trimmed.toLowerCase())) return false;
  return true;
}

function normaliseFirstName(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function extractName(input: string | Array<{ role: string; content: string }>): string | null {
  const messages = typeof input === "string"
    ? [{ role: "user" as const, content: input }]
    : input.filter((m) => m.role === "user").slice(0, 4);

  for (const msg of messages) {
    if (!msg.content) continue;
    const text = msg.content.trim();

    // Sentence-anchored intro patterns. These require an explicit "I'm" /
    // "I am" / "This is" / "<Name> here" anchor so we never grab whatever
    // capitalised word happens to lead a sentence.
    const introPatterns: RegExp[] = [
      /^I'?m\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^I am\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^This is\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
      /^([A-Z][a-z]{1,20})\s+here(?=[,.!?\s]|$)/,
    ];
    for (const re of introPatterns) {
      const m = text.match(re);
      if (m) {
        const candidate = normaliseFirstName(m[1]);
        if (isPlausibleFirstName(candidate)) return candidate;
      }
    }

    // NOTE: no `i` flag — with `i`, `[A-Z]` matches lowercase letters too,
    // which turns "i'm almost ready" into a name match for "almost". Connector
    // alternations are spelled out in both cases instead.
    const phraseMatch = text.match(
      /(?:^|\s)(?:[Ii]'?[mM]|[Ii] [aA][mM]|[Mm]y [Nn]ame(?:'s| is)|[Ii][tT]'?[sS]|[Cc]all me)\s+([A-Z][a-z]{1,20})(?=[,.!?\s]|$)/,
    );
    if (phraseMatch) {
      const candidate = normaliseFirstName(phraseMatch[1]);
      if (isPlausibleFirstName(candidate)) return candidate;
    }

    // The old `firstWord` fallback used to fire here. Removed deliberately —
    // it caught any capitalised opener ("Building a SaaS for X" → "Building")
    // and was the root cause of the "Good afternoon, Building." bug.
  }
  return null;
}
