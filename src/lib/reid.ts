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
    let remaining = 0;
    try {
      const body = (await res.json()) as {
        error?: string;
        remaining?: number;
      };
      remaining = typeof body.remaining === "number" ? body.remaining : 0;
      if (body.error === "daily_limit_exceeded") {
        throw new DailyLimitError(remaining);
      }
    } catch (err) {
      if (err instanceof DailyLimitError) throw err;
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

  // The server may append a trailing marker AFTER the model finishes:
  //   "\x1eREID_ACTIONS:[\"observation_created\",...]\n"
  // It's only present when sentinels fired. To strip it from the yielded
  // prose, we accumulate decoded chunks in `textBuffer` and only yield text
  // that we're sure is BEFORE the marker. A 64-byte holdback covers the case
  // where the marker straddles two network chunks (the marker itself plus
  // its JSON payload is comfortably shorter than that headroom is large).
  const MARKER = "\x1e";
  const PREFIX = "REID_ACTIONS:";
  const HOLDBACK = 64;
  let textBuffer = "";
  let markerSeen = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    textBuffer += decoder.decode(value, { stream: true });

    const markerIdx = textBuffer.indexOf(MARKER);
    if (markerIdx === -1) {
      // No marker yet — emit everything except the trailing HOLDBACK bytes.
      const safeEmitLen = Math.max(0, textBuffer.length - HOLDBACK);
      if (safeEmitLen > 0) {
        yield textBuffer.slice(0, safeEmitLen);
        textBuffer = textBuffer.slice(safeEmitLen);
      }
    } else {
      // Marker found. Yield text up to (but not including) the \x1e, then
      // parse the suffix as the action trailer. Anything after the marker
      // (including a trailing newline) is dropped — the server contract is
      // that the marker is the very last thing on the wire.
      if (markerIdx > 0) yield textBuffer.slice(0, markerIdx);
      const suffix = textBuffer.slice(markerIdx + MARKER.length);
      textBuffer = "";
      markerSeen = true;
      if (suffix.startsWith(PREFIX)) {
        const jsonPart = suffix.slice(PREFIX.length).split("\n")[0];
        try {
          const arr = JSON.parse(jsonPart);
          if (Array.isArray(arr)) {
            options.onActions?.(
              arr.filter((s): s is string => typeof s === "string"),
            );
          }
        } catch {
          // Malformed trailer — ignore. The prose has already been yielded.
        }
      }
      break;
    }
  }

  // Flush any remaining text that was held back by the safety window. Only
  // applies when the stream ended without a marker (the common case).
  if (!markerSeen && textBuffer.length > 0) {
    yield textBuffer;
  }
}
