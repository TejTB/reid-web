import type { ReidRequest } from "@/types/chat";

export interface StreamReidOptions {
  /** Called once with the resolved server-side sessionId, taken from the
   *  X-Reid-Session-Id response header, BEFORE the first chunk is yielded. */
  onSession?: (sessionId: string) => void;
  /** Called once with the parsed REID_ACTIONS trailer (e.g.
   *  ["observation_created","goal_updated"]) the server emits after the
   *  model finishes when sentinels fired. The marker line is stripped from
   *  the yielded text stream — callers only see the prose. */
  onActions?: (actionTypes: string[]) => void;
  /** Called once with the resolved sessionId when the server signals that
   *  the session has ended (SESSION_COMPLETE sentinel or 20-message hard
   *  cap). The chat UI uses this to open the recap overlay. */
  onSessionEnd?: (sessionId: string) => void;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Thrown when /api/reid returns 429 with `error: "daily_limit_exceeded"`.
 *  Lets the chat UI distinguish the paywall trigger from a transient blip
 *  so it can open the paywall modal instead of showing "Give me a moment." */
export class DailyLimitError extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super("daily_limit_exceeded");
    this.name = "DailyLimitError";
    this.remaining = remaining;
  }
}

/** Thrown when /api/reid returns 402 with `error: "session_limit_reached"`.
 *  Mirrors DailyLimitError so the chat UI can open the paywall when the user
 *  tries to start a NEW free-tier session beyond their quota. */
export class SessionLimitError extends Error {
  readonly sessionsUsed: number;
  constructor(used: number) {
    super("session_limit_reached");
    this.name = "SessionLimitError";
    this.sessionsUsed = used;
  }
}

/** Thrown when /api/reid returns 429 with `error: "rate_limit_exceeded"` (the
 *  per-minute burst limiter, distinct from the daily quota). Carries the
 *  server's Retry-After so callers can show an honest countdown and a
 *  manual retry instead of blindly re-entering the rate-limit window. */
export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("rate_limit_exceeded");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export async function* streamReid(
  req: ReidRequest,
  options: StreamReidOptions = {},
): AsyncGenerator<string> {
  const res = await fetch("/api/reid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: options.signal,
  });
  if (res.status === 402) {
    let used = 0;
    try {
      const body = (await res.json()) as {
        error?: string;
        sessionsUsed?: number;
      };
      used = typeof body.sessionsUsed === "number" ? body.sessionsUsed : 0;
      if (body.error === "session_limit_reached") {
        throw new SessionLimitError(used);
      }
    } catch (err) {
      if (err instanceof SessionLimitError) throw err;
      // Body wasn't JSON — fall through to the generic error.
    }
    throw new Error(`reid 402`);
  }
  if (res.status === 429) {
    // Capture Retry-After from the header up front (available regardless of
    // whether the body parses); the body's retryAfter field overrides it.
    const headerRetry = Number(res.headers.get("Retry-After"));
    let remaining = 0;
    let retryAfter = Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : 0;
    try {
      const body = (await res.json()) as {
        error?: string;
        remaining?: number;
        retryAfter?: number;
      };
      remaining = typeof body.remaining === "number" ? body.remaining : 0;
      if (typeof body.retryAfter === "number") retryAfter = body.retryAfter;
      // Daily quota → paywall trigger (handled by callers via DailyLimitError).
      if (body.error === "daily_limit_exceeded") {
        throw new DailyLimitError(remaining);
      }
      // Per-minute burst → typed so callers can show an honest countdown +
      // manual retry rather than auto-re-entering the window.
      if (body.error === "rate_limit_exceeded") {
        throw new RateLimitError(retryAfter);
      }
    } catch (err) {
      if (err instanceof DailyLimitError) throw err;
      if (err instanceof RateLimitError) throw err;
      // Body wasn't JSON — fall through to the generic error.
    }
    throw new Error(`reid 429`);
  }
  if (!res.ok || !res.body) throw new Error(`reid ${res.status}`);

  const sessionId = res.headers.get("X-Reid-Session-Id");
  if (sessionId && options.onSession) {
    options.onSession(sessionId);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // The server may append one or more trailing markers AFTER the model
  // finishes. Each marker has the shape:
  //   "\x1e<KEY>:<json>\n"
  // Known keys: REID_ACTIONS, REID_SESSION_END. To strip them from the
  // yielded prose we accumulate decoded chunks in `textBuffer` and only
  // yield text that we're sure is BEFORE the first marker. A 128-byte
  // holdback covers the case where a marker straddles two network chunks.
  const MARKER = "\x1e";
  const HOLDBACK = 128;
  let textBuffer = "";
  let markerSeen = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    textBuffer += decoder.decode(value, { stream: true });

    if (!markerSeen) {
      const markerIdx = textBuffer.indexOf(MARKER);
      if (markerIdx === -1) {
        // No marker yet — emit everything except the trailing HOLDBACK bytes.
        const safeEmitLen = Math.max(0, textBuffer.length - HOLDBACK);
        if (safeEmitLen > 0) {
          yield textBuffer.slice(0, safeEmitLen);
          textBuffer = textBuffer.slice(safeEmitLen);
        }
      } else {
        // First marker found. Yield text up to (but not including) the \x1e,
        // then keep buffering — multiple markers may follow.
        if (markerIdx > 0) yield textBuffer.slice(0, markerIdx);
        textBuffer = textBuffer.slice(markerIdx);
        markerSeen = true;
      }
    }
  }

  if (!markerSeen) {
    // Stream ended without ever seeing a marker — flush the held-back tail.
    if (textBuffer.length > 0) yield textBuffer;
    return;
  }

  // Parse every \x1e<KEY>:<json>\n segment in the trailer buffer.
  const segments = textBuffer
    .split(MARKER)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const seg of segments) {
    const colonIdx = seg.indexOf(":");
    if (colonIdx === -1) continue;
    const key = seg.slice(0, colonIdx);
    const jsonPart = seg.slice(colonIdx + 1).split("\n")[0];
    try {
      const parsed = JSON.parse(jsonPart);
      if (key === "REID_ACTIONS" && Array.isArray(parsed)) {
        options.onActions?.(
          parsed.filter((s): s is string => typeof s === "string"),
        );
      } else if (
        key === "REID_SESSION_END" &&
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { session_id?: unknown }).session_id === "string"
      ) {
        options.onSessionEnd?.((parsed as { session_id: string }).session_id);
      }
    } catch {
      // Malformed trailer — ignore.
    }
  }
}
